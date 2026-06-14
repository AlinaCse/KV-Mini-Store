const net = require('net');
const path = require('path');
const LRUCache = require('./lruCache');
const TTLManager = require('./ttlManager');
const WALLogger = require('./walLogger');

// parseCommand tokenizes raw TCP strings into command arguments.
function parseCommand(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

// createStore wires cache, TTL, and WAL into one command processor.
function createStore(options = {}) {
  const port = Number(options.port || process.argv[2] || process.env.PORT || 6379);
  const capacity = Number(options.capacity || process.env.CAPACITY || 100);
  const logPath = options.logPath || path.join(__dirname, '..', `wal-${port}.log`);
  const cache = new LRUCache(capacity, (key) => {
    ttl.clearExpiry(key);
    console.log(`[${port}] evicted LRU key: ${key}`);
  });
  const ttl = new TTLManager(cache);
  const wal = new WALLogger(logPath);

  // applySet mutates memory without logging, used by both commands and recovery.
  function applySet(key, value, seconds = null) {
    const evicted = cache.set(key, value);
    if (evicted) ttl.clearExpiry(evicted);
    if (seconds) ttl.setExpiry(key, seconds);
    else ttl.clearExpiry(key);
  }

  // applyDelete mutates memory without logging, used by both commands and recovery.
  function applyDelete(key) {
    return ttl.delete(key);
  }

  // handleCommand implements the text protocol exposed over TCP.
  function handleCommand(line) {
    const args = parseCommand(line);
    const command = (args[0] || '').toUpperCase();

    if (command === 'SET' && args.length >= 3) {
      const key = args[1];
      const exIndex = args.findIndex((arg) => arg.toUpperCase() === 'EX');
      const ttlSeconds = exIndex > -1 ? Number(args[exIndex + 1]) : null;
      const valueEnd = exIndex > -1 ? exIndex : args.length;
      const value = args.slice(2, valueEnd).join(' ');
      if (exIndex > -1 && (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)) return 'ERROR invalid TTL';
      wal.append('SET', key, value, ttlSeconds || '');
      applySet(key, value, ttlSeconds);
      return 'OK';
    }

    if (command === 'GET' && args.length === 2) {
      const key = args[1];
      if (ttl.deleteIfExpired(key)) return 'NULL';
      const value = cache.get(key);
      return value === null ? 'NULL' : value;
    }

    if (command === 'DELETE' && args.length === 2) {
      const key = args[1];
      wal.append('DELETE', key);
      return applyDelete(key) ? 'OK' : 'NOT FOUND';
    }

    if (command === 'KEYS' && args.length === 1) {
      return cache.keys().filter((key) => !ttl.deleteIfExpired(key)).join(' ') || 'NULL';
    }

    if (command === 'EXPIRE' && args.length === 3) {
      const seconds = Number(args[2]);
      if (!Number.isFinite(seconds) || seconds <= 0) return 'ERROR invalid TTL';
      if (!ttl.expireExisting(args[1], seconds)) return 'NOT FOUND';
      wal.append('SET', args[1], cache.peek(args[1]), seconds);
      return 'OK';
    }

    if (command === 'FLUSHLOG' && args.length === 1) {
      wal.flush();
      return 'OK';
    }

    return 'ERROR unknown command';
  }

  wal.recoverFromLog(applySet, applyDelete);
  ttl.startActiveExpiry();
  return { handleCommand, port, ttl };
}

// startServer accepts concurrent TCP clients and responds on the same socket.
function startServer(options = {}) {
  const store = createStore(options);
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) socket.write(`${store.handleCommand(line)}\n`);
    });
  });
  server.listen(store.port, () => console.log(`KV node listening on ${store.port}`));
  return server;
}

if (require.main === module) startServer();

module.exports = { createStore, startServer };

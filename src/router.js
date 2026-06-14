const net = require('net');
const HashRing = require('./hashRing');

const ROUTER_PORT = Number(process.env.ROUTER_PORT || 6378);
const VIRTUAL_NODES = Number(process.env.VIRTUAL_NODES || 3);
const NODES = [
  { id: 'node-6379', port: 6379 },
  { id: 'node-6380', port: 6380 },
  { id: 'node-6381', port: 6381 },
];

const ring = new HashRing(VIRTUAL_NODES);
NODES.forEach((node) => ring.addNode(node.id));
const nodeById = new Map(NODES.map((node) => [node.id, node]));

// keyFromCommand extracts the routing key from a client command.
function keyFromCommand(line) {
  const args = line.trim().split(/\s+/);
  const command = (args[0] || '').toUpperCase();
  if (command === 'KEYS' || command === 'FLUSHLOG') return null;
  return args[1] || null;
}

// sendToNode opens a short TCP hop to the responsible storage node.
function sendToNode(node, line, callback) {
  const client = net.createConnection({ port: node.port }, () => client.write(`${line}\n`));
  let data = '';
  client.setEncoding('utf8');
  client.on('data', (chunk) => {
    data += chunk;
    if (data.includes('\n')) client.end();
  });
  client.on('end', () => callback(null, data.trim()));
  client.on('error', (err) => callback(err));
}

// broadcast sends cluster-wide commands to every simulated node.
function broadcast(line, callback) {
  let pending = NODES.length;
  const replies = [];
  NODES.forEach((node) => {
    sendToNode(node, line, (err, reply) => {
      replies.push(err ? `ERROR ${node.id}` : reply);
      pending -= 1;
      if (pending === 0) callback(replies);
    });
  });
}

// handleRoutedCommand chooses a node by consistent hashing or broadcasts scans.
function handleRoutedCommand(line, socket) {
  const command = line.trim().split(/\s+/)[0]?.toUpperCase();
  const key = keyFromCommand(line);
  if (!key && (command === 'KEYS' || command === 'FLUSHLOG')) {
    return broadcast(line, (replies) => {
      const merged = command === 'KEYS' ? replies.filter((r) => r !== 'NULL').join(' ') || 'NULL' : 'OK';
      socket.write(`${merged}\n`);
    });
  }
  if (!key) return socket.write('ERROR missing key\n');

  const node = nodeById.get(ring.getNode(key));
  return sendToNode(node, line, (err, reply) => {
    socket.write(`${err ? 'ERROR node unavailable' : reply}\n`);
  });
}

// startRouter accepts client TCP connections and forwards commands by key.
function startRouter() {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) handleRoutedCommand(line, socket);
    });
  });
  server.listen(ROUTER_PORT, () => console.log(`KV router listening on ${ROUTER_PORT}`));
  return server;
}

if (require.main === module) startRouter();

module.exports = { startRouter, ring };

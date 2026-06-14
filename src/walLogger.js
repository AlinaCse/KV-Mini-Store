const fs = require('fs');
const path = require('path');

class WALLogger {
  // WAL logger: records mutations before memory changes for crash recovery.
  constructor(filePath = path.join(__dirname, '..', 'wal.log')) {
    this.filePath = filePath;
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '');
  }

  // append synchronously persists intent before the in-memory command executes.
  append(command, key, value = '', ttl = '') {
    const ts = Date.now();
    const safeValue = value === undefined ? '' : String(value).replace(/\s+/g, ' ');
    const line = `${ts} ${command} ${key || ''} ${safeValue} ${ttl || ''}\n`;
    fs.appendFileSync(this.filePath, line);
  }

  // flush truncates the log for operational reset via FLUSHLOG.
  flush() {
    fs.writeFileSync(this.filePath, '');
  }

  // recoverFromLog replays durable commands and skips SETs whose TTL elapsed.
  recoverFromLog(applySet, applyDelete) {
    const lines = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const [tsRaw, command, key, ...rest] = line.trimEnd().split(' ');
      const timestamp = Number(tsRaw);
      const ttlRaw = rest.length > 1 ? rest[rest.length - 1] : '';
      const ttl = Number(ttlRaw);
      const hasTtl = Number.isFinite(ttl) && ttl > 0;
      const valueParts = hasTtl ? rest.slice(0, -1) : rest;
      const value = valueParts.join(' ');

      if (command === 'SET') {
        if (hasTtl && timestamp + ttl * 1000 <= Date.now()) continue;
        const remaining = hasTtl ? Math.ceil((timestamp + ttl * 1000 - Date.now()) / 1000) : null;
        applySet(key, value, remaining);
      } else if (command === 'DELETE') {
        applyDelete(key);
      }
    }
  }
}

module.exports = WALLogger;

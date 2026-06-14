const crypto = require('crypto');

class HashRing {
  // Consistent hash ring: maps keys and node replicas onto one sorted circle.
  constructor(virtualNodes = 3) {
    this.virtualNodes = virtualNodes;
    this.ring = [];
    this.nodes = new Set();
  }

  // hash uses MD5 to create deterministic numeric positions on the ring.
  hash(value) {
    return parseInt(crypto.createHash('md5').update(value).digest('hex').slice(0, 8), 16);
  }

  // addNode creates virtual replicas so keys distribute more evenly.
  addNode(nodeId) {
    if (this.nodes.has(nodeId)) return;
    this.nodes.add(nodeId);
    for (let i = 0; i < this.virtualNodes; i += 1) {
      this.ring.push({ hash: this.hash(`${nodeId}#${i}`), nodeId });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  // removeNode deletes all virtual replicas for a physical node.
  removeNode(nodeId) {
    this.nodes.delete(nodeId);
    this.ring = this.ring.filter((entry) => entry.nodeId !== nodeId);
  }

  // getNode performs clockwise lookup, wrapping to the first ring entry.
  getNode(key) {
    if (this.ring.length === 0) return null;
    const keyHash = this.hash(key);
    let left = 0;
    let right = this.ring.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.ring[mid].hash >= keyHash) right = mid - 1;
      else left = mid + 1;
    }
    return this.ring[left % this.ring.length].nodeId;
  }
}

module.exports = HashRing;

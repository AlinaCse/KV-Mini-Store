class Node {
  // Doubly linked list node: stores cache entry plus O(1) neighbor links.
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class LRUCache {
  // LRU cache: combines a hash map for lookup with a list for recency order.
  constructor(capacity = 100, onEvict = () => {}) {
    this.capacity = capacity;
    this.onEvict = onEvict;
    this.map = new Map();
    this.head = new Node(null, null);
    this.tail = new Node(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // _addToFront implements MRU promotion by inserting after the head sentinel.
  _addToFront(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  // _remove detaches a node in O(1), preserving the rest of the list.
  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
  }

  // _moveToFront records a cache hit/write as the most recent access.
  _moveToFront(node) {
    this._remove(node);
    this._addToFront(node);
  }

  // get performs O(1) lookup and promotes the key to most recently used.
  get(key) {
    const node = this.map.get(key);
    if (!node) return null;
    this._moveToFront(node);
    return node.value;
  }

  // peek performs O(1) lookup without changing recency, useful for scans.
  peek(key) {
    const node = this.map.get(key);
    return node ? node.value : null;
  }

  // set writes in O(1), evicting the least recently used tail entry if full.
  set(key, value) {
    let node = this.map.get(key);
    if (node) {
      node.value = value;
      this._moveToFront(node);
      return null;
    }

    node = new Node(key, value);
    this.map.set(key, node);
    this._addToFront(node);

    if (this.map.size > this.capacity) {
      const victim = this.tail.prev;
      this._remove(victim);
      this.map.delete(victim.key);
      this.onEvict(victim.key, victim.value);
      return victim.key;
    }
    return null;
  }

  // delete removes a key from both index structures in O(1).
  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;
    this._remove(node);
    this.map.delete(key);
    return true;
  }

  // keys returns the current cache index keys; callers filter expiry separately.
  keys() {
    return Array.from(this.map.keys());
  }
}

module.exports = LRUCache;

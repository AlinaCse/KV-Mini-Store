class TTLManager {
  // TTL manager: stores absolute expiry timestamps separately from values.
  constructor(cache) {
    this.cache = cache;
    this.expiryMap = new Map();
    this.interval = null;
  }

  // setExpiry converts relative TTL seconds into an absolute wall-clock deadline.
  setExpiry(key, seconds) {
    this.expiryMap.set(key, Date.now() + seconds * 1000);
  }

  // clearExpiry removes TTL metadata, making a key persistent again.
  clearExpiry(key) {
    this.expiryMap.delete(key);
  }

  // isExpired implements lazy expiry by comparing current time with deadline.
  isExpired(key) {
    const expiresAt = this.expiryMap.get(key);
    return expiresAt !== undefined && Date.now() >= expiresAt;
  }

  // deleteIfExpired removes stale data only when a command touches that key.
  deleteIfExpired(key) {
    if (!this.isExpired(key)) return false;
    this.cache.delete(key);
    this.expiryMap.delete(key);
    return true;
  }

  // expireExisting applies TTL only when the key is currently present and alive.
  expireExisting(key, seconds) {
    if (this.deleteIfExpired(key) || this.cache.peek(key) === null) return false;
    this.setExpiry(key, seconds);
    return true;
  }

  // delete removes both value and TTL metadata for explicit deletes.
  delete(key) {
    const existed = this.cache.delete(key);
    this.expiryMap.delete(key);
    return existed;
  }

  // activeSweep implements active expiry by periodically scanning TTL metadata.
  activeSweep() {
    let removed = 0;
    for (const key of this.expiryMap.keys()) {
      if (this.deleteIfExpired(key)) removed += 1;
    }
    return removed;
  }

  // startActiveExpiry schedules the background expiry loop.
  startActiveExpiry(ms = 10000) {
    this.stopActiveExpiry();
    this.interval = setInterval(() => this.activeSweep(), ms);
  }

  // stopActiveExpiry lets tests or shutdown code release the timer.
  stopActiveExpiry() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }
}

module.exports = TTLManager;

class Cache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Set a cache entry
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttlMs TTL in milliseconds (default 5 minutes)
   */
  set(key, value, ttlMs = 5 * 60 * 1000) {
    // Memory Safety Guard: Cap max entries at 500 to protect 512MB Render free tier
    if (this.cache.size >= 500) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    const expiry = Date.now() + ttlMs;
    this.cache.set(key, { value, expiry });
  }

  /**
   * Get a cache entry
   * @param {string} key 
   * @returns {any|null}
   */
  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  /**
   * Delete a cache key
   * @param {string} key 
   */
  del(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries associated with a cloud account ID
   * @param {string} accountId 
   */
  invalidateAccount(accountId) {
    const prefix = `google:files:${accountId}:`;
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`🧹 Cache cleared for account ${accountId}. Invalidated ${count} entries.`);
  }

  /**
   * Invalidate all photo cache entries associated with a user ID
   * @param {string} userId 
   */
  invalidateUserPhotos(userId) {
    const prefix = `photos_${userId}`;
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`🧹 Photos cache cleared for user ${userId}. Invalidated ${count} entries.`);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }
}

export const fileCache = new Cache();

/**
 * Uniform spatial hash. Rebuilt every simulation step, so `clear()` keeps the
 * bucket arrays around and just empties them — no per-frame allocation churn.
 *
 * Items are stored by reference; body points already exist on each snake's
 * trail, so inserting them costs nothing extra.
 */
export class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize;
    this.buckets = new Map();
  }

  clear() {
    for (const bucket of this.buckets.values()) bucket.length = 0;
  }

  key(cx, cy) {
    // Offset keeps negative world coordinates from colliding with positive ones.
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  insert(x, y, item) {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const key = this.key(cx, cy);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(item);
  }

  /**
   * Visit every item in the cells overlapping the circle (x, y, radius).
   * Return a truthy value from `fn` to stop early; that value is returned.
   */
  forEachNear(x, y, radius, fn) {
    const minX = Math.floor((x - radius) / this.cell);
    const maxX = Math.floor((x + radius) / this.cell);
    const minY = Math.floor((y - radius) / this.cell);
    const maxY = Math.floor((y + radius) / this.cell);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const stop = fn(bucket[i]);
          if (stop) return stop;
        }
      }
    }
    return null;
  }
}

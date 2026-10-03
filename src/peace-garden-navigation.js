// Small, bounded navigation grid shared by every garden companion. Inflated
// obstacles leave room for the animal's body, including diagonals and corners.
export function createGardenNavigation(colliders, radius = 24, clearance = .85) {
  const clear = (x, z) => Math.hypot(x, z) <= radius && colliders.every(c => Math.hypot(x - c.x, z - c.z) >= c.r + clearance);
  const segment = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .2));
    for (let i = 0; i <= n; i++) if (!clear(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
    return true;
  };
  const nodes = [], byKey = new Map();
  for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
    if (clear(x, z)) { const node = { x, z, links: [] }; nodes.push(node); byKey.set(`${x},${z}`, node); }
  }
  for (const a of nodes) for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    const b = byKey.get(`${a.x + dx},${a.z + dz}`); if (b && segment(a, b)) a.links.push(b);
  }
  const nearest = p => nodes.filter(n => Math.hypot(n.x - p.x, n.z - p.z) < 2 && segment(p, n)).sort((a,b) => Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  return { clear, segment, path(from, to) {
    if (!clear(from.x, from.z) || !clear(to.x, to.z)) return [];
    if (segment(from, to)) return [{ x: to.x, z: to.z }];
    const start = nearest(from), end = nearest(to); if (!start || !end) return [];
    const queue = [start], parent = new Map([[start, null]]);
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i]; if (a === end) break;
      for (const b of a.links) if (!parent.has(b)) { parent.set(b, a); queue.push(b); }
    }
    if (!parent.has(end)) return [];
    const path = [{ x: to.x, z: to.z }]; for (let n = end; n; n = parent.get(n)) path.unshift({ x:n.x, z:n.z });
    // Smooth only when the entire segment clears the same collision envelope.
    const result = []; let cursor = from;
    while (path.length) { let i = path.length - 1; while (i > 0 && !segment(cursor, path[i])) i--; cursor = path[i]; result.push(cursor); path.splice(0, i + 1); }
    return result;
  } };
}

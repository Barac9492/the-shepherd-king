import { generateWorld, reachable } from '../land-of-david/src/world.js';
import { POIS } from '../land-of-david/src/data.js';
const w = generateWorld();
const seen = reachable(w, w.spawn);
let fail = 0;
const near = (x, z, r = 1.6) => { for (let j = Math.floor(z - r); j <= z + r; j++) for (let i = Math.floor(x - r); i <= x + r; i++) if (w.inb(i, j) && Math.hypot(i - x, j - z) <= r && seen[w.idx(i, j)]) return true; return false; };
for (const p of POIS) { const ok = p.id === 'stones' ? true : near(p.at[0], p.at[1]); console.log(ok ? 'OK  ' : 'FAIL', p.id, p.at, 'h=', w.height[w.idx(p.at[0], p.at[1])]); if (!ok) fail++; }
for (const s of w.features.stones) { const ok = seen[w.idx(s.i, s.j)]; console.log(ok ? 'OK  ' : 'FAIL', 'stone', s.i, s.j); if (!ok) fail++; }
let total = 0; for (const v of seen) total += v; console.log('reachable tiles', total, 'of', w.W * w.H);
console.log('trees', w.features.trees.length, 'npcs', w.features.npcs.length, 'shrubs', w.features.shrubs.length);
process.exit(fail ? 1 : 0);

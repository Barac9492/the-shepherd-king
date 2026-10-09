// Pure mirror of the renderers' collision-affecting frame tail. Owns only the
// supplied world's blocked array. Call after step -> scripted teleport -> drain.
// Keep the raw Adullam indexing: rounding its fractional spots changes gameplay.
export function createLandCollisions(act, world) {
  const tents = [], segments = (world.features.segments || []).map(sg => ({
    tiles: sg.tiles.map(t => world.idx(t.i, t.j)), pending: [],
  }));
  let revision = 0;
  const set = (k, value) => {
    const before = world.blocked[k];
    world.blocked[k] = value;
    if (before !== world.blocked[k]) revision++;
  };
  function tent(spot, stop) {
    const i = act === 'adullam' ? spot.i : Math.round(spot.i);
    const j = act === 'adullam' ? spot.j : Math.round(spot.j), tiles = [];
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 1; di++) {
      const k = world.idx(i + di, j + dj);
      if (act === 'adullam') set(k, 1);
      else if (!world.blocked[k]) { set(k, 1); tiles.push(k); }
    }
    const rec = { stop, tiles, packed: false }; tents.push(rec); return rec;
  }
  function clear(rec) { for (const k of rec.tiles) set(k, 0); }
  function update(s, david, events = []) {
    // handle() runs before grow() and settleBlocks(). Action-generated events
    // remain queued until the next actual simulation step drains them.
    for (const e of events) {
      if (act === 'ziklag' && e.type === 'burned') for (const rec of tents) clear(rec);
      if (act === 'hebron' && e.type === 'segment') segments[e.order].pending = segments[e.order].tiles.slice();
    }
    const L = s.layout;
    const mine = act === 'herut' ? tents.filter(t => t.stop === s.stop) : tents.slice();
    let want = 0;
    if (act === 'adullam') want = Math.min(L.tentSpots.length, Math.floor(s.joined / 45));
    if (act === 'herut' && s.act === 'play' && s.phase === 'play') want = Math.min(L.tentSpots.length, Math.floor(s.stopT / 6));
    if ((act === 'ziklag' && s.act === 'build' || act === 'hebron' && s.act === 'settle') && s.phase === 'play') want = Math.min(L.tentSpots.length, Math.floor(s.t / 9));
    while (mine.length < want) {
      const spot = L.tentSpots[mine.length];
      if (act !== 'adullam' && Math.hypot(david.x - (spot.i - world.W / 2), david.z - (spot.j - world.H / 2)) < 2.6) break;
      mine.push(tent(spot, s.stop));
    }
    if (act === 'herut' && (s.phase === 'leaving' || s.act !== 'play')) {
      for (const rec of mine) if (!rec.packed) { rec.packed = true; clear(rec); }
    }
    if (act === 'hebron') for (const sg of segments) for (let n = sg.pending.length - 1; n >= 0; n--) {
      const k = sg.pending[n], x = k % world.W - world.W / 2, z = Math.floor(k / world.W) - world.H / 2;
      if (Math.hypot(david.x - x, david.z - z) < 0.9 || s.crews.some(c => Math.hypot(c.x - x, c.z - z) < 0.9)) continue;
      set(k, 1); sg.pending.splice(n, 1);
    }
  }
  return { update, get revision() { return revision; } };
}

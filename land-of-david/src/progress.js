// Hub progress: which acts are done and how much of the map has been found.
// Pure functions so the title screen, HUD and tests share one definition.
export const ACT1_KEY = 'david-adullam-v1';

export function act1Best(storage) {
  try { const n = Number(storage.getItem(ACT1_KEY)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  catch { return 0; }
}

export function regionProgress(discovered, pois) {
  const out = {};
  for (const p of pois) {
    const r = (out[p.region] ||= { found: 0, total: 0 });
    r.total += 1;
    if (discovered.has(p.id)) r.found += 1;
  }
  return out;
}

export function journeyComplete(discovered, pois) {
  return pois.every((p) => discovered.has(p.id));
}

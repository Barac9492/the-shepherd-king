// Hub progress: which acts are done and how much of the map has been found.
// Pure functions so the title screen, HUD and tests share one definition.
export const ACT1_KEY = 'david-adullam-v1';
export const ACT2_KEY = 'david-herut-v1';
export const ACT3_KEY = 'david-ziklag-v1';
export const ACT4_KEY = 'david-hebron-v1';

export function act1Best(storage) {
  try { const n = Number(storage.getItem(ACT1_KEY)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  catch { return 0; }
}

const readCount = (storage, key) => { try { const n = Number(storage.getItem(key)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch { return 0; } };
export const act2Best = (storage) => readCount(storage, ACT2_KEY);
export const act3Best = (storage) => readCount(storage, ACT3_KEY);
/** Act 4 saves JSON: { joined, best } where best is the build time in seconds (lower is better). */
export function act4Record(storage) {
  try { const v = JSON.parse(storage.getItem(ACT4_KEY)); return v && Number.isFinite(v.best) && v.best > 0 ? { joined: Math.max(0, Math.round(v.joined) || 0), best: v.best } : null; }
  catch { return null; }
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

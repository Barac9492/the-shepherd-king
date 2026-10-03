// Creative garden activities, not additional events in the biblical story.
export const GARDEN_ACTIVITIES = {
  lamb: { home: [-5, 6], steps: [{ x: -15, z: 1 }], kind: 'escort' },
  lion: { home: [11, 0], steps: [{ x: 12, z: 8 }, { x: 5, z: 14 }], kind: 'stroll' },
  wolf: { home: [0, -14], steps: [{ x: -13, z: -11 }, { x: 10, z: -10 }], kind: 'seek' },
};
export const GARDEN_JOURNAL_KEY = 'david-peace-garden-v1';

// This small local journal never reads or writes the historical chapter key.
// Denied/full storage still permits all activities for the current page session.
export function createGardenJournal(storage) {
  let source, persistent = !!storage;
  try { source = JSON.parse(storage?.getItem(GARDEN_JOURNAL_KEY) || 'null'); } catch { persistent = false; }
  const entries = Object.fromEntries(Object.entries(GARDEN_ACTIVITIES).map(([kind, activity]) => {
    const saved = source?.version === 1 ? source.animals?.[kind] : null;
    const step = Number.isInteger(saved?.step) && saved.step >= 0 && saved.step <= activity.steps.length ? saved.step : 0;
    return [kind, { met: saved?.met === true || step > 0, step, friend: step === activity.steps.length }];
  }));
  const save = () => {
    try { storage?.setItem(GARDEN_JOURNAL_KEY, JSON.stringify({ version: 1, animals: entries })); persistent = !!storage; } catch { persistent = false; }
  };
  return {
    get persistent() { return persistent; },
    get(kind) { return entries[kind]; },
    meet(kind) { const entry = entries[kind]; if (!entry.met) { entry.met = true; save(); return true; } return false; },
    advance(kind) {
      const entry = entries[kind];
      if (!entry.friend) { entry.met = true; entry.step++; entry.friend = entry.step === GARDEN_ACTIVITIES[kind].steps.length; save(); }
      return entry;
    },
  };
}

# Storybook character assets

These GLBs and procedural accessor layers are original artwork authored for **The Shepherd King**. The GLBs are generated deterministically by `scripts/build-storybook-assets.mjs` using Three.js r160 and GLTFExporter. No downloaded, paid, traced, or third-party character art is included.

## Files

- `david.glb`: original high-detail young David with the legacy named pivots.
- `sheep.glb`: the only upgraded quadruped asset; donkey, ibex, and lion stay legacy.
- `manifest.json`: generated sizes, triangle counts, pivot names, and the runtime human contract.
- `src/character-art.js`: shared six-mesh stylized human layers for all ten chapters.

## Runtime contract

Call `await loadStorybookAssets()` once. Then `createStorybookHuman(baseHuman, options, { role })` is synchronous and returns the same `makeHuman(...)` object. It keeps root/body/limb/head/hand pivots, scale, update state, poses, staff/shield, and later hand props. It reconstructs the supported legacy beard, crown, armor, cloak, cloth headcover, turban, helmet, palette, simple, and scale contracts. Unknown hat values retain the original merged legacy head and are marked `partial-legacy-head` in metadata. Shared geometry uses `userData.keepGeo` so chapter cleanup cannot dispose the cache. The system reuses existing pose animation only; it does not claim authored animation or IK.

`createStorybookDavid(...)` remains available for the original high-detail young-David GLB, and `createStorybookSheep(...)` remains limited to original sheep.

## Generated budgets

- Runtime human: at most 6 visual meshes and one shared vertex-color material per character; simple/crowd characters collapse static legs into the body for a 4-mesh LOD.
- David GLB: 6,932 triangles, 26 meshes, 519,368 bytes.
- Sheep GLB: 2,984 triangles, 10 meshes, 222,488 bytes.

Rebuild GLBs and metadata with `node scripts/build-storybook-assets.mjs`.

# Storybook character assets

These GLBs are original procedural artwork authored for **The Shepherd King**. They are generated deterministically by `scripts/build-storybook-assets.mjs` using Three.js r160 and GLTFExporter. No downloaded, paid, traced, or third-party character art is included.

## Files

- `david.glb`: young David with a folded tunic, woven sash, swept sculpted hair, readable face, sandals, hands, and crook staff.
- `sheep.glb`: rounded clustered wool silhouette, articulated head, ears, muzzle, tail, and four named leg pivots.
- `manifest.json`: generated sizes, triangle counts, mesh counts, and pivot names.

## Runtime contract

Use `src/storybook-assets.js`. Call `await loadStorybookAssets()` once, then pass an existing `makeHuman(...)` result to `createStorybookDavid(...)` or an existing `makeQuadruped('sheep', ...)` result to `createStorybookSheep(...)`. The adapters keep the existing controller/root objects, graft in shared GLB geometry, preserve David's hand/staff attachment transforms, and mark shared geometry with `userData.keepGeo` so chapter cleanup does not dispose cached assets.

## Generated budgets

- David: 6,932 triangles, 26 meshes, 519,372 bytes.
- Sheep: 2,984 triangles, 10 meshes, 222,488 bytes.

Rebuild with `node scripts/build-storybook-assets.mjs`.

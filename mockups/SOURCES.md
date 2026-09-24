# Executable graphics pipeline mockup

This is a separate technical prototype, not a replacement of the ten-chapter game.

## Real imported assets
- Quaternius, RPG Character Pack, Wizard.gltf: https://quaternius.com/packs/rpgcharacters.html
  CC0 1.0. Exact supplied license is retained in assets/character/LICENSE.txt. 32 joints, 15 animation clips, 5,376 triangles. Wizard clothes are a fantasy placeholder, not a historical David design.
- Poly Haven Modular Fort 01, Rico Cilliers: https://polyhaven.com/a/modular_fort_01
- Poly Haven Wooden Table 02, Serhii Khromov: https://polyhaven.com/a/wooden_table_02
- Poly Haven Cobblestone Floor 01, Rob Tuytel: https://polyhaven.com/a/cobblestone_floor_01
  All Poly Haven assets above: CC0 https://polyhaven.com/license
  Exact file download provenance retained at assets/environment-source/sources.json.

## Code and techniques
- Three.js r160, MIT: https://github.com/mrdoob/three.js/tree/r160
  GLTFLoader, AnimationMixer, OrbitControls, RoomEnvironment. License retained at ../vendor/THREE-LICENSE.txt.
- Original palace layout, extruded structural arches and prototype UI authored for this mockup.
- Background color + depth caching is independently implemented. Conceptual reference: https://github.com/justinmeiners/pre-rendered-backgrounds (GPL code was not copied).

## What is / is not implemented
A loads real textured architecture and furniture, plus a skinned character with authored clips. B caches the background color and depth in a render target and renders the moving character on top with depth occlusion. B is a runtime proof of the pre-render technique, not an offline Cycles/GI bake. Both modes intentionally target the same visual scene, not different color styles.

The cached mode currently still downloads and retains the source 3D environment. Draw-call reduction is real; download-size/GPU-memory reduction is NOT claimed. There is no chapter logic, historic costume, navigation mesh, production collision or phone performance approval. Movement is confined to a simple prototype rectangle.

The CryEngine-licensed Sponza sample was examined but NOT used.

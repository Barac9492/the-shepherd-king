# The Shepherd King (다윗)

다윗의 삶을 따라가는 3D 싱글플레이 성경 게임입니다. 브라우저에서 바로 실행되며 컴퓨터와 휴대폰 모두 지원합니다.

## 네 개의 장
1. 베들레헴의 목동 (사무엘상 16–17장): 양 모으기, 사자 쫓기, 사무엘의 기름 부음
2. 엘라 골짜기 (사무엘상 17장): 시냇가의 돌 다섯 개, 골리앗과의 싸움
3. 엔게디의 굴 (사무엘상 24장): 사울의 군사를 피해 숨어 가기, 사울을 살려 주기
4. 예루살렘으로 올라가는 궤 (사무엘하 6장): 궤를 모시고 행렬을 이끌며 춤추기

한국어가 기본이며 영어로 전환할 수 있습니다. 한국어 성경 구절은 어린이가 읽기 쉽게 풀어 썼고, 영어는 흠정역(KJV)을 사용합니다.

## 실행
정적 웹 앱입니다. `index.html`, `src/`, `vendor/`, `assets/`를 함께 호스팅하세요. ES 모듈과 GLB 로딩을 사용하므로 파일을 직접 여는 대신 아래 로컬 서버로 실행합니다.

## Chapter 1 storybook graphics preview

This branch adds a bounded Chapter 1 art pass. Chapters 2–4 retain their original
rendering/characters. Gameplay rules, terrain heights, collisions, dialogue, and
progression are unchanged.

- Original GLB David and sheep, generated from source in `scripts/build-storybook-assets.mjs`.
- Folded tunic, swept hair, sandals, upright crook, rounded wool, grazing head motion.
- Instanced olive variants, limestone walls, curved grass beds, path-edge detail.
- Softer terrain shading, warm/cool lighting, contact grounding, distant haze.
- Chapter 1 exploration camera protects against terrain occlusion. Sling aiming is unchanged.
- Three.js r160 and GLTFLoader are vendored locally with the upstream MIT license.

### Run and review

```sh
npm ci
npm run dev
# http://127.0.0.1:43871
npm test
npm run test:browser
```

The browser test uses macOS Chrome by default. Set `CHROME_PATH` to a Chromium
executable on another machine. `BASE_URL` can target a deployed preview.

Review URLs (explicitly staged, paused art views, not gameplay recordings):

- `/?review=fold`: sheepfold composition
- `/?review=david`: character close-up
- `/?review=vista`: landscape
- `/?review=gameplay`: normal exploration camera
- Add `&graphics=legacy` for the original art with the same review setup.
- `/` starts the actual game. Review mode never changes saved progress.

### Scope and limitations

This is an art-direction slice, not a claim of reference-video parity. Character
locomotion still uses the existing procedural pose system, not authored skeletal
clips or foot IK. No paid assets or third-party art were imported. The two GLBs
total about 742 KB uncompressed. All four chapters are still built procedurally.

Automated touch emulation checks layout and rendering, not physical-phone speed.
A 30 fps phone target still needs validation on a named physical device. Headless
SwiftShader results are correctness checks, not hardware FPS evidence.

See `assets/storybook/README.md` for provenance and mesh budgets. Rebuild assets
with `npm run build:assets`. Rendering modules explicitly dispose chapter-owned
resources and preserve cached GLB geometry across reloads.

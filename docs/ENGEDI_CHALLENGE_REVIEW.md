# 엔게디 챌린지 — 로컬 시제품

시작 화면의 **엔게디 챌린지**에서 독립 동굴 장면으로 들어갑니다. 사무엘상 24장의 겉옷 자락 장면을 바탕으로 속도를 조절하는 짧은 게임입니다. 다윗의 믿음은 사울을 해칠 기회에도 해치지 않고 하나님께 판단을 맡긴 선택으로 설명합니다. 옷자락을 잘라 얻는 시간 기록은 조작 기록이며 신앙의 성취를 평가하지 않습니다. 도입·결말은 한국어와 영어를 지원합니다.

- 기반: 최초 복제 시 최신 main `e22a3ba`.
- 독립 브랜치: `codex/engedi-local-prototype`.
- 작업 중 main `99a053d`의 물맷돌 top10 배포 소식을 받음. 해당 변경이나 동시 진행 중인 댄스 작업을 가져오거나 수정하지 않았음. 통합 시 최신 main을 기준으로 두 기능을 보존해야 함.
- 원격 push / PR / merge / 배포 / 외부 DB 작업 없음.

## 규칙과 조작

터치 또는 마우스로 아래 패드를 누르고 좌우로 움직입니다. 위치로 속도를 정하며 압력을 읽지 않습니다. A/왼쪽 화살표는 느리게(25), 스페이스는 보통(60), D/오른쪽 화살표는 빠르게(100) 자릅니다. 키를 누르는 동안만 동작합니다. 여러 키는 마지막에 누른 키가 우선합니다.

빠르면 진행과 경계가 함께 늘어나고, 느리면 조금씩 진행하면서 경계가 회복됩니다. 손을 떼면 진행은 멈추고 경계가 더 빨리 회복되지만 시간은 계속 흘러갑니다. 금빛 실밥 세 구간은 매번 같은 위치이며 빠르게 지나가면 경계가 더 가파르게 오릅니다. 경계 100이면 실패, 길이 100%면 성공입니다. 같은 판정에서 둘 다 도달하면 실패가 우선합니다. 최대 2분입니다.

기록은 페이지 메모리의 이번 방문 최고만 유지합니다. 새로고침하면 없어집니다. localStorage, 쿠키, API, 온라인 순위, 계정, DB를 사용하지 않습니다. 이야기 진행 저장도 바꾸지 않습니다.

## 기록 정밀도와 중단 정책

`src/engedi-challenge-core.js`는 DOM/RNG 없는 정수 연산으로 동작하며 판정은 고정 10ms입니다. UI의 `21.580` 같은 세 자리 소수 표시는 형식이며 1ms 판정이나 기기 간 완벽한 공정성을 보장하지 않습니다. 입력 전환은 다음 판정 틱에 반영됩니다. 프레임 사이 남은 시간은 누적합니다. 의존성 없는 핵심 함수는 향후 입력 틱 기록을 재생하는 서버 검증에 사용할 수 있지만 이번 시제품에는 검증 서버를 만들지 않았습니다.

창 blur, pagehide, visibility hidden, 방향 전환, Escape/일시정지, WebGL 컨텍스트 손실, 250ms 초과 프레임 간격은 시도를 무효 처리합니다. 기록에 반영하지 않고 재도전을 안내합니다. 백그라운드에서 시간이 멈추거나 경계가 공짜로 회복되는 유리함이 생기지 않습니다. pointerup/pointercancel/lostpointercapture는 입력만 풀고 계속 시간을 셉니다. 느린 기기에서도 긴 프레임 중단은 무효가 되므로 실제 휴대폰 체감 검증이 필요합니다.

## 구현과 통합

- `src/engedi-challenge.js`: 모드 수명, 입력, UI, 방문 최고 기록. 열 때 이벤트를 등록하고 닫을 때 AbortController로 해제합니다.
- `src/engedi-challenge-core.js`: 정수 틱 판정, 고정 실밥, 기록 형식, 프레임 중단 판정.
- `src/engedi-challenge-world.js`: 기존 `makeHuman`, 다윗 설정, 이야기 스타일 재사용. 새 동굴 지오메트리는 기존 chapter cleanup, 이 모드가 만든 재질은 자체 cleanup으로 정리합니다. 공유 캐릭터 재질은 폐기하지 않습니다.
- `src/engedi-challenge.css`: 320/390/데스크톱 대응. 진행/경계/속도는 색 외의 숫자와 문구로도 표시합니다.
- `index.html`: 스타일 1줄과 모드 설치 2줄만 추가합니다. 기존 이야기와 물맷돌 파일은 변경하지 않습니다.

## 재현

```sh
npm ci
PORT=44026 npm run dev
# http://127.0.0.1:44026 → 엔게디 챌린지
node --test tests/engedi-challenge-core.test.mjs
BASE_URL=http://127.0.0.1:44026 npm run test:engedi
BASE_URL=http://127.0.0.1:44026 TEN_CHAPTER_FILTER='chapter 5' npm run test:chapters
```

Chrome 기본 경로는 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`입니다. `CHROME_PATH`, `SOFTWARE=1`을 기존 검증 방식과 동일하게 지원합니다. 스크린샷/결과 JSON/로그는 `test-results/engedi/`에 생성합니다.

## 검증 증거

- 관련 단위·소스 회귀 257개 통과. 새 핵심 테스트 6개 포함. 원격 DB 관련 테스트와 별도 기존 전체 브라우저 테스트는 이 수치에 포함하지 않음.
- 순수 코어 실밥 대응 전략: **21.580초** 성공. 느리게만 자르기: **37.740초** 성공. 빠르게만 자르기: 경계 100 실패.
- 최종 실제 시간 브라우저 완주: **21.690초**, pageerror 0건.
- 새 브라우저 시나리오 12개: 실제 시간 완주/실패, 키 해제와 시간 계속, 재시작, 방문 최고 기록, Escape/blur/숨김/300ms 프레임 중단 무효, 반복 입출장의 이벤트·지오메트리·재질 cleanup, 새로고침 초기화, 320px·390px 배치, 실제 터치 드래그/해제, 합성 pointercancel/lostpointercapture/두 번째 포인터, 언어 전환, 이야기 5장 및 물맷돌 복귀.
- 기존 5장 지원형 회귀: 노출 위치 경계 상승, 안전 위치 미탐지, 겉옷 자락 상호작용 통과. 이동 보조/텔레포트가 있는 검사이며 사람의 전체 이야기 완주를 뜻하지 않음.
- 엔게디만의 API 요청 0건. 전체 브라우저 시나리오에서 기존 물맷돌 복귀 시 `GET /api/sling-challenge/record` 1건만 발생. POST 없음.
- 기본 browse 실행기는 WebGL 컨텍스트 생성에 실패하여 저장소의 기존 Chrome/Playwright + Apple Metal 경로로 검증함.

실물 iOS/Android 장치, 장시간 발열/성능, 사람의 게임 재미 평가, 최신 main과 최종 통합은 남아 있습니다. 온라인 보안/순위 공정성 검증은 이 로컬 시제품의 범위가 아닙니다.

## 화면

[데스크톱 플레이](engedi-review/desktop-playing.png) · [320px 플레이](engedi-review/mobile-320-playing.png) · [390px 플레이](engedi-review/mobile-390-playing.png) · [성공과 결말](engedi-review/desktop-success.png) · [브라우저 결과 JSON](engedi-review/report.json)

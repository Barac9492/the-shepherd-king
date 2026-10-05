# 다윗의 춤 — 로컬 시제품

시작 화면의 **다윗의 춤 · 시편 23편** 또는 `/dance.html`에서 실행합니다. `PORT=44025 npm run dev`로 독립 서버를 켜면 `http://127.0.0.1:44025/dance.html`입니다.

## 구현 범위

- 한국어 연습(본문 표시) / 도전(본문 숨김), 시편 23:1–6 한 절씩 직접 입력.
- 정답마다 춤·반짝임·음표·리본·양 친구가 한 단계씩 늘고, 6절 완주에 동물 친구 축제.
- NFC 한글 정규화 후 공백·유니코드 문장부호만 무시. 다른 글자·숫자·기호는 오답이며 삽입/삭제/교체 위치를 표시. 오답을 고쳐서 재제출 가능.
- IME 조합 중 제출 차단. Enter는 줄바꿈, Ctrl/⌘+Enter는 조합 종료 후 제출. 성공과 다음 절 전환을 분리하여 중복 클릭에 안전.
- 각 절 첫 제출의 편집거리 정확도 0–100점, 힌트 사용 시 30점 차감(0점 하한), 힌트 없이 한 번에 맞힌 연속 성공 수 × 10점, 완주 300점. 만점 1110점. 속도/시간 항목 없음.
- 도전 완주만 `david-dance-local-v1` localStorage에 최근 시각과 점수 저장, TOP 5. 이름·음성·영상·입력문은 저장하지 않음. 연습/중단은 저장하지 않음. 저장 불가 시 현재 화면에서 결과 확인.
- 기본 음소거. 직접 켠 경우 Web Audio 사인파로 만든 짧은 음만 재생. 탭 비활성화/페이지 종료 시 AudioContext를 닫음. CSS 애니메이션은 reduced-motion 존중.
- 별도 페이지: 원래 Game 인스턴스 및 3D 리소스는 탐색 시 브라우저 페이지 수명에 따라 정리됨. 기존 스토리/산책/정원/물맷돌 모듈 및 서버·DB 파일 무변경.
- 모드 전환/재시작/나가기의 진행 취소 대화상자, Escape 취소와 초점 복원. 모바일 성공 시 무대를 보여준 후 다음 절 입력으로 이동.

온라인 랭킹, 원격 DB 쓰기, 복붙/조작 방지 보장, 신앙 평가, 빈칸·단어 조합 모드는 포함하지 않습니다. 일러스트는 이 시제품에서 작성한 SVG이며 외부 이미지/음악을 다운로드하지 않습니다.

## 본문 및 권리 확인 (2026-10-05)

기존 `src/psalm23.js`와 `docs/psalm23-provenance.md`를 확인했습니다. 기존 게임 마지막 장의 정확한 인용 본문은 **성경전서 개역한글판 (1961)**입니다. 초기 이야기의 ‘쉬운 말 풀이’ 또는 현대 역본은 암송 정답으로 사용하지 않았습니다.

1. 대한성서공회 [저작권 안내](https://www.bskorea.or.kr/bbs/content.php?co_id=subpage2_3_4_1)의 표에 개역한글판 발행일 1961-07-10, 저작재산권 보호기간 소멸일 2011-12-31이 명시되어 있습니다. 같은 안내의 저작자 표시/동일성 유지 취지를 따라 출처를 표시하고 단어·철자를 바꾸지 않았습니다. 이 확인은 개역개정/새번역 등 현대 역본으로 확대 적용하지 않습니다.
2. [공식 시편 23편 원문](https://www.bskorea.or.kr/bible/korbibReadpage.php?linkBible=BHANpsa023003)의 여섯 절 전체와 기존 배열을 대조했습니다. 특히 `내가`, `쉴만한 물 가으로`, `다닐찌라도`, `정녕`을 보존했습니다. eBible 한국어 자료는 별도 역본 표기와 4절 철자가 달라 사용하지 않았습니다.
3. 정답은 기존 `PSALM23.ko`를 직접 import합니다. AI가 만든 의역이나 별도의 복사 본문은 없습니다. 화면 본문과 정답은 같은 배열을 사용합니다. 공백·문장부호 허용은 입력 판정에만 적용됩니다.
4. 화면의 출처: “성경전서 개역한글의 저작권은 대한성서공회에 있습니다.” 본문/권리 안내 링크와 역본·연도도 명시했습니다.
5. 시편 23편의 표제 ‘다윗의 시’를 공식 원문에서 확인했습니다. 춤의 근거는 사무엘하 6:14이며, 암송 성공과 춤/동물 축제의 연결은 창작 게임 설정임을 화면에 명시했습니다.

## 브랜치와 통합

독립 clone: `/Users/ethancho/Documents/Codex/2026-10-05/task-5/david-dance`

로컬 브랜치: `prototype/david-dance`. 시작점: fresh origin/main `e22a3ba673fc277968cbb9dbd1b0e85f4c8be824` (PR #15).

기존 코드 변경은 `index.html`의 시작 화면 링크와 그 링크 전용 스타일뿐입니다. 물맷돌 top10 작업의 폴더/브랜치/DB/운영은 접근하거나 변경하지 않았습니다. 작업 종료 전 읽기 전용 fetch로 최신 main `99a053de10a378c54f9aa333e4905d95491a7ccb` (PR #16 top10)을 확인했습니다. **향후 별도 통합이 필요합니다.** 이 로컬 브랜치를 그대로 main 위에 덮어쓰면 안 됩니다. 새 파일들을 옮기고 `index.html`에서 인접한 `bChallengeRanking` 버튼과 `bDance` 링크를 모두 보존해야 합니다. `package.json`도 기존 새 랭킹 검사 명령과 `test:dance`를 함께 유지해야 합니다. 서버/DB/물맷돌 모듈은 이 브랜치의 옛 파일로 교체하지 마세요. 통합 후 최신 main의 전체 회귀 검사를 다시 실행해야 합니다. 이 작업에서는 push/PR/merge/deploy를 실행하지 않았습니다.

## 검증 실행

```sh
node --test tests/david-dance.test.mjs
PORT=44025 npm run dev
BASE_URL=http://127.0.0.1:44025 node scripts/check-david-dance.mjs
npm test
```

브라우저 검사 결과와 실제 렌더링 스크린샷은 `test-results/david-dance/`에 저장됩니다. 해당 폴더는 저장소의 기존 ignore 규칙을 따릅니다. 확정 결과는 아래 검증 기록에 추가합니다.

IME 자동 검사는 composition 이벤트와 실제 브라우저 키 입력을 사용합니다. 실제 macOS/iOS/Android 한국어 키보드 및 물리 기기의 성능을 대신하지 않습니다. 모바일 가상 키보드는 viewport 축소로 검사합니다. 입력창/버튼/화면 넘침과 터치 이벤트를 검증하되 실제 OS 키보드 시각 배치는 별도 확인이 필요합니다.

## 실제 화면 및 시제품 검증 결과

- 새 단위 검사 7/7 통과 (문자 차이 정렬, NFC/공백/문장부호, 중복 제출/다음 절, 점수, 힌트, 저장 실패).
- 시제품 브라우저 검사 14/14 통과. Chrome 154, 데스크톱 1280px와 터치 320/390px. 페이지 오류 0, 시제품 외부 네트워크 요청 0. 원래 게임의 Google Fonts 요청은 별도 페이지이므로 해당 집계에서 제외했습니다.
- 긴 4절, 모바일 viewport 축소(키보드 공간 모사), 오답 후 수정, IME 이벤트/Enter/Ctrl+Enter, 중복 클릭, 대화상자 Tab/Escape/취소, 모드 전환, 재시작, 완주, 재접속 저장, 저장 차단, 기록 삭제, 음소거/AudioContext 종료, reduced-motion, 메인 복귀/스토리 저장 보존을 확인했습니다.
- [14개 검사 상세 JSON](david-dance/browser-report.json)
- [데스크톱 연습](david-dance/desktop-practice.png) · [데스크톱 완주 축제](david-dance/desktop-festival.png) · [390px 완주](david-dance/mobile-390-festival.png) · [320px 긴 4절](david-dance/mobile-320-long-verse.png)

기존 전체 검사 첫 실행은 **289개 중 285 통과, 3 실패, 1 취소**였습니다. 산책 15/15, 평화정원 19/19, 물맷돌 14/14의 각 브라우저 동작 결과는 모두 통과/오류 없음으로 출력됐으나 브라우저 종료 단계에서 하위 프로세스가 끝나지 않아 세 래퍼가 시간 초과되었습니다. 초기 로딩도 9개 하위 검사가 통과한 뒤 종료 시간 초과로 취소됐습니다. 10장 assisted runtime과 My Shepherd/release runtime은 통과했습니다. 원본 전체 로그: `test-results/david-dance/full-suite-first-run.log`. 전체 검사 명령이 정상 통과했다고 표현하지 않습니다.


### 종료 문제 분리 및 재검증

Chrome 종료 전에 남은 Playwright context를 먼저 닫도록 하는 [로컬 QA 보조 모듈](david-dance/qa-close-contexts.mjs)을 사용해 실패/취소된 네 개 래퍼만 재실행했습니다. 게임 코드 및 기존 검사 파일/단언은 변경하지 않았고, 오류를 무시하거나 성공으로 변환하지도 않았습니다.

```sh
NODE_OPTIONS="--import=./docs/david-dance/qa-close-contexts.mjs" node --test \
  tests/david-exploration-runtime.test.mjs \
  tests/peace-garden-runtime.test.mjs \
  tests/sling-challenge-runtime.test.mjs \
  tests/initial-loading-runtime.test.mjs
```

재검증 결과 **13/13 통과, 실패 0, 취소 0, 정상 종료** (네 개 상위 테스트와 초기 로딩의 9개 하위 테스트 포함, 283.6초). 산책 15개, 정원 19개, 물맷돌 14개 동작 검증과 초기 로딩 9개 시나리오가 보존됐습니다. 별도로 software rendering + 로컬 모의 서버에서도 물맷돌 14개 동작 결과가 통과했습니다. 로그는 `test-results/david-dance/regression-recheck.log`와 `sling-software.log`입니다. 기본 `npm test`의 Chrome 정리 순서 보완은 이번 시제품과 분리해 후속 반영할 수 있습니다.

최종 제한: 실제 휴대폰/OS 한국어 IME 검증은 미실시. 최신 main `99a053d`와의 통합 및 그 위에서의 top10 회귀 검증은 미실시. 원격 변경 승인 전에는 이 로컬 시제품을 배포하지 않습니다.

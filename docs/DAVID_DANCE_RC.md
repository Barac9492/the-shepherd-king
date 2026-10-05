# 다윗의 춤 — 로컬 release candidate

2026-10-05. **main `99a053de10a378c54f9aa333e4905d95491a7ccb` (PR #16) 통합 및 로컬 검증 완료.** 원격 push/PR/배포/DB 쓰기는 실행하지 않았습니다.

- 작업 폴더: `/Users/ethancho/Documents/Codex/2026-10-05/task-5/david-dance`
- 후보 브랜치: `release-candidate/david-dance`
- 원래 독립 시제품: `prototype/david-dance` → `3dfb8bb33c5c3988e072b58069dd49027bbcef21`, 보존됨.
- 로컬 실행: `PORT=44025 npm run dev` → `http://127.0.0.1:44025/dance.html`.
- 기능·본문·권리 근거: [시제품 보고서](DAVID_DANCE_PROTOTYPE.md).

## 통합 및 PR #16 보존

`index.html`의 인접 삽입 충돌 하나를 해결해 **물맷돌 챌린지**, **물맷돌 챌린지 랭킹 보기** (`bChallengeRanking`), **다윗의 춤** (`bDance`)를 모두 보존했습니다. `package.json`에는 `test:ranking`, `test:ranking:submit`, `test:dance`가 함께 있습니다.

PR #16의 랭킹 JS/CSS, 서버 구현, Supabase 마이그레이션, 랭킹 테스트/스크립트, CI 설정은 main `99a053d`와 byte-for-byte 동일합니다. 마이그레이션 파일은 main에서 통합했을 뿐 실행하지 않았습니다. 테스트의 POST 요청은 브라우저 fixture 또는 로컬 테스트 서버에만 전달되었습니다.

## 검증 결과

| 검증 | 결과 | 근거 |
|---|---|---|
| 전체 Node 테스트 | **299/299 통과**, 실패·취소 0 (162.4초) | `test-results/david-dance-rc/full-tests.log` |
| 춤 및 통합 왕복 브라우저 | **15/15 통과**, 페이지 오류 0 | [JSON](david-dance/rc-browser-report.json) |
| PR #16 랭킹 조회 | **10/10 통과**, 오류 0 | [JSON](david-dance/rc-ranking-report.json) |
| PR #16 제출/동의/재시도 | **5/5 통과**, 오류 0 | [JSON](david-dance/rc-ranking-submission-report.json) |
| PR #16 관련 파일 보존 | main 대비 변경 없음 | `git diff 99a053d -- src/sling-challenge.js src/sling-challenge.css server/challenge-supabase.mjs supabase .github/workflows` |

전체 테스트는 이전 검증에서 확인한 Chrome 종료 문제를 피하기 위해 **검사 전용 context 정리 보조 모듈**을 적용했습니다. 기존 테스트의 단언은 변경하지 않았고, 오류도 무시하지 않았습니다. 게임이 이 모듈을 로드하는 일은 없습니다.

```sh
NODE_OPTIONS='--import=./docs/david-dance/qa-close-contexts.mjs' npm test
BASE_URL=http://127.0.0.1:44025 NODE_OPTIONS='--import=./docs/david-dance/qa-close-contexts.mjs' npm run test:ranking
BASE_URL=http://127.0.0.1:44025 NODE_OPTIONS='--import=./docs/david-dance/qa-close-contexts.mjs' npm run test:ranking:submit
BASE_URL=http://127.0.0.1:44025 npm run test:dance
```

새 통합 시나리오는 **춤 도전 6절 완주 → 메인으로 → 320px에서 top10 열기 → 메인으로 → 춤으로 복귀**를 실제 UI로 진행합니다. top10 10개 행을 확인하고, 랭킹 읽기에서는 GET만 발생하며, 로컬 춤 점수와 기존 이야기 진도는 그대로 남는지 검사합니다. [통합 후 320px 랭킹 실제 화면](david-dance/rc-main-ranking-320.png)의 점수는 로컬 응답 fixture입니다.

## Library 전달물

| 파일 | native library_file_id |
|---|---|
| 실제 완주 화면 `desktop-festival.png` | `libfile_17e78bb9b5588191a146d0bcfe7d453f` |
| 실제 320px 긴 4절 입력 `mobile-320-long-verse.png` | `libfile_bba0c978dedc819180c5a6808ed1a9f5` |

두 파일은 저장 성공 및 원본 로컬 파일의 Library 메타데이터 적용을 확인했습니다. 기존 시제품의 실제 렌더링 캡처이며 춤 페이지 자체는 통합 중 변경하지 않았습니다.

## 남은 제한

실제 휴대폰의 한국어 OS IME 검증과 성능 측정은 미실시입니다. 320/390px 터치와 composition 이벤트/키보드 공간 모사는 실제 기기 검증을 대체하지 않습니다. 기본 `npm test`의 Chrome 종료 순서 보완은 별도 검토할 수 있습니다. 이 후보는 **로컬 검토 준비 완료** 상태이며 배포된 버전이 아닙니다. 원격 작업은 별도 승인 후 수행해야 합니다.

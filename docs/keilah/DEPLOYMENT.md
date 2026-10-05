# 그일라 운영 적용 절차

대상 저장소 `Barac9492/the-shepherd-king`, 기존 Vercel 프로젝트 `prj_hCwpnrLuYmZEGTXIbh5fHqwaN5z1`, 운영 주소 `https://the-shepherd-king.vercel.app`, Supabase `jdsjvrynmnzoztfinlzi`.

## 준비된 변경

- migration: `supabase/migrations/20261005204125_keilah_coop_rooms.sql` (공식 Supabase CLI `migration new`로 생성)
- migration SHA-256: `a0c8bbe8d0127767f8a439e8457562230f61a4fb7420c1e9afa1b4bc0a0fe3ea`
- 새 비공개 스키마 `keilah_coop`: `rooms`, `rankings`, `rate_buckets`, 게임 판정 helper, 서버 전용 `public.keilah_coop_rpc`
- Vercel 함수 `api/keilah.js`, `/api/keilah/:path*` rewrite, 최대 실행 20초
- 기존 환경 변수 `CHALLENGE_SUPABASE_URL`, `CHALLENGE_SUPABASE_SECRET_KEY`, `CHALLENGE_ALLOWED_ORIGIN` 재사용. 새 secret/유료 서비스 없음.
- 새 기능 플래그 **`KEILAH_ONLINE_ENABLED=true`**가 필요하다. 없거나 false면 API는 503으로 닫힌다. 새 프리뷰/개발 환경에 운영 DB 쓰기 권한을 자동으로 열지 않는다.

실제 credential 값은 읽거나 출력하지 않았다. 이전에 차단된 Vercel 환경 변수 조회도 재시도하지 않았다.

## 승인된 적용 순서

1. 리뷰한 커밋과 migration SHA-256을 확정하고 push/PR/최종 HEAD CI를 수행한다.
2. Supabase 기존 migration 목록과 새 스키마 부재를 읽기 전용으로 재확인한다. 새 SQL **하나만** 승인받아 적용한다. 기존 물맷돌/댄스/엔게디 migration을 다시 적용하거나 데이터를 이전하지 않는다.
3. [PREFLIGHT.sql](PREFLIGHT.sql)로 그일라 RLS·함수 invoker·실행 권한을 확인한다. 운영 적용 후 Supabase advisors도 확인한다.
4. 기존 서버 전용 환경 설정을 유지하고, 승인된 Production 환경에서 새 기능 플래그를 켠다. 이 문서는 env 수정/배포를 실행하지 않는다.
5. 승인된 최종 커밋을 병합·배포하고 운영 alias가 해당 SHA의 READY 배포를 가리키는지 확인한다.
6. 운영에서는 config/랭킹 GET, 화면·메뉴 복귀를 우선 확인한다. 승인된 두 독립 브라우저 세션으로 실제 운영 협동 진행·연결 복구를 확인하되 완주 기록은 제출하지 않는다. 실제 휴대폰 검증은 별도로 남긴다. 자동 검증용 가짜 점수를 운영 TOP 10에 보내지 않는다.

## 중단/되돌리기

`KEILAH_ONLINE_ENABLED=false`로 새 API를 닫고 이전 앱 배포로 되돌릴 수 있다. 기존 개인 게임은 독립 경로를 쓴다. 롤백을 이유로 새 스키마나 기록을 DROP/DELETE하지 않는다. 방은 만료 처리하고 이미 저장된 공개 기록은 보존한 상태에서 검토한다.

## 적용 전 남은 실제 환경 검증

- 실제 Android/iOS 두 기기, LTE/Wi-Fi 전환, 인터넷 지연
- Vercel rewrite와 배포된 함수에서 실제 Supabase gateway 왕복
- 운영 규모의 동시 접속 및 기존 요금제 사용량: 진행 중 팀당 최대 약 2조회/초 + 조작 요청
- 로컬 PGlite는 PostgreSQL 엔진으로 SQL/권한/원자적 요청을 검증하지만, 별도 연결 여러 개의 운영 PostgreSQL 부하 시험을 대체하지 않는다. 로컬 Docker daemon은 꺼져 있어 별도 서버 기반 부하 시험은 수행하지 않았다.

2026-10-05 사용자가 게임용 DB 추가·온라인 기능 활성화·운영 배포를 승인했다. 실제 적용 결과는 최종 PR과 배포 보고서에서 확인한다. 추가 구현을 위한 새 키/계정/유료 서비스 요구는 없다.

# 그일라 협동전: Vercel + Supabase 연결 구현

기준 main: `025cdaa911f9d46a747d4d286d5dc45950051f5d`. 기존 개인 게임의 API·검산기·랭킹을 수정하지 않고 새 `/api/keilah/*`와 `keilah_coop` 스키마를 추가한다. 현재 운영에는 적용하지 않았다.

## 현재 프로젝트에 맞춘 구성

운영 프로젝트를 읽기 전용으로 확인했다. Supabase `jdsjvrynmnzoztfinlzi`는 `the-shepherd-king-leaderboard`, 서울 `ap-northeast-2`, PostgreSQL `17.11.0.002`, ACTIVE_HEALTHY다. 기존 물맷돌·댄스·엔게디 migration 4개만 적용되어 있다. Vercel의 기존 서버 전용 Supabase URL/secret key/origin 설정을 재사용하며 새 서비스·키를 만들지 않는다.

```text
두 휴대폰의 같은 방
  → 같은 origin /api/keilah/*
  → Vercel 함수 (입력 제한, origin/토큰 확인, 네트워크 해시)
  → Supabase의 서비스 전용 keilah_coop_rpc
  → 방 행 잠금 → DB 시간으로 판정 → 상태와 완료 기록 원자적 저장
```

한 요청은 RPC 한 번으로 처리한다. 방마다 `SELECT ... FOR UPDATE`로 판정을 직렬화한다. 서버 프로세스 메모리나 장기 연결을 공유하지 않으므로 Vercel 인스턴스 교체·재시작에도 상태가 유지된다. 기존 단일 RPC 패턴과 동일한 Node fetch 핸들러를 사용한다. `vercel.json`의 새 rewrite는 그일라 경로에만 적용된다.

진행 중에는 약 1초 간격으로 상태를 조회하고, 대기실은 2.5초, 종료 뒤는 5초로 줄인다. 팀당 진행 중 최대 약 2회/초의 조회에 조작 요청이 추가된다. 새 유료 서비스를 요구하지 않지만 기존 Vercel 함수 호출·Supabase 사용량은 증가한다. 실제 운영 지연·동시 접속·요금제 한도를 별도로 확인해야 하며 무료 운영을 보장하지 않는다. 프레임 단위 액션 대신 6–15초 이동과 14초 인솔을 사용하는 지도를 유지해 이 지연에 맞춘다.

## 권한과 기록 판정

- 무작위 8자리 초대 코드, 최대 2명. 공개 TOP 10에는 초대 코드와 다른 `T-xxxxxx` 팀 ID만 표시한다.
- 서버 HMAC으로 발급한 256비트 자리 토큰을 탭의 sessionStorage에 저장한다. DB에는 SHA-256 해시만 남고, 토큰은 URL·다른 플레이어·순위 응답에 노출하지 않는다.
- 방 입장 request ID와 토큰은 함수 인스턴스가 바뀌어도 동일하게 복구된다. 탈퇴한 입장 요청의 재사용은 거부한다.
- 조작은 자리별 sequence + run + 마지막 명령을 검증한다. 같은 요청 재전송은 한 번만 반영하고, 같은 sequence에 다른 명령은 거부한다. 클라이언트는 확인되지 않은 명령을 저장해 응답 유실 후 재확인한다.
- 상태 revision으로 늦게 도착한 과거 응답을 무시한다. 이동 위치·점수·시간·구출 수를 클라이언트가 제출하는 경로는 없다.
- DB가 고정 지도, 이동 시간, 통로 협력, 한 가족씩 인솔, 전원 남문 도착, 두 플레이어의 역할 참여와 탈출을 확인한다. 두 사람의 기록 공개 동의도 필요하다.
- DB 시간만 기록에 쓰고 0.1초 단위로 올림한다. 순위는 빠른 순이며 동률은 공동 순위, 먼저 기록된 결과를 우선해 10개만 보관한다. 중복 완주 기록은 `(room_code, run)` 키로 차단한다.
- `rooms`, `rankings`, `rate_buckets`는 비공개 스키마에 두고 모두 RLS를 켠다. `anon`, `authenticated`, PUBLIC의 테이블/함수 권한을 철회한다. RPC는 `SECURITY INVOKER`이며 기존 `service_role`만 접근한다. migration이 새 그일라 객체에 필요한 권한을 추가하지만 새 플랫폼 권한이나 credential은 요구하지 않는다.
- 원본 IP는 저장하지 않고 일별 HMAC으로 요청을 제한한다. 생성 10/분, 입장 40/분, 명령 600/분, 조회 2,400/분, 순위 60/분/IP 해시. 공유 Wi-Fi의 여러 팀은 이 제한을 함께 사용한다.
- 동시 보관 방 200개, 마지막 인증 접속 후 30분 만료, JSON 2KiB, 판 10분, DB lock timeout 2초. 방·네트워크 제한 행은 이후 요청에서 제한된 개수씩 정리한다. 기존 개인 랭킹은 건드리지 않는다.

## 모바일 연결

12초까지 heartbeat 간격을 허용한다. 이후에는 두 사람의 진행을 멈추고, 60초 안에 복구하면 이어 간다. 멈춘 시간도 완주 시간에 포함하므로 연결을 끊어 더 짧은 기록을 얻을 수 없다. 60초가 지나면 판을 종료한다. 같은 탭 새로고침은 자리를 복구하고, 명시적 나가기는 진행 중 판을 끝낸다. 완주 후 나가기는 이미 저장한 기록과 남은 동료의 완료 상태를 유지한다.

sessionStorage는 실제 두 사람임을 증명하지 않는다. 한 사람이 두 탭을 조작하거나 자동화하는 것까지 막는다고 주장하지 않는다. 네트워크 지연에 따른 기록 차이도 남는다.

## 로컬 검증 구조

`npm run dev:keilah`는 **파일 기반 PGlite PostgreSQL**에서 실제 migration과 운영용 HTTP/서비스/RPC 코드를 실행한다. 요청마다 새 핸들러를 만들어 프로세스 메모리에 의존하지 않음을 확인한다. Supabase fetch 대신 로컬 SQL 어댑터를 주입하며 지정된 가짜 URL 이외 호출은 거부한다. 실제 키를 읽지 않고 원격 DB에 연결하지 않는다.

초기 메모리 시제품은 `dev:keilah:memory`에만 남긴다. 운영 API는 이를 사용하지 않는다. 로컬 메모리 점수를 온라인 DB로 이전하지 않는다.

## 근거와 창작 범위

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions): invoker와 함수 실행 권한
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): 서비스 키 비공개, 기본 거부
- [Vercel rewrites](https://vercel.com/docs/rewrites): 기존 앱 내부 API 경로 연결
- [PostgreSQL 17.11 변경 안내](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): 확인했으며 이 migration은 안내된 확장/사용자 정의 연산자를 사용하지 않는다.
- [대한성서공회 사무엘상 23장](https://www.bskorea.or.kr/bible/korbibReadpage.php?version=GAE&book=1sa&chap=23): 구출과 철수에서 영감을 받았다. 손잡이·네 가족·협동 지도·시간 경쟁은 창작으로 표시하며 사울을 처치하는 결말은 없다. 현대 역본 전문을 복제하지 않는다.

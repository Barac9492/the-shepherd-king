# 그일라 2인 구출전 실행

**챌린지 → 그일라 2인 구출전**에서 시작한다. 각자 다른 휴대폰/브라우저에서 초대 코드로 같은 방에 들어가고 기록 공개에 동의한 뒤 준비한다. 서로 통로를 열어 준 후 양쪽으로 나뉘어 가족을 한 팀씩 남문으로 인솔한다. 네 가족과 두 플레이어가 모두 탈출해야 기록이 저장된다.

## 로컬 DB 실행

```sh
npm ci --ignore-scripts
npm run dev:keilah
```

주소: http://127.0.0.1:44937/keilah.html

실제 PostgreSQL migration과 운영용 API를 로컬 파일 DB에서 실행한다. DB 기본 경로는 `test-results/keilah-postgres-review`이며 서버를 껐다 켜도 방/기록이 유지된다. 원격 Supabase 키를 넣지 않는다. 새로운 빈 테스트 DB가 필요하면 `KEILAH_LOCAL_DB=/tmp/my-keilah-db`처럼 별도 경로를 지정한다. migration을 수정하며 개발할 때는 별도 빈 DB로 다시 검증한다.

두 휴대폰을 같은 신뢰할 수 있는 Wi-Fi에서 시험하려면:

```sh
HOST=0.0.0.0 PORT=44937 npm run dev:keilah
```

두 기기 모두 `http://<컴퓨터의 사설 IPv4>:44937/keilah.html`을 연다. OS의 로컬 네트워크 접근이 필요할 수 있다. 인터넷 공개/포트포워딩은 로컬 검증 범위가 아니다. 실제 인터넷 접속은 승인 후 기존 Vercel HTTPS 주소에 연결한다.

두 사람 테스트에는 독립 브라우저 프로필/시크릿 창을 쓴다. 탭 복제는 sessionStorage까지 복사해 같은 자리로 인식될 수 있다. 터치는 목적지 버튼, 키보드는 Tab/Enter/Space를 사용한다. 같은 탭 새로고침은 자리를 복구한다. 음성·카메라 권한은 요청하지 않는다.

## 검증

```sh
npm run test:keilah
# 위 로컬 DB 서버가 켜진 별도 터미널에서
npm run test:keilah:browser
node scripts/check-keilah-recovery.mjs
BASE_URL=http://127.0.0.1:44937 npm run test:menu
```

Chrome 기본 경로는 macOS Google Chrome이다. 다른 환경은 `CHROME_PATH=/path/to/chrome`을 지정한다. 협동 브라우저 테스트는 시간을 가속하지 않으므로 약 4분과 복구 확인 시간이 필요하다. 결과와 캡처는 `test-results/keilah/`에 저장한다.

초기 메모리 모델이 필요한 경우에만 `npm run dev:keilah:memory`를 사용한다(44936). 이 경로는 운영 방식이 아니며 운영 DB로 기록을 이전하지 않는다.

[구조](ARCHITECTURE.md) · [검증 결과](VERIFICATION.md) · [운영 적용 절차](DEPLOYMENT.md)

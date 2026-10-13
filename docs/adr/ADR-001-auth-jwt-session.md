# ADR-001 — 인증 방식: JWT + DB 세션 (Refresh Token Rotation, httpOnly 쿠키)

**배경:** [AUTH SRS](../srs/AUTH-SRS.md)의 결정 사항은 다음과 같다.
- JWT(Access 15분, 응답 body) + Refresh Token 7일(httpOnly 쿠키)
- 공개 회원가입 없음. 계정은 초대(AUTH-005)로만 만든다.

동시에 로그아웃 후 기존 Refresh Token은 401이어야 하고(AUTH-002), 보호 API도 바로 막혀야 한다(마스터플랜 11장).

**선택지:**
- A. 순수 무상태 JWT: 구현이 단순하다. 대신 로그아웃·비활성화가 Access 만료(최대 15분)까지 반영되지 않는다.
- B. 서버 세션 + 쿠키: 즉시 폐기된다. 대신 SRS의 JWT 결정과 맞지 않는다.
- C. JWT + `sessions` 테이블: 토큰은 JWT, 폐기 여부는 DB로 판단한다.

**결정:** C.
- 로그인(또는 초대 수락)할 때마다 `sessions` 행을 하나 만든다. Access/Refresh Token 모두 세션 id(`sid`)를 담는다.
- 보호 API를 호출할 때마다 세션과 사용자 상태를 DB에서 확인한다. 로그아웃·비활성화·역할 변경이 바로 반영된다.
- Refresh Token은 원문 대신 SHA-256 해시로 저장한다. bcrypt는 72바이트 뒤를 잘라 버려서, 이보다 긴 JWT에는 맞지 않는다.
- Refresh Token은 한 번 쓰면 새 토큰으로 바뀐다(Rotation). 이미 교체된 토큰이 다시 들어오면 탈취로 보고 그 세션을 폐기한다.
- Access/Refresh 서명 키를 분리해서, 한쪽 토큰을 다른 쪽 용도로 쓸 수 없다.
- Refresh Token은 `refresh_token` httpOnly 쿠키로만 주고받는다.
  - 설정: `Path=/api/auth`, `SameSite=Strict`, 운영 환경에서는 `Secure`
  - JS에서 읽을 수 없어 XSS로 탈취되지 않는다.
  - `SameSite=Strict`라서 다른 사이트에서 보낸 요청에는 쿠키가 실리지 않는다(CSRF 대응).
- 초대 토큰도 원문 대신 SHA-256 해시로 저장한다. 72시간이 지나면 만료되고, 한 번 수락하면 다시 쓸 수 없다.

**트레이드오프:**
- 인증된 요청마다 DB 조회가 1번 늘어난다(PK 조회).
- 같은 Refresh Token으로 동시에 두 번 갱신하면(탭 두 개 등) 한쪽이 재사용으로 판정되어 재로그인이 필요하다.
- `SameSite=Strict`이므로 프론트와 API가 같은 사이트여야 한다(현재 구조: vite 프록시 / 운영 리버스 프록시).

**SRS의 "세션 스토어 없이 수평 확장" 문구와의 관계:**
- `sessions`는 PostgreSQL 테이블이다. 앱 서버 메모리가 아니므로 서버를 여러 대로 늘려도 문제가 없다.
- SRS의 로그아웃 요구(Refresh Token 무효화, DB 레코드 처리)를 지키려면 서버 측 기록이 어차피 필요하다.

**재검토 조건:**
- 트래픽이 커져 세션 조회가 부담이 되면 Redis 캐시를 검토한다.
- 프론트와 API를 다른 사이트(도메인)로 분리하게 되면 SameSite와 CSRF 정책을 다시 정한다.

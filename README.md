# OpsFlow

사내 IT 업무 요청 · 장애 대응 관리 툴 (개인 프로젝트)

## 구조

```
OpsFlow/
  backend/    # NestJS + TypeORM + PostgreSQL (API 서버)
  frontend/   # React + TypeScript + Vite + Tailwind (화면)
  docker-compose.yml   # 로컬 PostgreSQL + DB 뷰어(Adminer)
```

## 처음 실행하는 법

### 1. DB 띄우기

```bash
docker compose up -d
```

- PostgreSQL: localhost:5432 (계정/비번: opsflow / opsflow)
- Adminer(DB 뷰어): http://localhost:8080

### 2. 백엔드

```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```

- http://localhost:3000/api/health 호출해서 `{"status":"ok", ...}` 나오면 정상
- `.env` 는 git에 올라가지 않음 (비밀번호 등 개인 설정이라서). `.env.example` 을 복사해서 씀

### 3. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

- http://localhost:5173 접속
- 화면 중앙에 "백엔드 연결 상태: 정상" 이 뜨면 프론트 ↔ 백엔드 ↔ DB 까지 전부 잘 붙은 것

## 인증 API

기준 문서는 [AUTH SRS](docs/srs/AUTH-SRS.md)다. 모든 API 경로는 `/api`로 시작한다.

**공개 회원가입은 없다.** 계정은 관리자 초대를 수락할 때만 만들어진다(AUTH-005).

| 메서드 | 경로 | 설명 | 인증 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | 로그인 (`email`, `password`) | 공개 (IP당 분당 10회) |
| POST | `/api/auth/refresh` | 쿠키의 Refresh Token으로 재발급 (Refresh Token은 1회용, 매번 교체) | 공개 (IP당 분당 10회) |
| POST | `/api/auth/logout` | 현재 세션 폐기 + 쿠키 삭제 | Bearer Access Token |
| GET | `/api/auth/me` | 현재 사용자 정보 | Bearer Access Token |
| POST | `/api/auth/invitations` | 구성원 초대 (`email`, `role`: MEMBER/MANAGER). 응답의 `token`을 초대받는 사람에게 전달 | ADMIN |
| POST | `/api/auth/invitations/accept` | 초대 수락 = 가입 (`token`, `name`, `password`). 이메일·역할·조직은 초대장에서 정해짐 | 공개 (IP당 분당 10회) |

- 로그인·갱신·초대 수락 응답의 본문에는 `accessToken`과 `user`만 들어 있다.
- Refresh Token은 `refresh_token` httpOnly 쿠키로 내려간다(`Path=/api/auth`, `SameSite=Strict`, 운영 환경에서는 `Secure`).
- Access Token은 15분, Refresh Token은 7일, 초대는 72시간 동안 유효하다.
- `@Public()`이 붙지 않은 API는 모두 로그인이 필요하다. `@Roles(...)`가 붙은 API에서 역할이 맞지 않으면 403을 준다.
- 설계 이유는 [ADR-001](docs/adr/ADR-001-auth-jwt-session.md)에 정리했다.

### 첫 관리자 만들기

공개 가입이 없으므로 조직의 첫 관리자는 스크립트로 만든다. 비밀번호는 셸 기록에 남지 않도록 환경변수로 넘긴다.

```bash
cd backend
ADMIN_PASSWORD='비밀번호' npm run admin:create -- admin@opsflow.test "관리자" [organization_id]
```

`organization_id`를 생략하면 새 조직 id가 만들어진다.

## 테스트

```bash
cd backend
npm test
```

## 참고

- 이 저장소에는 `node_modules`가 포함되어 있지 않습니다. 각 폴더(`backend`, `frontend`)에서 `npm install`을 먼저 실행해야 합니다.
- 와이어프레임: (Claude Design 아티팩트 링크는 대화 내용 참고)

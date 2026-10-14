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

## 인증 · 구성원 관리 API

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
| POST | `/api/invitations/:id/resend` | 초대 재발송 (AUTH-009). 이전 토큰은 즉시 무효화, 응답의 `token`이 새 초대 토큰. 이미 가입 완료된 대상이면 409 | ADMIN |
| GET | `/api/users` | 구성원 목록 (AUTH-007). `{ members, invitations }`로 응답 — members는 ACTIVE/INACTIVE, invitations는 가입 전 INVITED/EXPIRED만 포함(만료 초대도 재발송 가능해서 같이 줌). 페이지네이션 없음 | ADMIN |
| PATCH | `/api/users/:id/role` | 역할 변경 (AUTH-006, Member↔Manager↔Admin). 조직의 마지막 활성 Admin은 스스로를 강등할 수 없음(409) | ADMIN |
| PATCH | `/api/users/:id/deactivate` | 구성원 비활성화 (AUTH-008). 기존 세션 전부 즉시 무효화. 본인 비활성화는 인원수와 무관하게 항상 403, 이미 비활성 상태면 재요청도 200(멱등) | ADMIN |

- 로그인·갱신·초대 수락 응답의 본문에는 `accessToken`과 `user`만 들어 있다.
- Refresh Token은 `refresh_token` httpOnly 쿠키로만 주고받는다(`Path=/api/auth`, `SameSite=Strict`, 운영 환경에서는 `Secure`).
- Access Token은 15분, Refresh Token은 7일, 초대는 72시간 동안 유효하다.
- `@Public()`이 붙지 않은 API는 모두 로그인이 필요하다. `@Roles(...)`가 붙은 API에서 역할이 맞지 않으면 403을 준다.
- 설계 이유는 [ADR-001](docs/adr/ADR-001-auth-jwt-session.md)에 정리했다.

### 첫 관리자 만들기

공개 가입이 없으므로 조직의 첫 관리자는 스크립트로 만든다. 비밀번호는 셸 기록에 남지 않도록 환경변수로 넘긴다.

```bash
cd backend
ADMIN_PASSWORD='비밀번호' npm run admin:create -- admin@opsflow.test "관리자" [organization_id]
```

`organization_id`를 생략하면 새 조직 id가 만들어진다. 그 조직에 요청 유형이 하나도 없으면 기본 유형 4개(계정 발급, 접근 권한 요청, 설정 변경, 장비 요청)도 함께 들어간다.

## 업무 요청 API

기준 문서는 [RQ SRS](docs/srs/RQ-SRS.md)다. 모든 API는 로그인한 사용자 본인의 조직 데이터만 다룬다.

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/api/request-templates` | 요청 유형 목록. `?includeArchived=true`는 Admin 호출일 때만 보관된 유형까지 포함(다른 역할은 무시) | 로그인 사용자 |
| POST | `/api/request-templates` | 요청 유형 생성 (RQ-012, `name`, `description?`). 조직 내 이름 중복 409 | ADMIN |
| PATCH | `/api/request-templates/:id` | 요청 유형 수정 (이름·설명만, 보관 여부는 아래 archive로만 변경) | ADMIN |
| POST | `/api/request-templates/:id/archive` | 요청 유형 보관(비활성화). 이미 보관된 유형이면 그대로 200(멱등). 기존 요청의 참조는 유지, 삭제·재활성화는 없음 | ADMIN |
| POST | `/api/requests` | 요청 생성 (`templateId`, `title`, `content`) → PENDING | 로그인 사용자 |
| GET | `/api/requests` | 목록 (`page`, `limit`≤100, `sort`=created_at·updated_at·status·title, `order`, `status`, `templateId`) | Member는 본인 요청·담당 요청만, Manager·Admin은 조직 전체 |
| GET | `/api/requests/:id` | 상세 + 상태 변경 이력(`history`) | 요청자, 담당자, Manager, Admin |
| PATCH | `/api/requests/:id` | 수정. REJECTED 상태에서 수정하면 PENDING으로 재제출 | 요청자 본인 |
| POST | `/api/requests/:id/cancel` | PENDING → CANCELLED | 요청자 본인 |
| POST | `/api/requests/:id/approve` | PENDING → APPROVED (자기 요청은 불가) | Manager, Admin |
| POST | `/api/requests/:id/reject` | PENDING → REJECTED (`reason` 필수) | Manager, Admin |
| PATCH | `/api/requests/:id/assignee` | APPROVED면 담당자 지정 + IN_PROGRESS, IN_PROGRESS면 담당자만 변경. 자기 자신 지정·현재 담당자의 재지정은 모두 403 | Manager, Admin |
| POST | `/api/requests/:id/complete` | IN_PROGRESS → COMPLETED | 담당자, Manager, Admin |

오류 코드는 다음과 같이 나뉜다.
- 다른 조직의 요청이거나 존재하지 않는 요청: 404
- 같은 조직이지만 권한이 없음: 403
- 현재 상태에서 할 수 없는 작업: 409

모든 상태 변경은 요청 행을 잠근 트랜잭션 안에서 처리하고, 감사 로그(`audit_logs`)를 같은 트랜잭션에 남긴다.

## 장애 대응 API

기준 문서는 [INCIDENT SRS](docs/srs/INCIDENT-SRS.md)다. RQ와 달리 **조회(목록·상세)는 같은 조직이면 역할과 무관하게 전체 공개**다 — 장애는 운영 이슈 공유가 목적이라서다.

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| POST | `/api/incidents` | 장애 등록 (`title`, `description`, `severity?` 생략 시 MEDIUM) → OPEN | 로그인 사용자 전체 |
| GET | `/api/incidents` | 목록 (`page`, `limit`≤100, `sort`=created_at·updated_at·status·severity·title, `order`, `status`, `severity`) | 같은 조직이면 전체 공개 |
| GET | `/api/incidents/:id` | 상세 + 대응 타임라인(등록·담당자 지정/변경·대응 기록·심각도 변경·해결·Postmortem·종료) | 같은 조직이면 전체 공개 |
| PATCH | `/api/incidents/:id/assignee` | OPEN이면 담당자 지정 + INVESTIGATING, INVESTIGATING이면 담당자만 변경. **RQ와 달리 자기 자신 지정 허용** | Manager, Admin |
| POST | `/api/incidents/:id/timeline` | 대응 기록 추가 (`content`). CLOSED면 409 | 담당자, Manager, Admin |
| PATCH | `/api/incidents/:id/severity` | 심각도 변경. `peak_severity`는 더 높은 값으로만 갱신(낮추는 변경은 반영 안 함). CLOSED면 409 | 담당자, Manager, Admin |
| POST | `/api/incidents/:id/resolve` | INVESTIGATING → RESOLVED | 담당자, Manager, Admin |
| PUT | `/api/incidents/:id/postmortem` | Postmortem 작성·수정 (`cause`, `action`, `prevention` 모두 필수). RESOLVED 이후만, CLOSED 이후엔 수정 불가 | 담당자, Manager, Admin |
| POST | `/api/incidents/:id/close` | RESOLVED → CLOSED. **peak 심각도가 Medium 이상인데 Postmortem 미작성이면 409** (종료 시점 현재 심각도가 아니라 생애주기 중 최고 심각도 기준) | Manager, Admin |

## 감사 로그 API

기준 문서는 [RQ SRS의 감사 로그 설계](docs/srs/RQ-SRS.md)와 `backend/src/audit/`를 따른다. 업무 요청·구성원·장애 도메인의 모든 상태 변경이 여기에 쌓인다.

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/api/audit-logs` | 조직 전체 감사 로그 조회 (`page`, `limit`≤100, `actorId`, `entityType`, `from`, `to`). 정렬은 createdAt DESC 고정(동시각은 id로 2차 정렬), `from` 이상·`to` 미만, 날짜만 주면 UTC 자정 기준 | ADMIN |

응답은 `{ items, page, limit, total }`이고, `entityType`은 저장된 값(`WORK_REQUEST`, `REQUEST_TEMPLATE`, `INCIDENT`, `USER`, `INVITATION`)과 대소문자까지 정확히 일치해야 걸린다.

## 테스트

```bash
cd backend
npm test
```

## 참고

- 이 저장소에는 `node_modules`가 포함되어 있지 않습니다. 각 폴더(`backend`, `frontend`)에서 `npm install`을 먼저 실행해야 합니다.
- 와이어프레임: (Claude Design 아티팩트 링크는 대화 내용 참고)

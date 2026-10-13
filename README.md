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

- http://localhost:3000/health 호출해서 `{"status":"ok", ...}` 나오면 정상
- `.env` 는 git에 올라가지 않음 (비밀번호 등 개인 설정이라서). `.env.example` 을 복사해서 씀

### 3. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

- http://localhost:5173 접속
- 화면 중앙에 "백엔드 연결 상태: 정상" 이 뜨면 프론트 ↔ 백엔드 ↔ DB 까지 전부 잘 붙은 것

## 참고

- 이 저장소에는 `node_modules`가 포함되어 있지 않습니다. 각 폴더(`backend`, `frontend`)에서 `npm install`을 먼저 실행해야 합니다.
- 와이어프레임: (Claude Design 아티팩트 링크는 대화 내용 참고)

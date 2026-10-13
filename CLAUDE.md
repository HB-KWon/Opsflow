# CLAUDE.md

## 언어 규칙 (필수)

- **모든 답변은 항상 한국어로 작성한다.**
- 코드에 대해 질문하거나, 작업 권한·승인을 요청하거나, 선택지를 제시할 때도 반드시 한국어를 사용한다.
- 코드 식별자(변수·함수·클래스명)와 명령어, 라이브러리 이름 등 고유 명칭은 원문 그대로 둔다.
- 코드 주석과 커밋 메시지도 기존 저장소 관례에 맞춰 한국어로 작성한다. (예: `chore: 개발 환경 초기 세팅`)

## 프로젝트 개요

OpsFlow — 사내 IT 업무 요청 · 장애 대응 관리 툴 (개인 프로젝트)

```
OpsFlow/
  backend/             # NestJS + TypeORM + PostgreSQL (API 서버, :3000)
  frontend/            # React + TypeScript + Vite + Tailwind (화면, :5173)
  docker-compose.yml   # 로컬 PostgreSQL(:5432) + Adminer(:8080)
```

## 주요 명령어

```bash
# DB
docker compose up -d

# 백엔드 (backend/)
npm run start:dev    # 개발 서버 (watch)
npm run build
npm run lint
npm test             # jest

# 프론트엔드 (frontend/)
npm run dev
npm run build        # tsc -b && vite build
npm run lint
```

- 백엔드 설정은 `backend/.env` 사용 (`.env.example` 복사). `.env`는 git에 올리지 않는다.
- 헬스체크: `http://localhost:3000/health`

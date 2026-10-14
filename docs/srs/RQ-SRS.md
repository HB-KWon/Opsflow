# OpsFlow SRS — 업무 요청 관리 (RQ)
문서 버전: 0.1 | 작성일: 2026-10-13 | 상태: 초안
(Claude.ai 대화에서 작성됨, 2026-10-14 저장소에 뒤늦게 저장)

## 공통 전제
- 역할: Member / Manager / Admin (RBAC)
- 모든 쓰기 작업은 백엔드에서 역할 + 리소스 소유권을 함께 검증
- 조직 간 데이터는 완전히 분리됨 (organization_id 필터)
- 상태 전이: `PENDING → APPROVED → IN_PROGRESS → COMPLETED` / `PENDING → REJECTED → (수정) → PENDING` / `PENDING → CANCELLED`
- 종단 상태(CANCELLED, COMPLETED, REJECTED 그 자체)는 재오픈 불가. 삭제 API 없음(취소/반려로 대체)

## RQ-001. 업무 요청 생성
| 항목 | 내용 |
|---|---|
| 사용자 | Member (Manager, Admin도 요청자가 될 수 있음) |
| 입력 | 요청 유형(템플릿), 제목, 내용 |
| 처리 | 요청자 = 현재 로그인 사용자로 자동 지정. 상태 = `PENDING`으로 생성 |

**예외 처리**: 필수값 누락 → 400 / 미인증 → 401 / 존재하지 않는 템플릿 → 404

**수용 기준**
- [ ] 필수값을 모두 채우면 PENDING 상태로 생성되고 요청자가 자동 지정된다
- [ ] 필수값 누락 시 생성되지 않고 구체적 오류 메시지를 반환한다
- [ ] 생성된 요청은 요청자가 속한 조직에만 귀속된다

## RQ-002. 업무 요청 목록 조회
| 항목 | 내용 |
|---|---|
| 사용자 | Member(본인 요청+담당 요청), Manager(조직 전체), Admin(조직 전체) |
| 처리 | 역할별 필터링 후 목록 반환. 상태/유형 필터링·정렬 지원 |

**권한 범위**: Member는 본인이 요청자이거나 담당자인 것만 / Manager·Admin은 조직 전체

**수용 기준**
- [ ] Member는 본인과 무관한 타인의 요청을 목록에서 볼 수 없다
- [ ] 다른 조직의 요청은 어떤 역할로도 조회되지 않는다

## RQ-003. 업무 요청 상세 조회
| 항목 | 내용 |
|---|---|
| 사용자 | 요청자 본인, 담당자, Manager, Admin |

**예외 처리**: 권한 없음 → 403 / 존재하지 않음 → 404

**수용 기준**
- [ ] 권한 없는 사용자가 상세에 접근 시 403을 반환한다
- [ ] 상세 화면에는 상태 변경 이력(감사 로그 요약)이 함께 표시된다

## RQ-004. 업무 요청 수정
| 항목 | 내용 |
|---|---|
| 사용자 | 요청자 본인 |
| 처리 | PENDING 또는 REJECTED 상태만 수정 가능. REJECTED에서 수정 시 → PENDING으로 재전이 |

**예외 처리**: APPROVED 이후 상태 → 409 / 본인 아님 → 403

**수용 기준**
- [ ] PENDING 상태의 본인 요청은 수정할 수 있다
- [ ] REJECTED 상태에서 수정하면 자동으로 PENDING으로 전환된다
- [ ] APPROVED 이후 상태에서는 수정이 거부된다

## RQ-005. 업무 요청 취소
| 항목 | 내용 |
|---|---|
| 사용자 | 요청자 본인 |
| 처리 | `PENDING → CANCELLED` |

**예외 처리**: PENDING 아님 → 409 / 본인 아님 → 403

**수용 기준**
- [ ] PENDING 상태의 본인 요청만 취소할 수 있다
- [ ] 취소 이력이 감사 로그에 기록된다

## RQ-006. 업무 요청 승인
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 처리 | `PENDING → APPROVED`. 승인 기록 + 감사 로그를 하나의 트랜잭션으로 저장 |

**예외 처리**: 요청자 본인 승인 시도 → 403(자기 승인 금지) / PENDING 아님 → 409 / Member 호출 → 403 / 타 조직 → 404

**수용 기준**
- [ ] Manager/Admin이 PENDING 요청을 승인하면 APPROVED로 전이된다
- [ ] 요청자 본인은 자신의 요청을 승인할 수 없다
- [ ] 승인 상태 변경·기록 저장·감사 로그는 하나의 트랜잭션으로 처리된다

## RQ-007. 업무 요청 반려
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 입력 | 반려 사유 (필수) |
| 처리 | `PENDING → REJECTED` |

**예외 처리**: 사유 누락 → 400 / PENDING 아님 → 409 / 요청자 본인·Member → 403

**수용 기준**
- [ ] 반려 시 사유를 반드시 입력해야 한다
- [ ] 반려된 요청은 REJECTED로 전이되고 요청자가 수정 후 재제출할 수 있다

## RQ-008. 담당자 지정
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 입력 | 담당자 user_id |
| 처리 | `APPROVED → IN_PROGRESS`, 담당자 필드 설정 |

**예외 처리**: APPROVED 아님 → 409 / 존재하지 않는 사용자 → 400 / 타 조직 사용자 → 400 / 담당자 본인 위임 시도 → 403

**수용 기준**
- [ ] APPROVED 상태에서만 담당자를 지정할 수 있다
- [ ] 같은 조직에 속하지 않은 사용자는 담당자로 지정할 수 없다
- [ ] 담당자 지정과 동시에 IN_PROGRESS로 전이된다

## RQ-009. 담당자 변경
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 처리 | 담당자 필드만 갱신, 상태는 IN_PROGRESS 유지 |

**예외 처리**: 담당자 본인 변경 시도 → 403 / IN_PROGRESS 아님 → 409

**수용 기준**
- [ ] Manager/Admin만 담당자를 변경할 수 있다
- [ ] 변경 이력(이전 담당자 → 신규 담당자)이 감사 로그에 남는다

## RQ-010. 업무 완료 처리
| 항목 | 내용 |
|---|---|
| 사용자 | 담당자 본인, Manager, Admin |
| 처리 | `IN_PROGRESS → COMPLETED` |

**예외 처리**: IN_PROGRESS 아님 → 409 / 담당자 아닌 Member(요청자 포함) → 403 / 완료된 요청 재오픈 불가

**수용 기준**
- [ ] 담당자 본인 또는 Manager/Admin만 완료 처리를 할 수 있다
- [ ] 완료 처리 후 COMPLETED로 고정되며 어떤 역할도 되돌릴 수 없다
- [ ] 완료 시각이 기록된다

## RQ-011. 상태 전이 요약
| 현재 상태 | 가능한 전이 | 수행 주체 | SRS |
|---|---|---|---|
| PENDING | → APPROVED | Manager, Admin | RQ-006 |
| PENDING | → REJECTED | Manager, Admin | RQ-007 |
| PENDING | → CANCELLED | 요청자 본인 | RQ-005 |
| REJECTED | → PENDING | 요청자 본인(수정) | RQ-004 |
| APPROVED | → IN_PROGRESS | Manager, Admin(담당자 지정) | RQ-008 |
| IN_PROGRESS | → COMPLETED | 담당자, Manager, Admin | RQ-010 |

## RQ-012. 요청 유형 관리 (생성/수정/보관)
| 항목 | 내용 |
|---|---|
| 사용자 | Admin |
| 처리 | 조직별 요청 유형 생성, 수정(이름/설명만, isActive는 별도 보관 액션으로만 변경), 보관(비활성화) |

> 삭제는 없음 — 기존 요청이 참조하고 있어 보관만 한다. 보관 해제(재활성화)는 범위 밖.
> `GET /api/request-templates`는 기존대로 전체 역할이 호출 가능하고 기본 응답(활성만)도 그대로.
> `?includeArchived=true`를 추가로 받되, Admin 호출일 때만 보관된 유형도 포함해서 응답하고
> 다른 역할이 붙이면 무시한다 (요청 생성 폼 동작에는 영향 없음).

**예외 처리**
- 같은 조직 내 이름 중복 → 409 (수정 시 자기 자신은 중복 검사에서 제외)
- 이미 보관된 유형에 보관 요청 재시도 → 200 (멱등)
- Manager/Member의 생성·수정·보관 시도 → 403
- 다른 조직 유형 대상 → 404

**수용 기준**
- [ ] Admin만 생성·수정·보관할 수 있다
- [ ] 같은 조직 내 이름은 중복될 수 없다 (자기 자신 제외)
- [ ] 보관된 유형은 새 요청 생성 시 선택할 수 없지만, 기존 요청의 참조는 유지된다
- [ ] Admin이 `includeArchived=true`로 조회하면 보관된 유형도 함께 보인다
- [ ] 생성·수정·보관은 감사 로그에 기록된다

## API 매핑
| Method | Path | 권한 | SRS |
|---|---|---|---|
| POST | /api/requests | Member | RQ-001 |
| GET | /api/requests | 전체(역할별 범위) | RQ-002 |
| GET | /api/requests/:id | 요청자/담당자/Manager/Admin | RQ-003 |
| PATCH | /api/requests/:id | 요청자 본인 | RQ-004 |
| POST | /api/requests/:id/cancel | 요청자 본인 | RQ-005 |
| POST | /api/requests/:id/approve | Manager, Admin | RQ-006 |
| POST | /api/requests/:id/reject | Manager, Admin | RQ-007 |
| PATCH | /api/requests/:id/assignee | Manager, Admin | RQ-008, RQ-009 |
| POST | /api/requests/:id/complete | 담당자, Manager, Admin | RQ-010 |
| POST | /api/request-templates | Admin | RQ-012 |
| PATCH | /api/request-templates/:id | Admin | RQ-012 |
| POST | /api/request-templates/:id/archive | Admin | RQ-012 |

> 공통 오류 응답 형식, 페이지네이션(`?page=1&limit=20`), 정렬(`?sort=created_at&order=desc`), 상태 필터(`?status=PENDING`)는 AUTH와 동일한 규칙을 따름.

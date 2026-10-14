# OpsFlow SRS — 장애 대응 관리 (INCIDENT)

## 공통 전제
- 상태: OPEN → INVESTIGATING → RESOLVED → CLOSED
- 모든 보호된 API는 Access Token 검증 + 역할(RBAC) + `organization_id` 소유권을 함께 확인 (AUTH-004와 동일)
- 조회(목록·상세)는 RQ와 달리 **같은 조직이면 역할과 무관하게 전체 공개** — 장애는 운영 이슈 공유가 목적
- 인증 실패 401, 인가 실패 403, 다른 조직 리소스 404
- 취소·허위 신고 처리는 이번 범위에 없음 (와이어프레임에도 없음)

---

## IC-001. 장애 등록
| 항목 | 내용 |
|---|---|
| 사용자 | 전체(인증된 모든 역할) |
| 입력 | 제목, 설명, 초기 심각도(선택, 기본값 Medium: Critical/High/Medium/Low) |
| 처리 | 등록 즉시 OPEN 상태로 생성, 등록자는 호출자로 자동 기록, 최고 심각도(peak)는 초기 심각도로 시작 |

> peak는 IC-010의 Postmortem 의무 판정에 쓰는 내부 값으로, 생애주기 중 도달한 가장 높은 심각도를 보관한다 (상세 화면에 노출할 필요는 없음)

**수용 기준**
- [ ] 모든 역할이 등록할 수 있다
- [ ] 등록 즉시 OPEN 상태가 된다
- [ ] 초기 심각도를 생략하면 Medium이 기본값이다

## IC-002. 장애 목록 조회
| 항목 | 내용 |
|---|---|
| 사용자 | 전체(같은 조직이면 역할 무관 전체 공개) |
| 처리 | 같은 조직 장애 목록 조회, 상태·심각도 필터 |

> 페이지네이션(`?page=1&limit=20`), 정렬(`?sort=created_at&order=desc`)은 RQ-002와 동일 규칙

**수용 기준**
- [ ] 같은 조직이면 역할과 무관하게 전체 장애를 볼 수 있다
- [ ] 상태·심각도로 필터링할 수 있다

## IC-003. 장애 상세 조회
| 항목 | 내용 |
|---|---|
| 사용자 | 전체(같은 조직이면 역할 무관 전체 공개) |
| 처리 | 상세 정보 + 대응 타임라인(등록·담당자 지정·대응 기록) 조회 |

**예외 처리**
- 다른 조직 장애 → 404

**수용 기준**
- [ ] 같은 조직이면 역할과 무관하게 상세를 볼 수 있다
- [ ] 다른 조직 장애는 404다

## IC-004. 담당자 지정
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 처리 | 담당자 지정, OPEN → INVESTIGATING |

**예외 처리**
- Member의 지정 시도 → 403
- OPEN이 아닌 상태(INVESTIGATING/RESOLVED/CLOSED)에서 시도 → 409
- 비활성 사용자를 담당자로 지정 → 400
- 다른 조직 장애 → 404

> Manager/Admin은 자기 자신을 담당자로 지정할 수 있다 (RQ와 다른 정책 — 발견한 사람이 즉시 대응에 착수하는 것을 막지 않음)

**수용 기준**
- [ ] Manager/Admin만 지정할 수 있다
- [ ] 지정 즉시 OPEN → INVESTIGATING으로 전환된다
- [ ] Manager/Admin은 자기 자신을 지정할 수 있다

## IC-005. 담당자 변경
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 처리 | INVESTIGATING 상태에서 담당자 교체 |

**예외 처리**
- Member의 변경 시도 → 403
- INVESTIGATING이 아닌 상태에서 시도 → 409
- 비활성 사용자로 변경 → 400
- 같은 사람으로 재지정 → 변경 없이 200

> IC-004와 동일하게, Manager/Admin은 자기 자신으로 변경할 수 있다

**수용 기준**
- [ ] Manager/Admin만 변경할 수 있다
- [ ] INVESTIGATING 상태에서만 변경할 수 있다

## IC-006. 대응 기록 추가
| 항목 | 내용 |
|---|---|
| 사용자 | 담당자, Manager, Admin |
| 처리 | 타임라인에 자유 텍스트 기록 추가 (대응 경과·조치 내용) |

**예외 처리**
- 담당자도 Manager/Admin도 아닌 사용자 시도 → 403
- CLOSED 상태에서 시도 → 409
- 다른 조직 장애 → 404

**수용 기준**
- [ ] 담당자 또는 Manager/Admin만 기록을 추가할 수 있다
- [ ] CLOSED 상태에서는 기록을 추가할 수 없다
- [ ] 추가된 기록은 타임라인에 시간순으로 남는다

## IC-007. 심각도 변경
| 항목 | 내용 |
|---|---|
| 사용자 | 담당자, Manager, Admin |
| 처리 | 심각도(Critical/High/Medium/Low) 변경, peak는 (현재 peak, 새 심각도) 중 더 높은 쪽으로 갱신 — 낮아지는 변경은 peak에 반영되지 않음 |

**예외 처리**
- 담당자도 Manager/Admin도 아닌 사용자 시도 → 403
- CLOSED 상태에서 시도 → 409
- 다른 조직 장애 → 404

**수용 기준**
- [ ] 담당자 또는 Manager/Admin만 변경할 수 있다
- [ ] 심각도를 낮춰도 peak는 낮아지지 않는다

## IC-008. 해결 처리 (RESOLVED)
| 항목 | 내용 |
|---|---|
| 사용자 | 담당자, Manager, Admin |
| 처리 | INVESTIGATING → RESOLVED |

**예외 처리**
- 담당자도 Manager/Admin도 아닌 사용자 시도 → 403
- INVESTIGATING이 아닌 상태에서 시도(담당자 미지정 상태 포함) → 409

**수용 기준**
- [ ] 담당자 또는 Manager/Admin만 해결 처리를 할 수 있다
- [ ] INVESTIGATING 상태에서만 RESOLVED로 전환된다

## IC-009. Postmortem 작성
| 항목 | 내용 |
|---|---|
| 사용자 | 담당자, Manager, Admin |
| 처리 | RESOLVED 이후 Postmortem(원인·조치·재발 방지) 작성 또는 수정 |

**예외 처리**
- RESOLVED 이전(OPEN/INVESTIGATING) 상태에서 시도 → 409
- 담당자도 Manager/Admin도 아닌 사용자 시도 → 403
- CLOSED 이후 수정 시도 → 409

**수용 기준**
- [ ] RESOLVED 이후에만 작성할 수 있다
- [ ] CLOSED 전까지는 다시 수정할 수 있다

## IC-010. 종료 처리 (CLOSED)
| 항목 | 내용 |
|---|---|
| 사용자 | Manager, Admin |
| 처리 | RESOLVED → CLOSED |

**예외 처리**
- Member, 또는 Manager/Admin이 아닌 담당자의 시도 → 403
- RESOLVED가 아닌 상태에서 시도 → 409
- peak 심각도가 Medium 이상(Critical/High/Medium)인데 Postmortem 미작성 → 409

> 판정은 **종료 시점의 현재 심각도가 아니라 peak(생애주기 중 도달한 최고 심각도)** 기준이다.
> Critical로 시작했다가 나중에 Low로 낮춰도 peak는 Critical로 남아 Postmortem이 계속 필수다.

**수용 기준**
- [ ] Manager/Admin만 종료 처리를 할 수 있다
- [ ] RESOLVED 상태에서만 CLOSED로 전환된다
- [ ] peak 심각도가 Medium 이상이면 Postmortem 없이 종료할 수 없다
- [ ] 한 번이라도 Medium 이상이었다면, 이후 심각도를 낮춰도 Postmortem 의무는 사라지지 않는다

## IC-011. 상태 전이 요약
```
OPEN --(담당자 지정, IC-004)--> INVESTIGATING --(해결 처리, IC-008)--> RESOLVED --(종료 처리, IC-010)--> CLOSED
```

## API 매핑
| Method | Path | 권한 | SRS |
|---|---|---|---|
| POST | /api/incidents | 전체 | IC-001 |
| GET | /api/incidents | 전체(같은 조직 공개) | IC-002 |
| GET | /api/incidents/:id | 전체(같은 조직 공개) | IC-003 |
| PATCH | /api/incidents/:id/assignee | Manager, Admin | IC-004, IC-005 |
| POST | /api/incidents/:id/timeline | 담당자, Manager, Admin | IC-006 |
| PATCH | /api/incidents/:id/severity | 담당자, Manager, Admin | IC-007 |
| POST | /api/incidents/:id/resolve | 담당자, Manager, Admin | IC-008 |
| PUT | /api/incidents/:id/postmortem | 담당자, Manager, Admin | IC-009 |
| POST | /api/incidents/:id/close | Manager, Admin | IC-010 |

> 공통 오류 응답 형식, 페이지네이션, 정렬, 상태/심각도 필터는 RQ-SRS와 동일 규칙을 따름.

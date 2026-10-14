import { ConflictException, ForbiddenException } from '@nestjs/common';
import { isManagerOrAdmin, PublicUser } from '../auth/auth-user';
import { Incident, IncidentStatus, Severity } from './incident.entity';

// 장애의 상태 전이·권한 규칙 (INCIDENT SRS). DB와 무관한 순수 함수라 단위 테스트로 모든 경우를 검증한다.
// 역할만 보는 검사(Member 차단)는 컨트롤러의 @Roles()가 먼저 하고, 여기서는 담당자 관계와 상태를 본다.
// 같은 조직 안에서 권한이 없으면 403, 상태가 맞지 않으면 409. (다른 조직 장애는 조회 단계에서 404)
// 조회(IC-002, IC-003)는 같은 조직이면 전체 공개라 검사 함수가 없다.

type Actor = Pick<PublicUser, 'id' | 'role'>;
type Target = Pick<Incident, 'status' | 'assigneeId'>;

const SEVERITY_ORDER = Object.values(Severity); // LOW → CRITICAL
export const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
export const higherSeverity = (a: Severity, b: Severity) => (severityRank(a) >= severityRank(b) ? a : b);

// IC-010: peak가 Medium 이상이면 Postmortem 필수
export const requiresPostmortem = (peak: Severity) => severityRank(peak) >= severityRank(Severity.MEDIUM);

const isAssignee = (actor: Actor, inc: Target) => inc.assigneeId !== null && actor.id === inc.assigneeId;

function requireResponder(actor: Actor, inc: Target, action: string): void {
  if (!isAssignee(actor, inc) && !isManagerOrAdmin(actor)) {
    throw new ForbiddenException(`담당자 또는 Manager·Admin만 ${action}할 수 있습니다.`);
  }
}

function requireStatus(inc: Target, allowed: IncidentStatus[], action: string): void {
  if (!allowed.includes(inc.status)) {
    throw new ConflictException(`${inc.status} 상태의 장애는 ${action}할 수 없습니다.`);
  }
}

const NOT_CLOSED = [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED];

// IC-004 (OPEN, 지정) / IC-005 (INVESTIGATING, 변경). Manager/Admin(@Roles), 자기 자신 지정 허용.
export function assertCanAssign(inc: Target): void {
  requireStatus(inc, [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING], '담당자 지정');
}

// IC-006
export function assertCanAddNote(actor: Actor, inc: Target): void {
  requireResponder(actor, inc, '대응 기록을 추가');
  requireStatus(inc, NOT_CLOSED, '대응 기록 추가');
}

// IC-007
export function assertCanChangeSeverity(actor: Actor, inc: Target): void {
  requireResponder(actor, inc, '심각도를 변경');
  requireStatus(inc, NOT_CLOSED, '심각도 변경');
}

// IC-008: 담당자 미지정(OPEN)도 409
export function assertCanResolve(actor: Actor, inc: Target): void {
  requireResponder(actor, inc, '해결 처리');
  requireStatus(inc, [IncidentStatus.INVESTIGATING], '해결 처리');
}

// IC-009: RESOLVED에서만 작성·수정 (CLOSED 이후 409)
export function assertCanWritePostmortem(actor: Actor, inc: Target): void {
  requireResponder(actor, inc, 'Postmortem을 작성');
  requireStatus(inc, [IncidentStatus.RESOLVED], 'Postmortem 작성');
}

// IC-010: Manager/Admin(@Roles), RESOLVED, peak 기준 Postmortem 의무
export function assertCanClose(inc: Target & Pick<Incident, 'peakSeverity' | 'postmortemWrittenAt'>): void {
  requireStatus(inc, [IncidentStatus.RESOLVED], '종료 처리');
  if (requiresPostmortem(inc.peakSeverity) && !inc.postmortemWrittenAt) {
    throw new ConflictException(
      `최고 심각도가 ${inc.peakSeverity}였던 장애는 Postmortem을 작성해야 종료할 수 있습니다.`,
    );
  }
}

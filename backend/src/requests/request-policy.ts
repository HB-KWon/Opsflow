import { ConflictException, ForbiddenException } from '@nestjs/common';
import { isManagerOrAdmin, PublicUser } from '../auth/auth-user';
import { RequestStatus, WorkRequest } from './work-request.entity';

// 업무 요청의 상태 전이·소유권 규칙 (RQ SRS). DB와 무관한 순수 함수라 단위 테스트로 모든 경우를 검증한다.
// 역할만 보는 검사(Member 차단 등)는 컨트롤러의 @Roles()가 먼저 하고, 여기서는 요청자·담당자 관계와 상태를 본다.
// 같은 조직 안에서 권한이 없으면 403, 상태가 맞지 않으면 409. (다른 조직 요청은 조회 단계에서 404)

type Actor = Pick<PublicUser, 'id' | 'role'>;
type Target = Pick<WorkRequest, 'status' | 'requesterId' | 'assigneeId'>;

const isRequester = (actor: Actor, req: Target) => actor.id === req.requesterId;
const isAssignee = (actor: Actor, req: Target) => req.assigneeId !== null && actor.id === req.assigneeId;

function requireStatus(req: Target, allowed: RequestStatus[], action: string): void {
  if (!allowed.includes(req.status)) {
    throw new ConflictException(`${req.status} 상태의 요청은 ${action}할 수 없습니다.`);
  }
}

// RQ-002, RQ-003: 요청자 본인·담당자·Manager·Admin
export function canView(actor: Actor, req: Target): boolean {
  return isManagerOrAdmin(actor) || isRequester(actor, req) || isAssignee(actor, req);
}

// RQ-004: 요청자 본인, PENDING 또는 REJECTED
export function assertCanEdit(actor: Actor, req: Target): void {
  if (!isRequester(actor, req)) throw new ForbiddenException('요청자 본인만 수정할 수 있습니다.');
  requireStatus(req, [RequestStatus.PENDING, RequestStatus.REJECTED], '수정');
}

// RQ-005: 요청자 본인, PENDING
export function assertCanCancel(actor: Actor, req: Target): void {
  if (!isRequester(actor, req)) throw new ForbiddenException('요청자 본인만 취소할 수 있습니다.');
  requireStatus(req, [RequestStatus.PENDING], '취소');
}

// RQ-006, RQ-007: Manager/Admin(@Roles), 자기 요청 승인·반려 금지, PENDING
export function assertCanDecide(actor: Actor, req: Target): void {
  if (isRequester(actor, req)) throw new ForbiddenException('자신의 요청은 승인하거나 반려할 수 없습니다.');
  requireStatus(req, [RequestStatus.PENDING], '승인·반려');
}

// RQ-008, RQ-009: Manager/Admin(@Roles), APPROVED(지정) 또는 IN_PROGRESS(변경)
// "담당자 본인 위임/변경 금지": 자기 자신을 담당자로 지정할 수 없고, 현재 담당자는 담당자를 바꿀 수 없다.
export function assertCanAssign(actor: Actor, req: Target, newAssigneeId: string): void {
  if (isAssignee(actor, req)) throw new ForbiddenException('현재 담당자는 담당자를 변경할 수 없습니다.');
  if (newAssigneeId === actor.id) throw new ForbiddenException('자기 자신을 담당자로 지정할 수 없습니다.');
  requireStatus(req, [RequestStatus.APPROVED, RequestStatus.IN_PROGRESS], '담당자 지정');
}

// RQ-010: 담당자 본인·Manager·Admin, IN_PROGRESS
export function assertCanComplete(actor: Actor, req: Target): void {
  if (!isAssignee(actor, req) && !isManagerOrAdmin(actor)) {
    throw new ForbiddenException('담당자 또는 Manager·Admin만 완료 처리할 수 있습니다.');
  }
  requireStatus(req, [RequestStatus.IN_PROGRESS], '완료 처리');
}

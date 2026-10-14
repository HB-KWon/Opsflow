import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';
import {
  assertCanAssign,
  assertCanCancel,
  assertCanComplete,
  assertCanDecide,
  assertCanEdit,
  canView,
} from './request-policy';
import { RequestStatus } from './work-request.entity';

const REQUESTER = { id: 'requester', role: UserRole.MEMBER };
const ASSIGNEE = { id: 'assignee', role: UserRole.MEMBER };
const OTHER_MEMBER = { id: 'other', role: UserRole.MEMBER };
const MANAGER = { id: 'manager', role: UserRole.MANAGER };
const ADMIN = { id: 'admin', role: UserRole.ADMIN };

const ALL_STATUSES = Object.values(RequestStatus);
const req = (status: RequestStatus, assigneeId: string | null = null) => ({
  status,
  requesterId: REQUESTER.id,
  assigneeId,
});
const others = (...allowed: RequestStatus[]) => ALL_STATUSES.filter((s) => !allowed.includes(s));

describe('request-policy', () => {
  describe('canView (RQ-002, RQ-003)', () => {
    const target = req(RequestStatus.IN_PROGRESS, ASSIGNEE.id);

    it.each([
      ['요청자', REQUESTER, true],
      ['담당자', ASSIGNEE, true],
      ['Manager', MANAGER, true],
      ['Admin', ADMIN, true],
      ['무관한 Member', OTHER_MEMBER, false],
    ])('%s → %s', (_who, actor, expected) => {
      expect(canView(actor, target)).toBe(expected);
    });
  });

  describe('assertCanEdit (RQ-004)', () => {
    it.each([RequestStatus.PENDING, RequestStatus.REJECTED])('요청자는 %s 상태에서 수정 가능', (status) => {
      expect(() => assertCanEdit(REQUESTER, req(status))).not.toThrow();
    });

    it.each(others(RequestStatus.PENDING, RequestStatus.REJECTED))('%s 상태는 409', (status) => {
      expect(() => assertCanEdit(REQUESTER, req(status))).toThrow(ConflictException);
    });

    it.each([MANAGER, ADMIN, OTHER_MEMBER])('요청자가 아니면 Manager·Admin이어도 403 (%o)', (actor) => {
      expect(() => assertCanEdit(actor, req(RequestStatus.PENDING))).toThrow(ForbiddenException);
    });
  });

  describe('assertCanCancel (RQ-005)', () => {
    it('요청자는 PENDING을 취소할 수 있다', () => {
      expect(() => assertCanCancel(REQUESTER, req(RequestStatus.PENDING))).not.toThrow();
    });

    it.each(others(RequestStatus.PENDING))('%s 상태는 409', (status) => {
      expect(() => assertCanCancel(REQUESTER, req(status))).toThrow(ConflictException);
    });

    it.each([MANAGER, OTHER_MEMBER])('요청자가 아니면 403 (%o)', (actor) => {
      expect(() => assertCanCancel(actor, req(RequestStatus.PENDING))).toThrow(ForbiddenException);
    });
  });

  describe('assertCanDecide (RQ-006, RQ-007)', () => {
    it.each([MANAGER, ADMIN])('Manager·Admin은 남의 PENDING 요청을 승인·반려할 수 있다 (%o)', (actor) => {
      expect(() => assertCanDecide(actor, req(RequestStatus.PENDING))).not.toThrow();
    });

    it('자기 요청은 Manager여도 403 (자기 승인 금지)', () => {
      const selfRequest = { ...req(RequestStatus.PENDING), requesterId: MANAGER.id };
      expect(() => assertCanDecide(MANAGER, selfRequest)).toThrow(ForbiddenException);
    });

    it.each(others(RequestStatus.PENDING))('%s 상태는 409 (중복 승인 포함)', (status) => {
      expect(() => assertCanDecide(MANAGER, req(status))).toThrow(ConflictException);
    });
  });

  describe('assertCanAssign (RQ-008, RQ-009)', () => {
    it('APPROVED 요청에 다른 사람을 담당자로 지정할 수 있다', () => {
      expect(() => assertCanAssign(MANAGER, req(RequestStatus.APPROVED), ASSIGNEE.id)).not.toThrow();
    });

    it('IN_PROGRESS 요청의 담당자를 바꿀 수 있다', () => {
      expect(() => assertCanAssign(MANAGER, req(RequestStatus.IN_PROGRESS, ASSIGNEE.id), OTHER_MEMBER.id)).not.toThrow();
    });

    it.each(others(RequestStatus.APPROVED, RequestStatus.IN_PROGRESS))('%s 상태는 409', (status) => {
      expect(() => assertCanAssign(MANAGER, req(status), ASSIGNEE.id)).toThrow(ConflictException);
    });

    it('자기 자신을 담당자로 지정하면 403', () => {
      expect(() => assertCanAssign(MANAGER, req(RequestStatus.APPROVED), MANAGER.id)).toThrow(ForbiddenException);
    });

    it('현재 담당자(Manager)가 담당자를 바꾸려 하면 403', () => {
      const target = req(RequestStatus.IN_PROGRESS, MANAGER.id);
      expect(() => assertCanAssign(MANAGER, target, ASSIGNEE.id)).toThrow(ForbiddenException);
    });
  });

  describe('assertCanComplete (RQ-010)', () => {
    const inProgress = req(RequestStatus.IN_PROGRESS, ASSIGNEE.id);

    it.each([ASSIGNEE, MANAGER, ADMIN])('담당자·Manager·Admin은 완료할 수 있다 (%o)', (actor) => {
      expect(() => assertCanComplete(actor, inProgress)).not.toThrow();
    });

    it.each([REQUESTER, OTHER_MEMBER])('담당자가 아닌 Member는 요청자여도 403 (%o)', (actor) => {
      expect(() => assertCanComplete(actor, inProgress)).toThrow(ForbiddenException);
    });

    it.each(others(RequestStatus.IN_PROGRESS))('%s 상태는 409 (완료 후 재오픈 불가 포함)', (status) => {
      expect(() => assertCanComplete(MANAGER, req(status, ASSIGNEE.id))).toThrow(ConflictException);
    });
  });
});

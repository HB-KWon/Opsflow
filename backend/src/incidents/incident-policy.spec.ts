import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';
import {
  assertCanAddNote,
  assertCanAssign,
  assertCanChangeSeverity,
  assertCanClose,
  assertCanResolve,
  assertCanWritePostmortem,
  higherSeverity,
  requiresPostmortem,
} from './incident-policy';
import { IncidentStatus, Severity } from './incident.entity';

const ASSIGNEE = { id: 'assignee', role: UserRole.MEMBER };
const OTHER_MEMBER = { id: 'other', role: UserRole.MEMBER };
const MANAGER = { id: 'manager', role: UserRole.MANAGER };
const ADMIN = { id: 'admin', role: UserRole.ADMIN };

const ALL = Object.values(IncidentStatus);
const others = (...allowed: IncidentStatus[]) => ALL.filter((s) => !allowed.includes(s));
const inc = (status: IncidentStatus, assigneeId: string | null = ASSIGNEE.id) => ({ status, assigneeId });

// 담당자·Manager·Admin만 가능하고 정해진 상태에서만 되는 규칙 (IC-006~009 공통 모양)
describe.each([
  [
    'assertCanAddNote (IC-006)',
    assertCanAddNote,
    [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED],
  ],
  [
    'assertCanChangeSeverity (IC-007)',
    assertCanChangeSeverity,
    [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED],
  ],
  ['assertCanResolve (IC-008)', assertCanResolve, [IncidentStatus.INVESTIGATING]],
  ['assertCanWritePostmortem (IC-009)', assertCanWritePostmortem, [IncidentStatus.RESOLVED]],
] as const)('%s', (_name, assertFn, allowed) => {
  it.each([ASSIGNEE, MANAGER, ADMIN])('허용 상태에서 담당자·Manager·Admin은 통과 (%o)', (actor) => {
    for (const status of allowed) expect(() => assertFn(actor, inc(status))).not.toThrow();
  });

  it('담당자가 아닌 Member는 403', () => {
    for (const status of allowed) expect(() => assertFn(OTHER_MEMBER, inc(status))).toThrow(ForbiddenException);
  });

  it.each(others(...allowed))('%s 상태는 409', (status) => {
    expect(() => assertFn(MANAGER, inc(status))).toThrow(ConflictException);
  });
});

describe('assertCanAssign (IC-004, IC-005)', () => {
  it.each([IncidentStatus.OPEN, IncidentStatus.INVESTIGATING])('%s에서 지정·변경 가능', (status) => {
    expect(() => assertCanAssign(inc(status, null))).not.toThrow();
  });

  it.each(others(IncidentStatus.OPEN, IncidentStatus.INVESTIGATING))('%s 상태는 409', (status) => {
    expect(() => assertCanAssign(inc(status))).toThrow(ConflictException);
  });
});

it('IC-008: 담당자 미지정(OPEN) 상태의 해결 처리는 409', () => {
  expect(() => assertCanResolve(MANAGER, inc(IncidentStatus.OPEN, null))).toThrow(ConflictException);
});

describe('assertCanClose (IC-010)', () => {
  const resolved = (peakSeverity: Severity, postmortemWrittenAt: Date | null) => ({
    ...inc(IncidentStatus.RESOLVED),
    peakSeverity,
    postmortemWrittenAt,
  });

  it.each([Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM])('peak %s인데 Postmortem 없으면 409', (peak) => {
    expect(() => assertCanClose(resolved(peak, null))).toThrow(ConflictException);
  });

  it.each([Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM])('peak %s여도 Postmortem 있으면 종료 가능', (peak) => {
    expect(() => assertCanClose(resolved(peak, new Date()))).not.toThrow();
  });

  it('peak LOW면 Postmortem 없이 종료 가능', () => {
    expect(() => assertCanClose(resolved(Severity.LOW, null))).not.toThrow();
  });

  it.each(others(IncidentStatus.RESOLVED))('%s 상태는 409', (status) => {
    expect(() => assertCanClose({ ...resolved(Severity.LOW, new Date()), status })).toThrow(ConflictException);
  });
});

describe('심각도 비교', () => {
  it.each([
    [Severity.LOW, Severity.CRITICAL, Severity.CRITICAL],
    [Severity.CRITICAL, Severity.LOW, Severity.CRITICAL],
    [Severity.HIGH, Severity.MEDIUM, Severity.HIGH],
    [Severity.MEDIUM, Severity.MEDIUM, Severity.MEDIUM],
  ])('higherSeverity(%s, %s) = %s', (a, b, expected) => {
    expect(higherSeverity(a, b)).toBe(expected);
  });

  it.each([
    [Severity.LOW, false],
    [Severity.MEDIUM, true],
    [Severity.HIGH, true],
    [Severity.CRITICAL, true],
  ])('requiresPostmortem(%s) = %s', (peak, expected) => {
    expect(requiresPostmortem(peak)).toBe(expected);
  });
});

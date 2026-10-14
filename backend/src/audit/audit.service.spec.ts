import { ValidationPipe } from '@nestjs/common';
import { And, LessThan, MoreThanOrEqual } from 'typeorm';
import { ROLES_KEY } from '../auth/decorators';
import { UserRole } from '../users/user-role.enum';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { ListAuditLogsQuery } from './dto/audit-logs.dto';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const log = {
  id: 'log-1',
  organizationId: ORG,
  actorId: ACTOR,
  actor: { id: ACTOR, name: '관리자', passwordHash: 'secret' },
  entityType: 'work_request',
  entityId: '33333333-3333-4333-8333-333333333333',
  action: 'APPROVE',
  summary: '요청을 승인했습니다.',
  changes: { status: { from: 'PENDING', to: 'APPROVED' } },
  createdAt: new Date('2026-10-14T00:00:00Z'),
};

// 실제 서버와 같은 ValidationPipe 설정으로 쿼리 문자열을 DTO로 변환
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = (raw: Record<string, string>): Promise<ListAuditLogsQuery> =>
  pipe.transform(raw, { type: 'query', metatype: ListAuditLogsQuery });

describe('AuditService.listForOrganization', () => {
  let logs: { findAndCount: jest.Mock };
  let service: AuditService;

  beforeEach(() => {
    logs = { findAndCount: jest.fn().mockResolvedValue([[log], 41]) };
    service = new AuditService(logs as never);
  });

  it('필터 없이 조회하면 조직 조건만 걸고 createdAt DESC로 첫 페이지를 가져온다', async () => {
    const result = await service.listForOrganization(ORG, await parse({}));

    expect(logs.findAndCount).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      relations: { actor: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [
        {
          action: log.action,
          summary: log.summary,
          changes: log.changes,
          actor: { id: ACTOR, name: '관리자' },
          createdAt: log.createdAt,
          entityType: log.entityType,
          entityId: log.entityId,
        },
      ],
      page: 1,
      limit: 20,
      total: 41,
    });
  });

  it('actorId·entityType·날짜 범위 필터와 페이지를 반영한다', async () => {
    const query = await parse({
      actorId: ACTOR,
      entityType: 'work_request',
      from: '2026-10-01',
      to: '2026-10-15',
      page: '3',
      limit: '10',
    });
    await service.listForOrganization(ORG, query);

    const from = new Date('2026-10-01');
    const to = new Date('2026-10-15');
    expect(logs.findAndCount.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: ORG,
        actorId: ACTOR,
        entityType: 'work_request',
        createdAt: And(MoreThanOrEqual(from), LessThan(to)),
      },
      skip: 20,
      take: 10,
    });
  });

  it.each([
    ['from만', { from: '2026-10-01' }, MoreThanOrEqual(new Date('2026-10-01'))],
    ['to만', { to: '2026-10-15' }, LessThan(new Date('2026-10-15'))],
  ])('날짜 한쪽만 주면 그 조건만 건다 (%s)', async (_label, raw, expected) => {
    await service.listForOrganization(ORG, await parse(raw));
    expect(logs.findAndCount.mock.calls[0][0].where.createdAt).toEqual(expected);
  });
});

describe('ListAuditLogsQuery 검증', () => {
  it.each([
    ['limit 101', { limit: '101' }],
    ['limit 0', { limit: '0' }],
    ['잘못된 actorId', { actorId: 'not-a-uuid' }],
    ['잘못된 날짜', { from: 'yesterday' }],
    ['허용되지 않은 정렬 파라미터', { sort: 'action' }],
  ])('%s → 400', async (_label, raw) => {
    await expect(parse(raw)).rejects.toMatchObject({ status: 400 });
  });
});

describe('AuditController', () => {
  it('GET /api/audit-logs는 Admin 전용이다', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditController.prototype.list)).toEqual([UserRole.ADMIN]);
  });

  it('조직이 없는 계정은 403', () => {
    const controller = new AuditController({ listForOrganization: jest.fn() } as never);
    const user = { id: ACTOR, role: UserRole.ADMIN, organizationId: null } as never;
    expect(() => controller.list(user, {} as never)).toThrow(expect.objectContaining({ status: 403 }));
  });
});

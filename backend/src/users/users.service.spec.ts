import { ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { Invitation } from '../auth/invitation.entity';
import { ROLES_KEY } from '../auth/decorators';
import { ChangeRoleDto } from './dto/change-role.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const JOINED = new Date('2026-10-01T00:00:00Z');
const mkUser = (id: string, role: UserRole, isActive = true) =>
  Object.assign(new User(), {
    id,
    email: `${id}@opsflow.test`,
    name: id,
    role,
    organizationId: ORG,
    isActive,
    createdAt: JOINED,
  });
const ACTOR = {
  id: 'admin-a',
  role: UserRole.ADMIN,
  organizationId: ORG,
  sessionId: 's',
} as never;

describe('UsersService', () => {
  let manager: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let audit: { record: jest.Mock };
  let auth: { revokeAllSessions: jest.Mock };
  let service: UsersService;

  // admins: 잠그는 활성 Admin 목록, target: 대상 사용자
  const setup = (admins: User[], target: User | null) => {
    manager.find.mockResolvedValue(admins);
    manager.findOne.mockResolvedValue(target);
  };

  beforeEach(() => {
    manager = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    audit = { record: jest.fn() };
    auth = { revokeAllSessions: jest.fn() };
    const dataSource = {
      manager,
      transaction: (cb: (m: unknown) => unknown) => cb(manager),
    };
    service = new UsersService(dataSource as never, audit as never, auth as never);
  });

  describe('changeRole (AUTH-006)', () => {
    it('Member → Manager로 바꾸고 감사 로그를 같은 트랜잭션에 남긴다', async () => {
      const target = mkUser('member-1', UserRole.MEMBER);
      setup([mkUser('admin-a', UserRole.ADMIN)], target);

      const result = await service.changeRole(ACTOR, target.id, {
        role: UserRole.MANAGER,
      });

      expect(result).toMatchObject({ id: 'member-1', role: UserRole.MANAGER });
      expect(result).not.toHaveProperty('passwordHash');
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.MANAGER }));
      expect(audit.record).toHaveBeenCalledWith(manager, {
        organizationId: ORG,
        actorId: 'admin-a',
        entityType: 'USER',
        entityId: 'member-1',
        action: 'ROLE_CHANGED',
        summary: '역할 변경 (MEMBER → MANAGER)',
        changes: { role: { from: UserRole.MEMBER, to: UserRole.MANAGER } },
      });
    });

    it('활성 Admin 행을 먼저 id 순서로 잠그고, 대상은 같은 조직에서만 찾는다', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], mkUser('member-1', UserRole.MEMBER));
      await service.changeRole(ACTOR, 'member-1', { role: UserRole.ADMIN });

      expect(manager.find).toHaveBeenCalledWith(User, {
        where: { organizationId: ORG, role: UserRole.ADMIN, isActive: true },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.findOne).toHaveBeenCalledWith(User, {
        where: { id: 'member-1', organizationId: ORG },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.find.mock.invocationCallOrder[0]).toBeLessThan(manager.findOne.mock.invocationCallOrder[0]);
    });

    it('마지막 Admin이 스스로를 강등하면 409, 아무것도 저장하지 않는다', async () => {
      const self = mkUser('admin-a', UserRole.ADMIN);
      setup([self], self);

      await expect(service.changeRole(ACTOR, self.id, { role: UserRole.MANAGER })).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('Admin이 2명 이상이면 본인을 강등할 수 있다', async () => {
      const self = mkUser('admin-a', UserRole.ADMIN);
      setup([self, mkUser('admin-b', UserRole.ADMIN)], self);

      await expect(service.changeRole(ACTOR, self.id, { role: UserRole.MEMBER })).resolves.toMatchObject({
        role: UserRole.MEMBER,
      });
    });

    it('비활성 Admin은 활성 Admin 수에 들지 않으므로, 강등해도 막지 않는다', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], mkUser('admin-old', UserRole.ADMIN, false));

      await expect(service.changeRole(ACTOR, 'admin-old', { role: UserRole.MEMBER })).resolves.toMatchObject({
        role: UserRole.MEMBER,
      });
    });

    it('다른 조직이거나 없는 사용자는 404', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], null);
      await expect(service.changeRole(ACTOR, 'x', { role: UserRole.MEMBER })).rejects.toThrow(NotFoundException);
    });

    it('같은 역할로 바꾸면 저장·감사 로그 없이 그대로 돌려준다', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], mkUser('member-1', UserRole.MEMBER));

      await expect(service.changeRole(ACTOR, 'member-1', { role: UserRole.MEMBER })).resolves.toMatchObject({
        role: UserRole.MEMBER,
      });
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('조직이 없는 계정은 403', async () => {
      const noOrg = {
        id: 'a',
        role: UserRole.ADMIN,
        organizationId: null,
      } as never;
      await expect(service.changeRole(noOrg, 'x', { role: UserRole.MEMBER })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('list (AUTH-007)', () => {
    it('같은 조직 구성원과 초대중(미가입) 초대를 상태와 함께 준다', async () => {
      const future = new Date(Date.now() + 60_000);
      const past = new Date(Date.now() - 60_000);
      const inv = (id: string, expiresAt: Date) =>
        Object.assign(new Invitation(), {
          id,
          email: `${id}@x.test`,
          role: UserRole.MEMBER,
          createdAt: JOINED,
          expiresAt,
        });
      manager.find
        .mockResolvedValueOnce([mkUser('admin-a', UserRole.ADMIN), mkUser('old', UserRole.MEMBER, false)])
        .mockResolvedValueOnce([inv('inv-1', future), inv('inv-2', past)]);

      const result = await service.list(ACTOR);

      expect(manager.find).toHaveBeenCalledWith(User, {
        where: { organizationId: ORG },
        order: { createdAt: 'ASC' },
      });
      expect(manager.find).toHaveBeenCalledWith(Invitation, {
        where: {
          organizationId: ORG,
          acceptedAt: IsNull(),
          revokedAt: IsNull(),
        },
        order: { createdAt: 'DESC' },
      });
      expect(result.members).toEqual([
        {
          id: 'admin-a',
          name: 'admin-a',
          email: 'admin-a@opsflow.test',
          role: UserRole.ADMIN,
          status: 'ACTIVE',
          joinedAt: JOINED,
        },
        {
          id: 'old',
          name: 'old',
          email: 'old@opsflow.test',
          role: UserRole.MEMBER,
          status: 'INACTIVE',
          joinedAt: JOINED,
        },
      ]);
      expect(result.invitations.map((i) => [i.id, i.status])).toEqual([
        ['inv-1', 'INVITED'],
        ['inv-2', 'EXPIRED'],
      ]);
      expect(JSON.stringify(result)).not.toContain('tokenHash');
    });
  });

  it('assignable: 같은 조직 활성 사용자만, 드롭다운용 필드만 조회한다', async () => {
    manager.find.mockResolvedValue([]);
    await service.assignable(ACTOR);
    expect(manager.find).toHaveBeenCalledWith(User, {
      where: { organizationId: ORG, isActive: true },
      select: { id: true, name: true, email: true, role: true },
      order: { name: 'ASC' },
    });
  });

  describe('deactivate (AUTH-008)', () => {
    it('비활성화하고, 같은 트랜잭션에서 그 사용자의 세션을 모두 폐기하고 감사 로그를 남긴다', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], mkUser('member-1', UserRole.MEMBER));

      const result = await service.deactivate(ACTOR, 'member-1');

      expect(result).toMatchObject({ id: 'member-1', status: 'INACTIVE' });
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'member-1', isActive: false }));
      expect(auth.revokeAllSessions).toHaveBeenCalledWith(manager, 'member-1');
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          entityType: 'USER',
          entityId: 'member-1',
          action: 'DEACTIVATED',
          changes: { isActive: { from: true, to: false } },
        }),
      );
    });

    it('본인 비활성화는 Admin이 여러 명이어도 403, DB를 건드리지 않는다', async () => {
      await expect(service.deactivate(ACTOR, 'admin-a')).rejects.toThrow(ForbiddenException);
      expect(manager.find).not.toHaveBeenCalled();
    });

    it('이미 비활성이면 200(멱등), 저장·세션 폐기·감사 로그 없음', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], mkUser('old', UserRole.MEMBER, false));

      await expect(service.deactivate(ACTOR, 'old')).resolves.toMatchObject({
        status: 'INACTIVE',
      });
      expect(manager.save).not.toHaveBeenCalled();
      expect(auth.revokeAllSessions).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('다른 Admin을 비활성화할 수 있다', async () => {
      const other = mkUser('admin-b', UserRole.ADMIN);
      setup([mkUser('admin-a', UserRole.ADMIN), other], other);
      await expect(service.deactivate(ACTOR, 'admin-b')).resolves.toMatchObject({ status: 'INACTIVE' });
    });

    it('그사이 다른 Admin이 먼저 나를 비활성화해 남은 활성 Admin이 대상뿐이면 409', async () => {
      const other = mkUser('admin-b', UserRole.ADMIN);
      setup([other], other);
      await expect(service.deactivate(ACTOR, 'admin-b')).rejects.toThrow(ConflictException);
      expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('다른 조직이거나 없는 사용자는 404', async () => {
      setup([mkUser('admin-a', UserRole.ADMIN)], null);
      await expect(service.deactivate(ACTOR, 'x')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('UsersController / ChangeRoleDto', () => {
  it('assignable은 Manager·Admin 전용이다 (Member 403)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.assignable)).toEqual([UserRole.MANAGER, UserRole.ADMIN]);
  });

  it.each(['list', 'changeRole', 'deactivate'] as const)('%s는 Admin 전용이다 (Manager·Member는 403)', (method) => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype[method])).toEqual([UserRole.ADMIN]);
  });

  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  it.each([[{}], [{ role: 'OPERATOR' }], [{ role: 'ADMIN', organizationId: ORG }]])(
    '잘못된 본문 %o → 400',
    async (body) => {
      await expect(pipe.transform(body, { type: 'body', metatype: ChangeRoleDto })).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});

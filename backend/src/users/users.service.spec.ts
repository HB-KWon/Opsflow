import { ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../auth/decorators';
import { ChangeRoleDto } from './dto/change-role.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const mkUser = (id: string, role: UserRole, isActive = true) =>
  Object.assign(new User(), { id, email: `${id}@opsflow.test`, name: id, role, organizationId: ORG, isActive });
const ACTOR = { id: 'admin-a', role: UserRole.ADMIN, organizationId: ORG, sessionId: 's' } as never;

describe('UsersService.changeRole (AUTH-006)', () => {
  let manager: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let audit: { record: jest.Mock };
  let service: UsersService;

  // admins: 잠그는 활성 Admin 목록, target: 대상 사용자
  const setup = (admins: User[], target: User | null) => {
    manager.find.mockResolvedValue(admins);
    manager.findOne.mockResolvedValue(target);
  };

  beforeEach(() => {
    manager = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    audit = { record: jest.fn() };
    const dataSource = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
    service = new UsersService(dataSource as never, audit as never);
  });

  it('Member → Manager로 바꾸고 감사 로그를 같은 트랜잭션에 남긴다', async () => {
    const target = mkUser('member-1', UserRole.MEMBER);
    setup([mkUser('admin-a', UserRole.ADMIN)], target);

    const result = await service.changeRole(ACTOR, target.id, { role: UserRole.MANAGER });

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
    const noOrg = { id: 'a', role: UserRole.ADMIN, organizationId: null } as never;
    await expect(service.changeRole(noOrg, 'x', { role: UserRole.MEMBER })).rejects.toMatchObject({ status: 403 });
  });
});

describe('UsersController / ChangeRoleDto', () => {
  it('PATCH /api/users/:id/role은 Admin 전용이다 (Manager·Member는 403)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.changeRole)).toEqual([UserRole.ADMIN]);
  });

  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  it.each([[{}], [{ role: 'OPERATOR' }], [{ role: 'ADMIN', organizationId: ORG }]])('잘못된 본문 %o → 400', async (body) => {
    await expect(pipe.transform(body, { type: 'body', metatype: ChangeRoleDto })).rejects.toMatchObject({ status: 400 });
  });
});

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { AuthUser } from './auth-user';
import { Invitation } from './invitation.entity';
import { InvitationsService } from './invitations.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const ORG_ID = '22222222-2222-4222-8222-222222222222';

const admin: AuthUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@opsflow.test',
  name: '관리자',
  role: UserRole.ADMIN,
  organizationId: ORG_ID,
  sessionId: '44444444-4444-4444-8444-444444444444',
};

describe('InvitationsService', () => {
  let service: InvitationsService;
  let users: Record<string, jest.Mock>;
  let invitations: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let auth: { startSession: jest.Mock };
  let pending: Invitation;

  beforeEach(() => {
    pending = Object.assign(new Invitation(), {
      id: 'inv-1',
      organizationId: ORG_ID,
      email: 'invitee@opsflow.test',
      role: UserRole.MANAGER,
      tokenHash: sha256('valid-token'),
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      revokedAt: null,
    });

    users = { existsBy: jest.fn().mockResolvedValue(false) };
    invitations = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      create: jest.fn((data) => Object.assign(new Invitation(), data)),
      save: jest.fn(async (inv) => ({ id: 'inv-new', ...inv })),
    };
    manager = {
      findOne: jest.fn(async () => pending),
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((_entity, data) => Object.assign(new User(), data)),
      save: jest.fn(async (entity) => entity),
    };
    const dataSource = { transaction: jest.fn((work) => work(manager)) };
    auth = { startSession: jest.fn(async (user) => ({ accessToken: 'at', user })) };

    service = new InvitationsService(users as never, invitations as never, dataSource as never, auth as never);
  });

  describe('create', () => {
    it('관리자 조직으로 초대를 만들고, 토큰은 해시로만 저장한다', async () => {
      const result = await service.create(admin, { email: 'invitee@opsflow.test', role: UserRole.MEMBER });

      const saved = invitations.save.mock.calls[0][0] as Invitation;
      expect(saved.organizationId).toBe(ORG_ID);
      expect(saved.role).toBe(UserRole.MEMBER);
      expect(saved.invitedById).toBe(admin.id);
      expect(saved.tokenHash).toBe(sha256(result.token));
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('같은 이메일의 대기 중인 초대는 폐기한다', async () => {
      await service.create(admin, { email: 'invitee@opsflow.test', role: UserRole.MEMBER });

      const [where, values] = invitations.update.mock.calls[0];
      expect(where).toMatchObject({ organizationId: ORG_ID, email: 'invitee@opsflow.test' });
      expect(values.revokedAt).toBeInstanceOf(Date);
    });

    it('이미 가입된 이메일이면 409', async () => {
      users.existsBy.mockResolvedValue(true);
      await expect(
        service.create(admin, { email: 'invitee@opsflow.test', role: UserRole.MEMBER }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('조직이 없는 관리자는 403', async () => {
      await expect(
        service.create({ ...admin, organizationId: null }, { email: 'x@opsflow.test', role: UserRole.MEMBER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('accept', () => {
    const dto = { token: 'valid-token', name: '초대받은 사람', password: 'password123' };

    it('초대장의 이메일·역할·조직으로 계정을 만들고 바로 로그인시킨다', async () => {
      await service.accept(dto);

      const created = manager.save.mock.calls[0][0] as User;
      expect(created.email).toBe(pending.email);
      expect(created.role).toBe(UserRole.MANAGER);
      expect(created.organizationId).toBe(ORG_ID);
      expect(created.isActive).toBe(true);
      expect(await bcrypt.compare('password123', created.passwordHash)).toBe(true);
      expect(pending.acceptedAt).toBeInstanceOf(Date);
      expect(auth.startSession).toHaveBeenCalledWith(created);
    });

    it.each([
      ['만료된 초대', () => (pending.expiresAt = new Date(Date.now() - 1))],
      ['이미 수락한 초대', () => (pending.acceptedAt = new Date())],
      ['폐기된 초대', () => (pending.revokedAt = new Date())],
      ['없는 토큰', () => manager.findOne.mockResolvedValue(null)],
    ])('%s → 400', async (_case, arrange) => {
      arrange();
      await expect(service.accept(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(auth.startSession).not.toHaveBeenCalled();
    });

    it('그사이 같은 이메일로 가입된 계정이 있으면 409', async () => {
      manager.existsBy.mockResolvedValue(true);
      await expect(service.accept(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

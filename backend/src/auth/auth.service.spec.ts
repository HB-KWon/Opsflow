import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { AuthService } from './auth.service';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let users: Record<string, jest.Mock>;
  let sessions: Record<string, jest.Mock>;
  let user: User;

  beforeAll(async () => {
    user = Object.assign(new User(), {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'member@opsflow.test',
      name: '김직원',
      role: UserRole.MEMBER,
      organizationId: null,
      isActive: true,
      passwordHash: await bcrypt.hash('correct-password', 4),
    });
  });

  beforeEach(() => {
    users = {
      findOne: jest.fn().mockResolvedValue(user),
    };
    sessions = {
      insert: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    jwt = new JwtService({});
    const config = new ConfigService({
      JWT_ACCESS_SECRET: ACCESS_SECRET,
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    });
    service = new AuthService(users as never, sessions as never, jwt, config);
  });

  describe('login', () => {
    it('성공하면 Access 15분 / Refresh 7일 토큰을 주고, 세션에는 토큰 해시만 저장한다', async () => {
      const result = await service.login({ email: user.email, password: 'correct-password' });

      const access = await jwt.verifyAsync(result.accessToken, { secret: ACCESS_SECRET });
      const refresh = await jwt.verifyAsync(result.refreshToken, { secret: REFRESH_SECRET });
      expect(access.sub).toBe(user.id);
      expect(access.exp - access.iat).toBe(15 * 60);
      expect(refresh.exp - refresh.iat).toBe(7 * 24 * 60 * 60);
      expect(refresh.sid).toBe(access.sid);

      const inserted = sessions.insert.mock.calls[0][0];
      expect(inserted.tokenHash).toBe(sha256(result.refreshToken));
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.refreshExpiresAt.getTime()).toBe(refresh.exp * 1000);
    });

    it.each([
      ['비밀번호가 틀림', () => ({ email: user.email, password: 'wrong-password' }), () => {}],
      ['없는 이메일', () => ({ email: 'nobody@opsflow.test', password: 'x' }), () => users.findOne.mockResolvedValue(null)],
    ])('%s → 같은 401 메시지', async (_case, input, arrange) => {
      arrange();
      await expect(service.login(input())).rejects.toThrow(
        new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.'),
      );
      expect(sessions.insert).not.toHaveBeenCalled();
    });

    it('비활성 계정은 비밀번호가 맞으면 403', async () => {
      users.findOne.mockResolvedValue({ ...user, isActive: false });
      await expect(service.login({ email: user.email, password: 'correct-password' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(sessions.insert).not.toHaveBeenCalled();
    });

    it('비활성 계정이어도 비밀번호가 틀리면 401 (계정 상태 노출 방지)', async () => {
      users.findOne.mockResolvedValue({ ...user, isActive: false });
      await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    async function loginAndGetSession() {
      const { refreshToken } = await service.login({ email: user.email, password: 'correct-password' });
      const { sid } = jwt.decode(refreshToken) as { sid: string };
      sessions.findOne.mockResolvedValue({ id: sid, userId: user.id, user, revokedAt: null });
      return { refreshToken, sid };
    }

    it('새 토큰으로 교체하고, 기존 토큰 해시가 일치할 때만 갱신한다', async () => {
      const { refreshToken, sid } = await loginAndGetSession();

      const result = await service.refresh(refreshToken);

      expect(result.refreshToken).not.toBe(refreshToken);
      const [where, values] = sessions.update.mock.calls[0];
      expect(where).toMatchObject({ id: sid, tokenHash: sha256(refreshToken) });
      expect(values.tokenHash).toBe(sha256(result.refreshToken));
    });

    it('이미 교체된 토큰이 다시 오면 세션을 폐기하고 401', async () => {
      const { refreshToken, sid } = await loginAndGetSession();
      sessions.update.mockResolvedValueOnce({ affected: 0 });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

      const [where, values] = sessions.update.mock.calls[1];
      expect(where).toMatchObject({ id: sid });
      expect(values.revokedAt).toBeInstanceOf(Date);
    });

    it('폐기된 세션이면 401', async () => {
      const { refreshToken, sid } = await loginAndGetSession();
      sessions.findOne.mockResolvedValue({ id: sid, userId: user.id, user, revokedAt: new Date() });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('Access Token을 Refresh Token 자리에 넣으면 401', async () => {
      const { accessToken } = await service.login({ email: user.email, password: 'correct-password' });

      await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

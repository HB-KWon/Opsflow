import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { EntityManager, FindOptionsSelect, IsNull, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import {
  AccessTokenPayload,
  AuthResult,
  RefreshTokenPayload,
  toPublicUser,
} from './auth-user';
import { LoginDto } from './dto/auth.dto';
import { Session } from './session.entity';

export const BCRYPT_ROUNDS = 12;

const INVALID_CREDENTIALS = '이메일 또는 비밀번호가 올바르지 않습니다.';
const SESSION_EXPIRED = '세션이 만료되었습니다. 다시 로그인해 주세요.';

// passwordHash는 select: false라서 로그인할 때만 이 목록으로 함께 가져온다
const USER_WITH_PASSWORD: FindOptionsSelect<User> = {
  id: true,
  email: true,
  passwordHash: true,
  name: true,
  role: true,
  organizationId: true,
  isActive: true,
};

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  // 없는 이메일이어도 bcrypt 비교를 한 번 해서, 응답 시간으로 가입 여부를 알아낼 수 없게 한다
  private readonly dummyHash = bcrypt.hashSync(randomUUID(), BCRYPT_ROUNDS);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findOne({ where: { email: dto.email }, select: USER_WITH_PASSWORD });
    const matches = await bcrypt.compare(dto.password, user?.passwordHash ?? this.dummyHash);

    // 이메일 없음 / 비밀번호 틀림은 같은 메시지로 (계정 존재 여부 노출 방지, AUTH-001)
    if (!user || !matches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // 비활성 계정은 비밀번호가 맞을 때만 403으로 알려준다
    if (!user.isActive) {
      throw new ForbiddenException('비활성화된 계정입니다. 관리자에게 문의해 주세요.');
    }
    return this.startSession(user);
  }

  // Refresh Token Rotation: 쓸 때마다 새 토큰으로 바뀌고, 예전 토큰이 다시 오면 탈취로 보고 세션을 끊는다.
  async refresh(refreshToken: string): Promise<AuthResult> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.sessions.findOne({
      where: { id: payload.sid, userId: payload.sub },
      relations: { user: true },
    });
    if (!session || session.revokedAt || !session.user.isActive) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const next = this.signRefreshToken(session.userId, session.id);
    // 현재 해시와 일치할 때만 교체한다. 동시에 두 번 들어와도 한쪽만 성공한다.
    const { affected } = await this.sessions.update(
      { id: session.id, tokenHash: sha256(refreshToken), revokedAt: IsNull() },
      { tokenHash: sha256(next), expiresAt: this.expiryOf(next) },
    );
    if (affected !== 1) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    return {
      accessToken: this.signAccessToken(session.userId, session.id),
      refreshToken: next,
      refreshExpiresAt: this.expiryOf(next),
      user: toPublicUser(session.user),
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.revokeSession(sessionId);
  }

  // AUTH-008 비활성화: 로그아웃과 같은 방식(revokedAt 표시)으로 그 사용자의 모든 세션을 폐기한다.
  // 호출한 쪽 트랜잭션에 묶이도록 EntityManager를 받는다.
  async revokeAllSessions(manager: EntityManager, userId: string): Promise<void> {
    await manager.update(Session, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  // 로그인과 초대 수락(AUTH-005)이 함께 쓴다
  async startSession(user: User): Promise<AuthResult> {
    const sessionId = randomUUID();
    const refreshToken = this.signRefreshToken(user.id, sessionId);
    const refreshExpiresAt = this.expiryOf(refreshToken);
    await this.sessions.insert({
      id: sessionId,
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken: this.signAccessToken(user.id, sessionId),
      refreshToken,
      refreshExpiresAt,
      user: toPublicUser(user),
    };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private signAccessToken(userId: string, sessionId: string): string {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  private signRefreshToken(userId: string, sessionId: string): string {
    // jti가 없으면 같은 초에 만든 토큰이 완전히 똑같아져서 교체가 안 된다
    const payload: RefreshTokenPayload = { sub: userId, sid: sessionId, jti: randomUUID() };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
  }

  private expiryOf(token: string): Date {
    return new Date((this.jwt.decode(token) as { exp: number }).exp * 1000);
  }
}

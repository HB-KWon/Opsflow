import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AccessTokenPayload, AuthUser, toPublicUser } from './auth-user';
import { IS_PUBLIC_KEY } from './decorators';
import { Session } from './session.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // 서명·만료 검사를 통과한 뒤에도 세션과 사용자 상태를 DB에서 다시 확인한다.
  // 로그아웃·비활성화·역할 변경이 Access Token 만료(15분)를 기다리지 않고 바로 반영된다.
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const session = await this.sessions.findOne({
      where: { id: payload.sid, userId: payload.sub },
      relations: { user: true },
    });
    if (!session || session.revokedAt || !session.user.isActive) {
      throw new UnauthorizedException();
    }
    return { ...toPublicUser(session.user), sessionId: session.id };
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic || super.canActivate(context);
  }
}

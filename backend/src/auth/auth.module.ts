import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Invitation } from './invitation.entity';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard, JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { Session } from './session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Invitation]),
    PassportModule,
    // 비밀키·만료시간은 토큰 종류(Access/Refresh)마다 달라서 서명할 때 넘긴다
    JwtModule.register({}),
    // 로그인·토큰 갱신·초대 수락: IP당 1분에 10번까지
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    InvitationsService,
    JwtStrategy,
    // 모든 API에 로그인 검사를 기본 적용 (@Public()만 예외), 그다음 @Roles() 검사. 등록 순서대로 실행된다.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}

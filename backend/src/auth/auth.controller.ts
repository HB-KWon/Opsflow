import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { UserRole } from '../users/user-role.enum';
import { AuthResult, AuthUser, PublicUser } from './auth-user';
import { AuthService } from './auth.service';
import { CurrentUser, Public, Roles } from './decorators';
import { AcceptInvitationDto, CreateInvitationDto, LoginDto } from './dto/auth.dto';
import { CreatedInvitation, InvitationsService } from './invitations.service';

export const REFRESH_COOKIE = 'refresh_token';

// 응답 본문에는 Access Token만. Refresh Token은 httpOnly 쿠키로만 주고받는다 (AUTH-001)
interface TokenResponse {
  accessToken: string;
  user: PublicUser;
}

@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    private readonly invitations: InvitationsService,
    config: ConfigService,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      // refresh/logout에만 실려 가도록 경로를 좁힌다
      path: '/api/auth',
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<TokenResponse> {
    return this.sendTokens(res, await this.auth.login(dto));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<TokenResponse> {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    try {
      if (typeof token !== 'string' || !token) {
        throw new UnauthorizedException('세션이 만료되었습니다. 다시 로그인해 주세요.');
      }
      return this.sendTokens(res, await this.auth.refresh(token));
    } catch (e) {
      // 못 쓰게 된 쿠키는 지워서 브라우저가 계속 보내지 않게 한다
      if (e instanceof UnauthorizedException) res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): PublicUser {
    const { sessionId: _sessionId, ...publicUser } = user;
    return publicUser;
  }

  // AUTH-005 구성원 초대 (Admin 전용)
  @Roles(UserRole.ADMIN)
  @Post('invitations')
  createInvitation(@CurrentUser() admin: AuthUser, @Body() dto: CreateInvitationDto): Promise<CreatedInvitation> {
    return this.invitations.create(admin, dto);
  }

  // 초대 수락 = 유일한 계정 생성 경로. 가입 즉시 로그인 상태가 된다.
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('invitations/accept')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponse> {
    return this.sendTokens(res, await this.invitations.accept(dto));
  }

  private sendTokens(res: Response, result: AuthResult): TokenResponse {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieOptions,
      expires: result.refreshExpiresAt,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}

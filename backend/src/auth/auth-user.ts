import { ForbiddenException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

// API 응답과 req.user에 쓰는 사용자 정보. 비밀번호 해시 같은 내부 필드는 절대 넣지 않는다.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
}

export interface AuthUser extends PublicUser {
  sessionId: string;
}

// refreshToken은 응답 본문이 아니라 httpOnly 쿠키로만 내려간다 (컨트롤러에서 분리)
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  };
}

export const isManagerOrAdmin = (user: Pick<PublicUser, 'role'>) =>
  user.role === UserRole.MANAGER || user.role === UserRole.ADMIN;

// 조직 단위로 분리된 데이터를 다루는 API는 소속 조직이 있어야 한다
export function requireOrganization(user: PublicUser): string {
  if (!user.organizationId) {
    throw new ForbiddenException('소속 조직이 없는 계정입니다.');
  }
  return user.organizationId;
}

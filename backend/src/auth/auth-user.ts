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

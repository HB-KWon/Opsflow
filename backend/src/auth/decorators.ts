import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';
import { AuthUser } from './auth-user';

// 모든 API는 기본으로 로그인이 필요하다. 예외만 @Public()으로 연다.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// 이 역할 중 하나여야 호출할 수 있다. 아니면 403 (AUTH-004)
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/user-role.enum';
import { AuthUser } from './auth-user';
import { ROLES_KEY } from './decorators';

// JwtAuthGuard 다음에 실행된다. @Roles()가 없는 API는 통과, 있으면 역할이 맞지 않을 때 403.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    return !!user && roles.includes(user.role);
  }
}

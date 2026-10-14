import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UserRole } from './user-role.enum';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // AUTH-007. Manager·Member는 RolesGuard에서 403
  @Roles(UserRole.ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user);
  }

  // AUTH-006. Manager·Member는 RolesGuard에서 403
  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  changeRole(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) {
    return this.users.changeRole(user, id, dto);
  }

  // AUTH-008. 이미 비활성이면 그대로 200 (멱등)
  @Roles(UserRole.ADMIN)
  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deactivate(user, id);
  }
}

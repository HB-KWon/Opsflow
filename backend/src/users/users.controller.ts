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

  // 담당자 지정 드롭다운용 가벼운 목록 (AUTH-007 비고: 구성원 관리 목록과 분리). Member는 지정 권한이 없어 403
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Get('assignable')
  assignable(@CurrentUser() user: AuthUser) {
    return this.users.assignable(user);
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

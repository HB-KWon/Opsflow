import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UserRole } from './user-role.enum';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // AUTH-006. Manager·Member는 RolesGuard에서 403
  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  changeRole(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) {
    return this.users.changeRole(user, id, dto);
  }
}

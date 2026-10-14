import { IsEnum } from 'class-validator';
import { UserRole } from '../user-role.enum';

export class ChangeRoleDto {
  @IsEnum(UserRole, { message: '역할은 MEMBER, MANAGER, ADMIN 중 하나여야 합니다.' })
  role: UserRole;
}

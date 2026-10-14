import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, requireOrganization } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { UserRole } from '../users/user-role.enum';
import { AuditService } from './audit.service';
import { ListAuditLogsQuery } from './dto/audit-logs.dto';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAuditLogsQuery) {
    return this.audit.listForOrganization(requireOrganization(user), query);
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser, PublicUser, requireOrganization, toPublicUser } from '../auth/auth-user';
import { ChangeRoleDto } from './dto/change-role.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // AUTH-006. Admin 여부는 컨트롤러의 @Roles(ADMIN)가 검사한다.
  async changeRole(actor: AuthUser, id: string, dto: ChangeRoleDto): Promise<PublicUser> {
    const organizationId = requireOrganization(actor);
    return this.dataSource.transaction(async (manager) => {
      // 활성 Admin 행을 항상 같은 순서로 먼저 잠근다.
      // 두 Admin이 동시에 서로를 강등해 Admin이 0명이 되는 경쟁을 막고, 잠금 순서가 같아 교착도 없다.
      const admins = await manager.find(User, {
        where: { organizationId, role: UserRole.ADMIN, isActive: true },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const target = await manager.findOne(User, {
        where: { id, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('사용자를 찾을 수 없습니다.');
      if (target.role === dto.role) return toPublicUser(target);

      const removesActiveAdmin = target.isActive && target.role === UserRole.ADMIN;
      if (removesActiveAdmin && admins.length <= 1) {
        throw new ConflictException('조직에는 최소 1명의 Admin이 있어야 합니다.');
      }

      const from = target.role;
      target.role = dto.role;
      await manager.save(target);
      await this.audit.record(manager, {
        organizationId,
        actorId: actor.id,
        entityType: 'USER',
        entityId: target.id,
        action: 'ROLE_CHANGED',
        summary: `역할 변경 (${from} → ${dto.role})`,
        changes: { role: { from, to: dto.role } },
      });
      return toPublicUser(target);
    });
  }
}

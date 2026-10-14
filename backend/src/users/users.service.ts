import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser, PublicUser, requireOrganization, toPublicUser } from '../auth/auth-user';
import { AuthService } from '../auth/auth.service';
import { Invitation } from '../auth/invitation.entity';
import { ChangeRoleDto } from './dto/change-role.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

export interface MemberResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt: Date;
}

// 초대중(미가입). EXPIRED도 재발송(AUTH-009) 대상이다.
export interface PendingInvitationResponse {
  id: string;
  email: string;
  role: UserRole;
  status: 'INVITED' | 'EXPIRED';
  invitedAt: Date;
  expiresAt: Date;
}

export type AssignableUser = Pick<User, 'id' | 'name' | 'email' | 'role'>;

export interface MemberListResponse {
  members: MemberResponse[];
  invitations: PendingInvitationResponse[];
}

const toMember = (user: User): MemberResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.isActive ? 'ACTIVE' : 'INACTIVE',
  joinedAt: user.createdAt,
});

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  // AUTH-007. 구성원 관리 화면 전용. Admin 여부는 컨트롤러의 @Roles(ADMIN)가 검사한다.
  // shortcut: 페이지네이션 없이 전체를 준다, 조직 인원이 수백 명을 넘으면 page/limit 추가
  async list(actor: AuthUser): Promise<MemberListResponse> {
    const organizationId = requireOrganization(actor);
    const [users, invitations] = await Promise.all([
      this.dataSource.manager.find(User, { where: { organizationId }, order: { createdAt: 'ASC' } }),
      this.dataSource.manager.find(Invitation, {
        where: { organizationId, acceptedAt: IsNull(), revokedAt: IsNull() },
        order: { createdAt: 'DESC' },
      }),
    ]);
    const now = Date.now();
    return {
      members: users.map(toMember),
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.expiresAt.getTime() <= now ? 'EXPIRED' : 'INVITED',
        invitedAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      })),
    };
  }

  // 담당자로 지정할 수 있는 같은 조직의 활성 사용자. 드롭다운에 필요한 필드만 준다.
  async assignable(actor: AuthUser): Promise<AssignableUser[]> {
    return this.dataSource.manager.find(User, {
      where: { organizationId: requireOrganization(actor), isActive: true },
      select: { id: true, name: true, email: true, role: true },
      order: { name: 'ASC' },
    });
  }

  // AUTH-006
  async changeRole(actor: AuthUser, id: string, dto: ChangeRoleDto): Promise<PublicUser> {
    const organizationId = requireOrganization(actor);
    return this.dataSource.transaction(async (manager) => {
      const { admins, target } = await this.lockForUpdate(manager, organizationId, id);
      if (target.role === dto.role) return toPublicUser(target);
      if (target.role === UserRole.ADMIN) assertKeepsAnAdmin(target, admins);

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

  // AUTH-008. 로그인은 isActive로 막히고, 남은 세션은 같은 트랜잭션에서 폐기한다.
  async deactivate(actor: AuthUser, id: string): Promise<MemberResponse> {
    const organizationId = requireOrganization(actor);
    if (id === actor.id) throw new ForbiddenException('본인 계정은 비활성화할 수 없습니다.');
    return this.dataSource.transaction(async (manager) => {
      const { admins, target } = await this.lockForUpdate(manager, organizationId, id);
      if (!target.isActive) return toMember(target); // 멱등
      if (target.role === UserRole.ADMIN) assertKeepsAnAdmin(target, admins);

      target.isActive = false;
      await manager.save(target);
      await this.auth.revokeAllSessions(manager, target.id);
      await this.audit.record(manager, {
        organizationId,
        actorId: actor.id,
        entityType: 'USER',
        entityId: target.id,
        action: 'DEACTIVATED',
        summary: '구성원 비활성화',
        changes: { isActive: { from: true, to: false } },
      });
      return toMember(target);
    });
  }

  // 활성 Admin 행을 항상 같은 순서로 먼저 잠근 뒤 대상을 잠근다.
  // 두 Admin이 동시에 서로를 강등·비활성화해 Admin이 0명이 되는 경쟁을 막고, 잠금 순서가 같아 교착도 없다.
  private async lockForUpdate(manager: EntityManager, organizationId: string, id: string) {
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
    return { admins, target };
  }
}

// 대상 Admin이 활성 Admin 목록에서 빠져도 1명 이상 남아야 한다
function assertKeepsAnAdmin(target: User, activeAdmins: User[]): void {
  if (target.isActive && activeAdmins.length <= 1) {
    throw new ConflictException('조직에는 최소 1명의 Admin이 있어야 합니다.');
  }
}

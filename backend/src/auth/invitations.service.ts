import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { AuthResult, AuthUser, requireOrganization } from './auth-user';
import { AuthService, BCRYPT_ROUNDS, sha256 } from './auth.service';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/auth.dto';
import { Invitation } from './invitation.entity';

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

export interface CreatedInvitation {
  id: string;
  email: string;
  role: Invitation['role'];
  expiresAt: Date;
  // 이메일 발송이 붙기 전까지는 관리자가 이 토큰(링크)을 직접 전달한다. 응답에서 한 번만 보인다.
  token: string;
}

const EMAIL_TAKEN = '이미 가입된 이메일입니다.';

// AUTH-005: 공개 회원가입 없이, 관리자 초대를 수락할 때만 계정이 만들어진다
@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async create(admin: AuthUser, dto: CreateInvitationDto): Promise<CreatedInvitation> {
    if (!admin.organizationId) {
      throw new ForbiddenException('소속 조직이 없는 계정은 초대할 수 없습니다.');
    }
    // MVP는 1사용자 1조직
    if (await this.users.existsBy({ email: dto.email })) {
      throw new ConflictException(EMAIL_TAKEN);
    }

    return this.issue(this.invitations, admin.organizationId, admin.id, dto.email, dto.role);
  }

  // AUTH-009 초대 재발송. 새 토큰(새 유효기간)을 발급하고 기존 토큰은 폐기한다.
  async resend(admin: AuthUser, id: string): Promise<CreatedInvitation> {
    const organizationId = requireOrganization(admin);
    return this.dataSource.transaction(async (manager) => {
      // 같은 초대에 대한 수락(accept)과 순서가 섞이지 않도록 잠근다
      const invitation = await manager.findOne(Invitation, {
        where: { id, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw new NotFoundException('초대를 찾을 수 없습니다.');
      if (invitation.acceptedAt || (await manager.existsBy(User, { email: invitation.email }))) {
        throw new ConflictException('이미 가입한 구성원입니다.');
      }
      // 폐기된 초대는 더 새로운 초대로 대체된 것. 옛 역할로 되살리지 않도록 막는다.
      if (invitation.revokedAt) {
        throw new ConflictException('새 초대로 대체된 초대입니다. 최신 초대를 재발송해 주세요.');
      }

      const created = await this.issue(
        manager.getRepository(Invitation),
        organizationId,
        admin.id,
        invitation.email,
        invitation.role,
      );
      await this.audit.record(manager, {
        organizationId,
        actorId: admin.id,
        entityType: 'INVITATION',
        entityId: created.id,
        action: 'INVITATION_RESENT',
        summary: '초대 재발송',
        changes: { previousInvitationId: invitation.id },
      });
      return created;
    });
  }

  // 같은 조직에서 같은 이메일로 보낸 대기 중인 초대는 폐기하고 새로 발급한다 (재초대·재발송 공통)
  private async issue(
    invitations: Repository<Invitation>,
    organizationId: string,
    invitedById: string,
    email: string,
    role: UserRole,
  ): Promise<CreatedInvitation> {
    await invitations.update(
      { organizationId, email, acceptedAt: IsNull(), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    const token = randomBytes(32).toString('base64url');
    const invitation = await invitations.save(
      invitations.create({
        organizationId,
        email,
        role,
        tokenHash: sha256(token),
        invitedById,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      }),
    );

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  async accept(dto: AcceptInvitationDto): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.dataSource
      .transaction(async (manager) => {
        // 같은 초대로 동시에 두 번 가입해도 한 번만 성공하도록 행을 잠근다
        const invitation = await manager.findOne(Invitation, {
          where: { tokenHash: sha256(dto.token) },
          lock: { mode: 'pessimistic_write' },
        });
        if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
          throw new BadRequestException('유효하지 않은 초대입니다.');
        }
        if (invitation.expiresAt.getTime() <= Date.now()) {
          throw new BadRequestException('만료된 초대입니다. 관리자에게 다시 요청해 주세요.');
        }
        if (await manager.existsBy(User, { email: invitation.email })) {
          throw new ConflictException(EMAIL_TAKEN);
        }

        // 이메일·역할·조직은 모두 초대장에서 가져온다. 가입자는 이름과 비밀번호만 정한다.
        const created = await manager.save(
          manager.create(User, {
            email: invitation.email,
            name: dto.name,
            passwordHash,
            role: invitation.role,
            organizationId: invitation.organizationId,
            isActive: true,
          }),
        );
        invitation.acceptedAt = new Date();
        await manager.save(invitation);
        return created;
      })
      .catch((e) => {
        // 위의 중복 검사와 저장 사이에 같은 이메일이 먼저 들어온 경우
        if (e instanceof QueryFailedError && (e.driverError as { code?: string }).code === '23505') {
          throw new ConflictException(EMAIL_TAKEN);
        }
        throw e;
      });

    return this.auth.startSession(user);
  }
}

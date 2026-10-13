import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AuthResult, AuthUser } from './auth-user';
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
  ) {}

  async create(admin: AuthUser, dto: CreateInvitationDto): Promise<CreatedInvitation> {
    if (!admin.organizationId) {
      throw new ForbiddenException('소속 조직이 없는 계정은 초대할 수 없습니다.');
    }
    // MVP는 1사용자 1조직
    if (await this.users.existsBy({ email: dto.email })) {
      throw new ConflictException(EMAIL_TAKEN);
    }

    // 같은 조직에서 같은 이메일로 보낸 대기 중인 초대는 폐기하고 새로 발급한다 (재발송)
    await this.invitations.update(
      { organizationId: admin.organizationId, email: dto.email, acceptedAt: IsNull(), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    const token = randomBytes(32).toString('base64url');
    const invitation = await this.invitations.save(
      this.invitations.create({
        organizationId: admin.organizationId,
        email: dto.email,
        role: dto.role,
        tokenHash: sha256(token),
        invitedById: admin.id,
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

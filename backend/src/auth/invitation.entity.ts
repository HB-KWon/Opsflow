import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

// AUTH-005 조직 구성원 초대. 계정은 이 초대를 수락할 때만 만들어진다.
// 역할·조직은 가입자가 아니라 초대장이 정한다. 토큰은 원문 대신 SHA-256 해시만 저장한다.
@Entity('invitations')
@Index(['organizationId', 'email'])
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ length: 255 })
  email: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'invited_by_id', type: 'uuid' })
  invitedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy: User;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  // 같은 이메일을 다시 초대하면 예전 초대는 폐기된다
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

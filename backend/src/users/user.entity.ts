import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 저장 전에 소문자로 정규화한다 (DTO에서 처리)
  @Column({ length: 255, unique: true })
  email: string;

  // 기본 조회에서는 빠지도록 select: false. 로그인할 때만 명시적으로 가져온다.
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  // 조직 도메인은 아직 없어서 FK 없이 uuid만 둔다. 조직 엔티티를 만들 때 관계로 바꾼다.
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  // 삭제 대신 비활성화 (감사 로그 참조가 깨지지 않도록)
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

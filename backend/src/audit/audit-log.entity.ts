import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// append-only 변경 이력. 수정·삭제 API는 두지 않는다.
// 토큰·비밀번호·요청 본문 같은 민감하거나 긴 값은 넣지 않고, 무엇이 어떻게 바뀌었는지만 남긴다.
@Entity('audit_logs')
@Index(['organizationId', 'entityType', 'entityId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  @Column({ name: 'entity_type', length: 50 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 500 })
  summary: string;

  // 예: { "status": { "from": "PENDING", "to": "APPROVED" } }
  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

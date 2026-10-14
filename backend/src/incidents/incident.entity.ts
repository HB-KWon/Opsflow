import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// IC-011 상태 전이: OPEN → INVESTIGATING → RESOLVED → CLOSED
export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

// 선언 순서 = 낮은 것 → 높은 것. PostgreSQL enum은 선언 순서로 정렬되고, 비교(severityRank)도 이 순서를 쓴다.
export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// 삭제·취소 API는 없다 (취소·허위 신고 처리는 범위 밖)
@Entity('incidents')
@Index(['organizationId', 'status'])
@Index(['organizationId', 'severity'])
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.OPEN })
  status: IncidentStatus;

  @Column({ type: 'enum', enum: Severity, default: Severity.MEDIUM })
  severity: Severity;

  // 생애주기 중 도달한 최고 심각도. 올라가기만 한다. Postmortem 의무 판정(IC-010)에만 쓰고 응답에는 넣지 않는다.
  @Column({
    name: 'peak_severity',
    type: 'enum',
    enum: Severity,
    default: Severity.MEDIUM,
  })
  peakSeverity: Severity;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  // IC-009 Postmortem. 작성 여부는 postmortemWrittenAt으로 판단한다.
  @Column({ name: 'postmortem_cause', type: 'text', nullable: true })
  postmortemCause: string | null;

  @Column({ name: 'postmortem_action', type: 'text', nullable: true })
  postmortemAction: string | null;

  @Column({ name: 'postmortem_prevention', type: 'text', nullable: true })
  postmortemPrevention: string | null;

  @Column({
    name: 'postmortem_written_at',
    type: 'timestamptz',
    nullable: true,
  })
  postmortemWrittenAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

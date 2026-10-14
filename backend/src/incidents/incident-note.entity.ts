import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// IC-006 대응 기록. 자유 텍스트라 감사 로그(짧은 값만)에 넣지 않고 따로 저장한다. 수정·삭제 없음.
@Entity('incident_notes')
@Index(['incidentId', 'createdAt'])
export class IncidentNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// 로그인 한 번 = 세션 한 줄. Refresh Token은 원문 대신 SHA-256 해시만 저장한다.
// Access Token에도 세션 id(sid)가 들어 있어서, 세션을 폐기하면 Access Token도 바로 막힌다.
@Entity('sessions')
export class Session {
  // 토큰을 서명하기 전에 id가 필요해서 DB가 아니라 코드에서 만든다
  @PrimaryColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // 현재 유효한 Refresh Token의 해시. 갱신할 때마다 바뀐다.
  @Column({ name: 'token_hash', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

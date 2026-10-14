import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// 업무 요청 유형 (RQ-001 "요청 유형(템플릿)"). 조직마다 따로 가진다.
@Entity('request_templates')
@Index(['organizationId', 'name'], { unique: true })
export class RequestTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  // 더 이상 새 요청에 쓰지 않는 유형은 지우지 않고 비활성화한다 (기존 요청 참조 유지)
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// 새 조직을 만들 때 넣어 주는 기본 유형 (마스터플랜 1.1의 대표 요청들)
export const DEFAULT_TEMPLATES: Array<Pick<RequestTemplate, 'name' | 'description'>> = [
  { name: '계정 발급', description: '사내 시스템 계정 신규 발급' },
  { name: '접근 권한 요청', description: '서버·DB·서비스 접근 권한 부여' },
  { name: '설정 변경', description: '서비스·인프라 설정 변경' },
  { name: '장비 요청', description: '노트북·모니터 등 장비 지급' },
];

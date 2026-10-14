import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

// GET /api/audit-logs(Admin 전용 조직 전체 조회)는 SRS에 없는 기능이다.
// RQ 등 각 도메인이 남기는 감사 로그를 Admin이 한곳에서 추적할 수 있도록 운영 편의상 추가했다.

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

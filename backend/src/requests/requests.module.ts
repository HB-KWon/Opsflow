import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RequestTemplate } from './request-template.entity';
import { RequestsController, RequestTemplatesController } from './requests.controller';
import { RequestsService } from './requests.service';
import { WorkRequest } from './work-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkRequest, RequestTemplate]), AuditModule],
  controllers: [RequestsController, RequestTemplatesController],
  providers: [RequestsService],
})
export class RequestsModule {}

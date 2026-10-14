import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, EntityManager, FindOptionsWhere, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { ListAuditLogsQuery } from './dto/audit-logs.dto';

export interface AuditEntry {
  organizationId: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  changes?: Record<string, unknown> | null;
}

export interface AuditHistoryItem {
  action: string;
  summary: string;
  changes: Record<string, unknown> | null;
  actor: { id: string; name: string };
  createdAt: Date;
}

export interface AuditLogListResponse {
  items: (AuditHistoryItem & { entityType: string; entityId: string })[];
  page: number;
  limit: number;
  total: number;
}

const toHistoryItem = (log: AuditLog): AuditHistoryItem => ({
  action: log.action,
  summary: log.summary,
  changes: log.changes,
  actor: { id: log.actor.id, name: log.actor.name },
  createdAt: log.createdAt,
});

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  // 업무 변경과 같은 트랜잭션 안에서 기록하도록 EntityManager를 받는다
  async record(manager: EntityManager, entry: AuditEntry): Promise<void> {
    await manager.save(manager.create(AuditLog, { ...entry, changes: entry.changes ?? null }));
  }

  async historyOf(organizationId: string, entityType: string, entityId: string): Promise<AuditHistoryItem[]> {
    const logs = await this.logs.find({
      where: { organizationId, entityType, entityId },
      relations: { actor: true },
      order: { createdAt: 'ASC' },
    });
    return logs.map(toHistoryItem);
  }

  // 조직 전체 감사 로그 (Admin 화면용). 단건 엔티티 이력은 historyOf를 쓴다.
  async listForOrganization(organizationId: string, query: ListAuditLogsQuery): Promise<AuditLogListResponse> {
    const where: FindOptionsWhere<AuditLog> = { organizationId };
    if (query.actorId) where.actorId = query.actorId;
    if (query.entityType) where.entityType = query.entityType;
    const range = [
      ...(query.from ? [MoreThanOrEqual(query.from)] : []),
      ...(query.to ? [LessThan(query.to)] : []),
    ];
    if (range.length) where.createdAt = range.length === 1 ? range[0] : And(...range);

    const [logs, total] = await this.logs.findAndCount({
      where,
      relations: { actor: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: logs.map((log) => ({ ...toHistoryItem(log), entityType: log.entityType, entityId: log.entityId })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }
}

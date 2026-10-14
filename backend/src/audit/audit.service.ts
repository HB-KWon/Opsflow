import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

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
    return logs.map((log) => ({
      action: log.action,
      summary: log.summary,
      changes: log.changes,
      actor: { id: log.actor.id, name: log.actor.name },
      createdAt: log.createdAt,
    }));
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditEntry, AuditHistoryItem, AuditService } from '../audit/audit.service';
import { AuthUser, requireOrganization } from '../auth/auth-user';
import { User } from '../users/user.entity';
import {
  AddNoteDto,
  AssignIncidentDto,
  ChangeSeverityDto,
  CreateIncidentDto,
  ListIncidentsQuery,
  PostmortemDto,
  SORT_FIELDS,
} from './dto/incidents.dto';
import {
  assertCanAddNote,
  assertCanAssign,
  assertCanChangeSeverity,
  assertCanClose,
  assertCanResolve,
  assertCanWritePostmortem,
  higherSeverity,
} from './incident-policy';
import { IncidentNote } from './incident-note.entity';
import { Incident, IncidentStatus, Severity } from './incident.entity';

const ENTITY_TYPE = 'INCIDENT';
const NOT_FOUND = '장애를 찾을 수 없습니다.';

type UserSummary = { id: string; name: string; email: string };

export interface IncidentResponse {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: Severity;
  reporter: UserSummary;
  assignee: UserSummary | null;
  postmortem: {
    cause: string;
    action: string;
    prevention: string;
    writtenAt: Date;
  } | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// 등록·담당자 지정·심각도 변경·해결·Postmortem·종료(감사 로그) + 대응 기록(content)을 시간순으로
export type TimelineItem = AuditHistoryItem & { content?: string };

export interface IncidentDetailResponse extends IncidentResponse {
  timeline: TimelineItem[];
}

export interface IncidentListResponse {
  items: IncidentResponse[];
  page: number;
  limit: number;
  total: number;
}

type Change = Pick<AuditEntry, 'action' | 'summary' | 'changes'>;

const RELATIONS = { reporter: true, assignee: true } as const;

const summarize = (user: User | null): UserSummary | null =>
  user ? { id: user.id, name: user.name, email: user.email } : null;

// peakSeverity는 내부 판정용이라 응답에 넣지 않는다 (IC-001)
function toResponse(inc: Incident): IncidentResponse {
  return {
    id: inc.id,
    title: inc.title,
    description: inc.description,
    status: inc.status,
    severity: inc.severity,
    reporter: summarize(inc.reporter)!,
    assignee: summarize(inc.assignee),
    postmortem: inc.postmortemWrittenAt
      ? {
          cause: inc.postmortemCause!,
          action: inc.postmortemAction!,
          prevention: inc.postmortemPrevention!,
          writtenAt: inc.postmortemWrittenAt,
        }
      : null,
    resolvedAt: inc.resolvedAt,
    closedAt: inc.closedAt,
    createdAt: inc.createdAt,
    updatedAt: inc.updatedAt,
  };
}

const statusChange = (from: IncidentStatus, to: IncidentStatus) => ({
  status: { from, to },
});

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidents: Repository<Incident>,
    @InjectRepository(IncidentNote)
    private readonly notes: Repository<IncidentNote>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // IC-001: 모든 역할, 즉시 OPEN, peak는 초기 심각도로 시작
  async create(user: AuthUser, dto: CreateIncidentDto): Promise<IncidentResponse> {
    const organizationId = requireOrganization(user);
    const severity = dto.severity ?? Severity.MEDIUM;

    const id = await this.dataSource.transaction(async (manager) => {
      const { identifiers } = await manager.insert(Incident, {
        organizationId,
        title: dto.title,
        description: dto.description,
        status: IncidentStatus.OPEN,
        severity,
        peakSeverity: severity,
        reporterId: user.id,
      });
      const incidentId = identifiers[0].id as string;
      await this.audit.record(manager, {
        organizationId,
        actorId: user.id,
        entityType: ENTITY_TYPE,
        entityId: incidentId,
        action: 'CREATED',
        summary: `장애 등록 (${severity})`,
        changes: {
          status: { from: null, to: IncidentStatus.OPEN },
          severity: { from: null, to: severity },
        },
      });
      return incidentId;
    });

    return toResponse(await this.load(organizationId, id));
  }

  // IC-002: 같은 조직이면 역할 무관 전체 공개
  async list(user: AuthUser, query: ListIncidentsQuery): Promise<IncidentListResponse> {
    const qb = this.incidents
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.reporter', 'reporter')
      .leftJoinAndSelect('i.assignee', 'assignee')
      .where('i.organizationId = :organizationId', {
        organizationId: requireOrganization(user),
      });

    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.severity) qb.andWhere('i.severity = :severity', { severity: query.severity });

    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const [items, total] = await qb
      .orderBy(`i.${SORT_FIELDS[query.sort]}`, order)
      .addOrderBy('i.id', order) // 같은 값끼리 순서가 페이지마다 바뀌지 않도록
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      items: items.map(toResponse),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  // IC-003: 다른 조직 → 404. 같은 조직이면 전체 공개.
  async findOne(user: AuthUser, id: string): Promise<IncidentDetailResponse> {
    const organizationId = requireOrganization(user);
    const inc = await this.load(organizationId, id);

    const [history, notes] = await Promise.all([
      this.audit.historyOf(organizationId, ENTITY_TYPE, id),
      this.notes.find({ where: { incidentId: id } }),
    ]);
    const contentById = new Map(notes.map((n) => [n.id, n.content]));
    const timeline = history.map((item) => {
      const noteId = item.action === 'NOTE_ADDED' ? (item.changes?.noteId as string | undefined) : undefined;
      return noteId ? { ...item, content: contentById.get(noteId) } : item;
    });
    return { ...toResponse(inc), timeline };
  }

  // IC-004 (OPEN → INVESTIGATING, 지정) / IC-005 (INVESTIGATING 유지, 변경)
  assign(user: AuthUser, id: string, dto: AssignIncidentDto): Promise<IncidentResponse> {
    return this.mutate(user, id, async (inc, manager) => {
      assertCanAssign(inc);

      const assignee = await manager.findOne(User, {
        where: {
          id: dto.assigneeId,
          organizationId: inc.organizationId,
          isActive: true,
        },
      });
      if (!assignee) throw new BadRequestException('같은 조직의 활성 사용자만 담당자로 지정할 수 있습니다.');

      const previousAssigneeId = inc.assigneeId;
      if (previousAssigneeId === assignee.id) return null; // IC-005: 같은 사람이면 변경 없이 200
      inc.assigneeId = assignee.id;

      if (inc.status === IncidentStatus.OPEN) {
        inc.status = IncidentStatus.INVESTIGATING;
        return {
          action: 'ASSIGNED',
          summary: `담당자 지정: ${assignee.name}`,
          changes: {
            assignee: { from: null, to: assignee.id },
            ...statusChange(IncidentStatus.OPEN, IncidentStatus.INVESTIGATING),
          },
        };
      }
      return {
        action: 'ASSIGNEE_CHANGED',
        summary: `담당자 변경: ${assignee.name}`,
        changes: { assignee: { from: previousAssigneeId, to: assignee.id } },
      };
    });
  }

  // IC-006: 본문은 incident_notes에, 감사 로그에는 note id만
  async addNote(user: AuthUser, id: string, dto: AddNoteDto): Promise<TimelineItem> {
    let note!: IncidentNote;
    await this.mutate(user, id, async (inc, manager) => {
      assertCanAddNote(user, inc);
      note = await manager.save(
        manager.create(IncidentNote, {
          incidentId: inc.id,
          authorId: user.id,
          content: dto.content,
        }),
      );
      return {
        action: 'NOTE_ADDED',
        summary: '대응 기록 추가',
        changes: { noteId: note.id },
      };
    });
    return {
      action: 'NOTE_ADDED',
      summary: '대응 기록 추가',
      changes: { noteId: note.id },
      actor: { id: user.id, name: user.name },
      createdAt: note.createdAt,
      content: note.content,
    };
  }

  // IC-007: peak는 더 높은 쪽으로만 갱신
  changeSeverity(user: AuthUser, id: string, dto: ChangeSeverityDto): Promise<IncidentResponse> {
    return this.mutate(user, id, async (inc) => {
      assertCanChangeSeverity(user, inc);
      if (inc.severity === dto.severity) return null;

      const changes: Record<string, unknown> = {
        severity: { from: inc.severity, to: dto.severity },
      };
      const peak = higherSeverity(inc.peakSeverity, dto.severity);
      if (peak !== inc.peakSeverity) {
        changes.peakSeverity = { from: inc.peakSeverity, to: peak };
        inc.peakSeverity = peak;
      }
      const from = inc.severity;
      inc.severity = dto.severity;
      return {
        action: 'SEVERITY_CHANGED',
        summary: `심각도 변경 (${from} → ${dto.severity})`,
        changes,
      };
    });
  }

  // IC-008
  resolve(user: AuthUser, id: string): Promise<IncidentResponse> {
    return this.mutate(user, id, async (inc) => {
      assertCanResolve(user, inc);
      inc.status = IncidentStatus.RESOLVED;
      inc.resolvedAt = new Date();
      return {
        action: 'RESOLVED',
        summary: '해결 처리',
        changes: statusChange(IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED),
      };
    });
  }

  // IC-009: 작성·수정 공통. 본문은 감사 로그에 넣지 않는다.
  writePostmortem(user: AuthUser, id: string, dto: PostmortemDto): Promise<IncidentResponse> {
    return this.mutate(user, id, async (inc) => {
      assertCanWritePostmortem(user, inc);
      const isFirst = !inc.postmortemWrittenAt;
      inc.postmortemCause = dto.cause;
      inc.postmortemAction = dto.action;
      inc.postmortemPrevention = dto.prevention;
      inc.postmortemWrittenAt = new Date();
      return isFirst
        ? { action: 'POSTMORTEM_WRITTEN', summary: 'Postmortem 작성' }
        : { action: 'POSTMORTEM_UPDATED', summary: 'Postmortem 수정' };
    });
  }

  // IC-010: Manager/Admin(@Roles). peak 기준 Postmortem 의무
  close(user: AuthUser, id: string): Promise<IncidentResponse> {
    return this.mutate(user, id, async (inc) => {
      assertCanClose(inc);
      inc.status = IncidentStatus.CLOSED;
      inc.closedAt = new Date();
      return {
        action: 'CLOSED',
        summary: '종료 처리',
        changes: statusChange(IncidentStatus.RESOLVED, IncidentStatus.CLOSED),
      };
    });
  }

  // 모든 변경의 공통 틀: 장애 행을 잠그고 → 규칙 검사·변경 → 저장 + 감사 로그를 한 트랜잭션으로 (RequestsService.mutate와 같음)
  private async mutate(
    user: AuthUser,
    id: string,
    change: (inc: Incident, manager: EntityManager) => Promise<Change | null>,
  ): Promise<IncidentResponse> {
    const organizationId = requireOrganization(user);

    await this.dataSource.transaction(async (manager) => {
      // 관계를 함께 불러오면 FOR UPDATE를 걸 수 없어서 장애 행만 잠근다
      const inc = await manager.findOne(Incident, {
        where: { id, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inc) throw new NotFoundException(NOT_FOUND);

      const result = await change(inc, manager);
      if (!result) return;

      await manager.save(inc);
      await this.audit.record(manager, {
        organizationId,
        actorId: user.id,
        entityType: ENTITY_TYPE,
        entityId: id,
        ...result,
      });
    });

    return toResponse(await this.load(organizationId, id));
  }

  private async load(organizationId: string, id: string): Promise<Incident> {
    const inc = await this.incidents.findOne({
      where: { id, organizationId },
      relations: RELATIONS,
    });
    if (!inc) throw new NotFoundException(NOT_FOUND);
    return inc;
  }
}

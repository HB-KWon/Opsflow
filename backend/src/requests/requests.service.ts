import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditEntry, AuditHistoryItem, AuditService } from '../audit/audit.service';
import { AuthUser, isManagerOrAdmin, requireOrganization } from '../auth/auth-user';
import { User } from '../users/user.entity';
import {
  AssignRequestDto,
  CreateRequestDto,
  ListRequestsQuery,
  RejectRequestDto,
  SORT_FIELDS,
  UpdateRequestDto,
} from './dto/requests.dto';
import {
  assertCanAssign,
  assertCanCancel,
  assertCanComplete,
  assertCanDecide,
  assertCanEdit,
  canView,
} from './request-policy';
import { RequestTemplate } from './request-template.entity';
import { RequestStatus, WorkRequest } from './work-request.entity';

const ENTITY_TYPE = 'WORK_REQUEST';
const NOT_FOUND = '업무 요청을 찾을 수 없습니다.';
const TEMPLATE_NOT_FOUND = '존재하지 않는 요청 유형입니다.';

type UserSummary = { id: string; name: string; email: string };

export interface RequestResponse {
  id: string;
  template: { id: string; name: string };
  title: string;
  content: string;
  status: RequestStatus;
  requester: UserSummary;
  assignee: UserSummary | null;
  approvedBy: UserSummary | null;
  approvedAt: Date | null;
  rejectedBy: UserSummary | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestDetailResponse extends RequestResponse {
  history: AuditHistoryItem[];
}

export interface RequestListResponse {
  items: RequestResponse[];
  page: number;
  limit: number;
  total: number;
}

// 상태가 바뀌는 작업이 감사 로그에 남길 내용 (요청 id·조직·행위자는 공통으로 채운다)
type Change = Pick<AuditEntry, 'action' | 'summary' | 'changes'>;

const RELATIONS = { template: true, requester: true, assignee: true, approvedBy: true, rejectedBy: true } as const;

const summarize = (user: User | null): UserSummary | null =>
  user ? { id: user.id, name: user.name, email: user.email } : null;

function toResponse(req: WorkRequest): RequestResponse {
  return {
    id: req.id,
    template: { id: req.template.id, name: req.template.name },
    title: req.title,
    content: req.content,
    status: req.status,
    requester: summarize(req.requester)!,
    assignee: summarize(req.assignee),
    approvedBy: summarize(req.approvedBy),
    approvedAt: req.approvedAt,
    rejectedBy: summarize(req.rejectedBy),
    rejectedAt: req.rejectedAt,
    rejectionReason: req.rejectionReason,
    cancelledAt: req.cancelledAt,
    completedAt: req.completedAt,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
  };
}

const statusChange = (from: RequestStatus, to: RequestStatus) => ({ status: { from, to } });

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(WorkRequest) private readonly requests: Repository<WorkRequest>,
    @InjectRepository(RequestTemplate) private readonly templates: Repository<RequestTemplate>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async listTemplates(user: AuthUser): Promise<Array<Pick<RequestTemplate, 'id' | 'name' | 'description'>>> {
    return this.templates.find({
      where: { organizationId: requireOrganization(user), isActive: true },
      select: { id: true, name: true, description: true },
      order: { name: 'ASC' },
    });
  }

  // RQ-001
  async create(user: AuthUser, dto: CreateRequestDto): Promise<RequestResponse> {
    const organizationId = requireOrganization(user);

    const id = await this.dataSource.transaction(async (manager) => {
      await this.findActiveTemplate(manager, organizationId, dto.templateId);
      const { identifiers } = await manager.insert(WorkRequest, {
        organizationId,
        templateId: dto.templateId,
        title: dto.title,
        content: dto.content,
        status: RequestStatus.PENDING,
        requesterId: user.id,
      });
      const requestId = identifiers[0].id as string;
      await this.audit.record(manager, {
        organizationId,
        actorId: user.id,
        entityType: ENTITY_TYPE,
        entityId: requestId,
        action: 'CREATED',
        summary: '요청 생성',
        changes: { status: { from: null, to: RequestStatus.PENDING } },
      });
      return requestId;
    });

    return toResponse(await this.load(organizationId, id));
  }

  // RQ-002: Member는 본인이 요청자이거나 담당자인 것만, Manager·Admin은 조직 전체
  async list(user: AuthUser, query: ListRequestsQuery): Promise<RequestListResponse> {
    const qb = this.requests
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.template', 'template')
      .leftJoinAndSelect('r.requester', 'requester')
      .leftJoinAndSelect('r.assignee', 'assignee')
      .leftJoinAndSelect('r.approvedBy', 'approvedBy')
      .leftJoinAndSelect('r.rejectedBy', 'rejectedBy')
      .where('r.organizationId = :organizationId', { organizationId: requireOrganization(user) });

    if (!isManagerOrAdmin(user)) {
      qb.andWhere('(r.requesterId = :me OR r.assigneeId = :me)', { me: user.id });
    }
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.templateId) qb.andWhere('r.templateId = :templateId', { templateId: query.templateId });

    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const [items, total] = await qb
      .orderBy(`r.${SORT_FIELDS[query.sort]}`, order)
      .addOrderBy('r.id', order) // 같은 값끼리 순서가 페이지마다 바뀌지 않도록
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return { items: items.map(toResponse), page: query.page, limit: query.limit, total };
  }

  // RQ-003: 다른 조직 → 404, 같은 조직이지만 권한 없음 → 403. 상태 변경 이력을 함께 준다.
  async findOne(user: AuthUser, id: string): Promise<RequestDetailResponse> {
    const organizationId = requireOrganization(user);
    const req = await this.load(organizationId, id);
    if (!canView(user, req)) throw new ForbiddenException('이 요청을 볼 권한이 없습니다.');

    const history = await this.audit.historyOf(organizationId, ENTITY_TYPE, id);
    return { ...toResponse(req), history };
  }

  // RQ-004: REJECTED에서 수정하면 PENDING으로 재제출
  update(user: AuthUser, id: string, dto: UpdateRequestDto): Promise<RequestResponse> {
    const fields = (['templateId', 'title', 'content'] as const).filter((f) => dto[f] !== undefined);
    if (fields.length === 0) throw new BadRequestException('수정할 항목(templateId, title, content)을 하나 이상 보내 주세요.');

    return this.mutate(user, id, async (req, manager) => {
      assertCanEdit(user, req);
      if (dto.templateId !== undefined) {
        await this.findActiveTemplate(manager, req.organizationId, dto.templateId);
        req.templateId = dto.templateId;
      }
      if (dto.title !== undefined) req.title = dto.title;
      if (dto.content !== undefined) req.content = dto.content;

      // 내용은 길거나 민감할 수 있어 감사 로그에는 바뀐 항목 이름만 남긴다
      if (req.status === RequestStatus.REJECTED) {
        req.status = RequestStatus.PENDING;
        req.rejectedById = null;
        req.rejectedAt = null;
        req.rejectionReason = null;
        return {
          action: 'RESUBMITTED',
          summary: '반려된 요청 수정 후 재제출',
          changes: { fields, ...statusChange(RequestStatus.REJECTED, RequestStatus.PENDING) },
        };
      }
      return { action: 'UPDATED', summary: '요청 수정', changes: { fields } };
    });
  }

  // RQ-005
  cancel(user: AuthUser, id: string): Promise<RequestResponse> {
    return this.mutate(user, id, async (req) => {
      assertCanCancel(user, req);
      req.status = RequestStatus.CANCELLED;
      req.cancelledAt = new Date();
      return {
        action: 'CANCELLED',
        summary: '요청자 취소',
        changes: statusChange(RequestStatus.PENDING, RequestStatus.CANCELLED),
      };
    });
  }

  // RQ-006: 상태 변경·승인 기록·감사 로그를 한 트랜잭션으로
  approve(user: AuthUser, id: string): Promise<RequestResponse> {
    return this.mutate(user, id, async (req) => {
      assertCanDecide(user, req);
      req.status = RequestStatus.APPROVED;
      req.approvedById = user.id;
      req.approvedAt = new Date();
      return {
        action: 'APPROVED',
        summary: '요청 승인',
        changes: statusChange(RequestStatus.PENDING, RequestStatus.APPROVED),
      };
    });
  }

  // RQ-007
  reject(user: AuthUser, id: string, dto: RejectRequestDto): Promise<RequestResponse> {
    return this.mutate(user, id, async (req) => {
      assertCanDecide(user, req);
      req.status = RequestStatus.REJECTED;
      req.rejectedById = user.id;
      req.rejectedAt = new Date();
      req.rejectionReason = dto.reason;
      return {
        action: 'REJECTED',
        summary: `요청 반려: ${dto.reason}`.slice(0, 500),
        changes: statusChange(RequestStatus.PENDING, RequestStatus.REJECTED),
      };
    });
  }

  // RQ-008 (APPROVED → IN_PROGRESS, 담당자 지정) / RQ-009 (IN_PROGRESS 유지, 담당자 변경)
  assign(user: AuthUser, id: string, dto: AssignRequestDto): Promise<RequestResponse> {
    return this.mutate(user, id, async (req, manager) => {
      assertCanAssign(user, req, dto.assigneeId);

      const assignee = await manager.findOne(User, {
        where: { id: dto.assigneeId, organizationId: req.organizationId, isActive: true },
      });
      if (!assignee) throw new BadRequestException('같은 조직의 활성 사용자만 담당자로 지정할 수 있습니다.');

      const previousAssigneeId = req.assigneeId;
      if (previousAssigneeId === assignee.id) return null; // 같은 사람으로 다시 지정하면 아무것도 바꾸지 않는다
      req.assigneeId = assignee.id;

      if (req.status === RequestStatus.APPROVED) {
        req.status = RequestStatus.IN_PROGRESS;
        return {
          action: 'ASSIGNED',
          summary: `담당자 지정: ${assignee.name}`,
          changes: {
            assignee: { from: null, to: assignee.id },
            ...statusChange(RequestStatus.APPROVED, RequestStatus.IN_PROGRESS),
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

  // RQ-010
  complete(user: AuthUser, id: string): Promise<RequestResponse> {
    return this.mutate(user, id, async (req) => {
      assertCanComplete(user, req);
      req.status = RequestStatus.COMPLETED;
      req.completedAt = new Date();
      return {
        action: 'COMPLETED',
        summary: '업무 완료',
        changes: statusChange(RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED),
      };
    });
  }

  // 모든 상태 변경의 공통 틀: 요청 행을 잠그고(동시 승인 등 방지) → 규칙 검사·변경 → 저장 + 감사 로그를 한 트랜잭션으로
  private async mutate(
    user: AuthUser,
    id: string,
    change: (req: WorkRequest, manager: EntityManager) => Promise<Change | null>,
  ): Promise<RequestResponse> {
    const organizationId = requireOrganization(user);

    await this.dataSource.transaction(async (manager) => {
      // 관계를 함께 불러오면 FOR UPDATE를 걸 수 없어서 요청 행만 잠근다
      const req = await manager.findOne(WorkRequest, {
        where: { id, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!req) throw new NotFoundException(NOT_FOUND);

      const result = await change(req, manager);
      if (!result) return;

      await manager.save(req);
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

  private async load(organizationId: string, id: string): Promise<WorkRequest> {
    const req = await this.requests.findOne({ where: { id, organizationId }, relations: RELATIONS });
    if (!req) throw new NotFoundException(NOT_FOUND);
    return req;
  }

  private async findActiveTemplate(
    manager: EntityManager,
    organizationId: string,
    templateId: string,
  ): Promise<RequestTemplate> {
    const template = await manager.findOne(RequestTemplate, {
      where: { id: templateId, organizationId, isActive: true },
    });
    if (!template) throw new NotFoundException(TEMPLATE_NOT_FOUND);
    return template;
  }
}

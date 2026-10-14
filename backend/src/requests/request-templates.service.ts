import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser, requireOrganization } from '../auth/auth-user';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/request-templates.dto';
import { RequestTemplate } from './request-template.entity';

export type TemplateResponse = Pick<RequestTemplate, 'id' | 'name' | 'description' | 'isActive' | 'createdAt'>;

const ENTITY_TYPE = 'REQUEST_TEMPLATE';
const NAME_TAKEN = '같은 이름의 요청 유형이 이미 있습니다.';

const toResponse = (t: RequestTemplate): TemplateResponse => ({
  id: t.id,
  name: t.name,
  description: t.description,
  isActive: t.isActive,
  createdAt: t.createdAt,
});

// RQ-012 요청 유형 관리 (Admin 전용, 역할은 컨트롤러의 @Roles(ADMIN)가 검사). 삭제는 없고 보관만 한다.
@Injectable()
export class RequestTemplatesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // Admin의 includeArchived=true 조회. 기본 목록(활성만)은 RequestsService.listTemplates 그대로.
  async listIncludingArchived(user: AuthUser): Promise<TemplateResponse[]> {
    const templates = await this.dataSource.manager.find(RequestTemplate, {
      where: { organizationId: requireOrganization(user) },
      order: { name: 'ASC' },
    });
    return templates.map(toResponse);
  }

  async create(user: AuthUser, dto: CreateTemplateDto): Promise<TemplateResponse> {
    const organizationId = requireOrganization(user);
    return this.inTransaction(async (manager) => {
      await assertNameFree(manager, organizationId, dto.name);
      const template = await manager.save(
        manager.create(RequestTemplate, { organizationId, name: dto.name, description: dto.description ?? null }),
      );
      await this.audit.record(manager, {
        organizationId,
        actorId: user.id,
        entityType: ENTITY_TYPE,
        entityId: template.id,
        action: 'TEMPLATE_CREATED',
        summary: `요청 유형 생성 (${template.name})`,
        changes: { name: template.name },
      });
      return toResponse(template);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateTemplateDto): Promise<TemplateResponse> {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('수정할 항목(name, description)을 하나 이상 보내 주세요.');
    }
    const organizationId = requireOrganization(user);
    return this.inTransaction(async (manager) => {
      const template = await lockTemplate(manager, organizationId, id);
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      if (dto.name !== undefined && dto.name !== template.name) {
        await assertNameFree(manager, organizationId, dto.name, template.id);
        changes.name = { from: template.name, to: dto.name };
        template.name = dto.name;
      }
      if (dto.description !== undefined && dto.description !== template.description) {
        changes.description = { from: template.description, to: dto.description };
        template.description = dto.description;
      }
      if (Object.keys(changes).length === 0) return toResponse(template);

      await manager.save(template);
      await this.audit.record(manager, {
        organizationId,
        actorId: user.id,
        entityType: ENTITY_TYPE,
        entityId: template.id,
        action: 'TEMPLATE_UPDATED',
        summary: `요청 유형 수정 (${template.name})`,
        changes,
      });
      return toResponse(template);
    });
  }

  // 기존 요청의 template 참조는 그대로 두고, 새 요청에서만 고를 수 없게 한다
  async archive(user: AuthUser, id: string): Promise<TemplateResponse> {
    const organizationId = requireOrganization(user);
    return this.inTransaction(async (manager) => {
      const template = await lockTemplate(manager, organizationId, id);
      if (!template.isActive) return toResponse(template); // 멱등

      template.isActive = false;
      await manager.save(template);
      await this.audit.record(manager, {
        organizationId,
        actorId: user.id,
        entityType: ENTITY_TYPE,
        entityId: template.id,
        action: 'TEMPLATE_ARCHIVED',
        summary: `요청 유형 보관 (${template.name})`,
        changes: { isActive: { from: true, to: false } },
      });
      return toResponse(template);
    });
  }

  private inTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work).catch((e) => {
      // 중복 검사와 저장 사이에 같은 이름이 먼저 들어온 경우 (organization_id, name 유니크 인덱스)
      if (e instanceof QueryFailedError && (e.driverError as { code?: string }).code === '23505') {
        throw new ConflictException(NAME_TAKEN);
      }
      throw e;
    });
  }
}

async function lockTemplate(manager: EntityManager, organizationId: string, id: string): Promise<RequestTemplate> {
  const template = await manager.findOne(RequestTemplate, {
    where: { id, organizationId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!template) throw new NotFoundException('존재하지 않는 요청 유형입니다.');
  return template;
}

// 보관된 유형도 이름을 차지한다 (유니크 인덱스가 조직 전체 기준)
async function assertNameFree(manager: EntityManager, organizationId: string, name: string, exceptId?: string) {
  const taken = await manager.existsBy(RequestTemplate, {
    organizationId,
    name,
    ...(exceptId ? { id: Not(exceptId) } : {}),
  });
  if (taken) throw new ConflictException(NAME_TAKEN);
}

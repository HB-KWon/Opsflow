import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Not, QueryFailedError } from 'typeorm';
import { ROLES_KEY } from '../auth/decorators';
import { UserRole } from '../users/user-role.enum';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/request-templates.dto';
import { RequestTemplate } from './request-template.entity';
import { RequestTemplatesService } from './request-templates.service';
import { RequestTemplatesController } from './requests.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const ADMIN = {
  id: 'admin',
  role: UserRole.ADMIN,
  organizationId: ORG,
} as never;
const mkTemplate = (over: Partial<RequestTemplate> = {}) =>
  Object.assign(new RequestTemplate(), {
    id: 'tpl-1',
    organizationId: ORG,
    name: '계정 발급',
    description: '설명',
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  });

describe('RequestTemplatesService (RQ-012)', () => {
  let manager: Record<string, jest.Mock>;
  let audit: { record: jest.Mock };
  let service: RequestTemplatesService;

  beforeEach(() => {
    manager = {
      find: jest.fn(),
      findOne: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(false),
      create: jest.fn((_e, data) => Object.assign(new RequestTemplate(), data)),
      save: jest.fn(async (t) => Object.assign(t, { id: t.id ?? 'tpl-new' })),
    };
    audit = { record: jest.fn() };
    const dataSource = {
      manager,
      transaction: (work: (m: unknown) => unknown) => work(manager),
    };
    service = new RequestTemplatesService(dataSource as never, audit as never);
  });

  describe('create', () => {
    it('조직에 활성 유형을 만들고 TEMPLATE_CREATED를 남긴다', async () => {
      const result = await service.create(ADMIN, { name: '보안 점검' });

      expect(manager.existsBy).toHaveBeenCalledWith(RequestTemplate, {
        organizationId: ORG,
        name: '보안 점검',
      });
      expect(result).toMatchObject({
        id: 'tpl-new',
        name: '보안 점검',
        description: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          entityType: 'REQUEST_TEMPLATE',
          entityId: 'tpl-new',
          action: 'TEMPLATE_CREATED',
        }),
      );
    });

    it('같은 조직에 같은 이름이 있으면(보관된 유형 포함) 409', async () => {
      manager.existsBy.mockResolvedValue(true);
      await expect(service.create(ADMIN, { name: '계정 발급' })).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('검사 뒤 동시에 같은 이름이 먼저 저장되면(유니크 위반) 409', async () => {
      manager.save.mockRejectedValue(new QueryFailedError('insert', [], Object.assign(new Error(), { code: '23505' })));
      await expect(service.create(ADMIN, { name: '보안 점검' })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('이름·설명을 바꾸고 바뀐 값을 TEMPLATE_UPDATED로 남긴다. 자기 자신은 중복 검사에서 뺀다', async () => {
      manager.findOne.mockResolvedValue(mkTemplate());

      const result = await service.update(ADMIN, 'tpl-1', {
        name: '계정 신규 발급',
        description: null,
      });

      expect(manager.findOne).toHaveBeenCalledWith(RequestTemplate, {
        where: { id: 'tpl-1', organizationId: ORG },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.existsBy).toHaveBeenCalledWith(RequestTemplate, {
        organizationId: ORG,
        name: '계정 신규 발급',
        id: Not('tpl-1'),
      });
      expect(result).toMatchObject({
        name: '계정 신규 발급',
        description: null,
        isActive: true,
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: 'TEMPLATE_UPDATED',
          changes: {
            name: { from: '계정 발급', to: '계정 신규 발급' },
            description: { from: '설명', to: null },
          },
        }),
      );
    });

    it('자기 이름 그대로 보내면 중복 검사도 저장·감사 로그도 하지 않는다', async () => {
      manager.findOne.mockResolvedValue(mkTemplate());
      await service.update(ADMIN, 'tpl-1', { name: '계정 발급' });
      expect(manager.existsBy).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('다른 유형과 이름이 겹치면 409', async () => {
      manager.findOne.mockResolvedValue(mkTemplate());
      manager.existsBy.mockResolvedValue(true);
      await expect(service.update(ADMIN, 'tpl-1', { name: '설정 변경' })).rejects.toThrow(ConflictException);
    });

    it('빈 본문은 400', async () => {
      await expect(service.update(ADMIN, 'tpl-1', {})).rejects.toThrow(BadRequestException);
    });

    it('다른 조직이거나 없는 유형은 404', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.update(ADMIN, 'x', { name: 'a' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('보관하고 TEMPLATE_ARCHIVED를 남긴다', async () => {
      manager.findOne.mockResolvedValue(mkTemplate());
      await expect(service.archive(ADMIN, 'tpl-1')).resolves.toMatchObject({
        isActive: false,
      });
      expect(audit.record).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: 'TEMPLATE_ARCHIVED',
          changes: { isActive: { from: true, to: false } },
        }),
      );
    });

    it('이미 보관된 유형이면 200(멱등), 저장·감사 로그 없음', async () => {
      manager.findOne.mockResolvedValue(mkTemplate({ isActive: false }));
      await expect(service.archive(ADMIN, 'tpl-1')).resolves.toMatchObject({
        isActive: false,
      });
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('다른 조직이거나 없는 유형은 404', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.archive(ADMIN, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  it('listIncludingArchived는 활성 여부와 상관없이 조직의 유형을 isActive와 함께 준다', async () => {
    manager.find.mockResolvedValue([mkTemplate(), mkTemplate({ id: 'tpl-2', name: '옛 유형', isActive: false })]);
    const result = await service.listIncludingArchived(ADMIN);
    expect(manager.find).toHaveBeenCalledWith(RequestTemplate, {
      where: { organizationId: ORG },
      order: { name: 'ASC' },
    });
    expect(result.map((t) => [t.name, t.isActive])).toEqual([
      ['계정 발급', true],
      ['옛 유형', false],
    ]);
  });
});

describe('RequestTemplatesController', () => {
  const requests = {
    listTemplates: jest.fn().mockResolvedValue('active-only'),
  };
  const templates = {
    listIncludingArchived: jest.fn().mockResolvedValue('with-archived'),
  };
  const controller = new RequestTemplatesController(requests as never, templates as never);

  it.each([
    ['Admin + includeArchived=true', UserRole.ADMIN, 'true', 'with-archived'],
    ['Admin, 파라미터 없음', UserRole.ADMIN, undefined, 'active-only'],
    ['Admin + includeArchived=1 (true만 인정)', UserRole.ADMIN, '1', 'active-only'],
    ['Manager + includeArchived=true → 무시', UserRole.MANAGER, 'true', 'active-only'],
    ['Member + includeArchived=true → 무시', UserRole.MEMBER, 'true', 'active-only'],
  ])('%s', async (_label, role, includeArchived, expected) => {
    await expect(controller.list({ role } as never, includeArchived)).resolves.toBe(expected);
  });

  it.each(['create', 'update', 'archive'] as const)('%s는 Admin 전용이다 (Manager·Member는 403)', (method) => {
    expect(Reflect.getMetadata(ROLES_KEY, RequestTemplatesController.prototype[method])).toEqual([UserRole.ADMIN]);
  });

  it('목록 조회는 역할 제한이 없다', () => {
    expect(Reflect.getMetadata(ROLES_KEY, RequestTemplatesController.prototype.list)).toBeUndefined();
  });
});

describe('요청 유형 DTO 검증', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const check = (metatype: unknown, body: object) =>
    pipe.transform(body, { type: 'body', metatype: metatype as never });

  it.each([
    ['이름 없음', CreateTemplateDto, {}],
    ['공백만 있는 이름', CreateTemplateDto, { name: '   ' }],
    ['101자 이름', CreateTemplateDto, { name: 'a'.repeat(101) }],
    ['수정에 isActive 포함', UpdateTemplateDto, { isActive: true }],
    ['501자 설명', UpdateTemplateDto, { description: 'a'.repeat(501) }],
  ])('%s → 400', async (_label, metatype, body) => {
    await expect(check(metatype, body)).rejects.toMatchObject({ status: 400 });
  });

  it('이름 앞뒤 공백은 잘라낸다', async () => {
    await expect(check(CreateTemplateDto, { name: '  보안 점검 ' })).resolves.toMatchObject({ name: '보안 점검' });
  });
});

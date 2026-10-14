import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { UserRole } from '../users/user-role.enum';
import {
  AssignRequestDto,
  CreateRequestDto,
  ListRequestsQuery,
  RejectRequestDto,
  UpdateRequestDto,
} from './dto/requests.dto';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/request-templates.dto';
import { RequestTemplatesService } from './request-templates.service';
import { RequestsService } from './requests.service';

// RQ SRS API 매핑. 로그인은 전역 JwtAuthGuard, 역할은 @Roles()(RolesGuard),
// 요청자·담당자 관계와 상태 규칙은 서비스(request-policy)에서 검사한다.
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRequestsQuery) {
    return this.requests.list(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRequestDto) {
    return this.requests.update(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.cancel(user, id);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.approve(user, id);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectRequestDto) {
    return this.requests.reject(user, id, dto);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(':id/assignee')
  assign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRequestDto) {
    return this.requests.assign(user, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.complete(user, id);
  }
}

// 요청 생성 폼에서 고를 유형 목록 + RQ-012 유형 관리(Admin)
@Controller('request-templates')
export class RequestTemplatesController {
  constructor(
    private readonly requests: RequestsService,
    private readonly templates: RequestTemplatesService,
  ) {}

  // includeArchived=true는 Admin일 때만 반영하고, 다른 역할이면 무시한다
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('includeArchived') includeArchived?: string) {
    if (includeArchived === 'true' && user.role === UserRole.ADMIN) {
      return this.templates.listIncludingArchived(user);
    }
    return this.requests.listTemplates(user);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(user, id, dto);
  }

  // 이미 보관된 유형이면 그대로 200 (멱등)
  @Roles(UserRole.ADMIN)
  @Post(':id/archive')
  @HttpCode(200)
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.archive(user, id);
  }
}

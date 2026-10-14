import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { AuthUser } from "../auth/auth-user";
import { CurrentUser, Roles } from "../auth/decorators";
import { UserRole } from "../users/user-role.enum";
import {
  AddNoteDto,
  AssignIncidentDto,
  ChangeSeverityDto,
  CreateIncidentDto,
  ListIncidentsQuery,
  PostmortemDto,
} from "./dto/incidents.dto";
import { IncidentsService } from "./incidents.service";

// INCIDENT SRS API 매핑. 로그인은 전역 JwtAuthGuard, 역할은 @Roles()(RolesGuard),
// 담당자 관계와 상태 규칙은 서비스(incident-policy)에서 검사한다.
@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.incidents.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListIncidentsQuery) {
    return this.incidents.list(user, query);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.incidents.findOne(user, id);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(":id/assignee")
  assign(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignIncidentDto,
  ) {
    return this.incidents.assign(user, id, dto);
  }

  @Post(":id/timeline")
  addNote(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.incidents.addNote(user, id, dto);
  }

  @Patch(":id/severity")
  changeSeverity(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeSeverityDto,
  ) {
    return this.incidents.changeSeverity(user, id, dto);
  }

  @Post(":id/resolve")
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.incidents.resolve(user, id);
  }

  @Put(":id/postmortem")
  writePostmortem(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PostmortemDto,
  ) {
    return this.incidents.writePostmortem(user, id, dto);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post(":id/close")
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.incidents.close(user, id);
  }
}

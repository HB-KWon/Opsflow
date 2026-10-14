import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { IncidentStatus, Severity } from "../incident.entity";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const SEVERITY_MESSAGE = `심각도는 ${Object.values(Severity).join(", ")} 중 하나여야 합니다.`;

export class CreateIncidentDto {
  @Transform(trim)
  @IsString({ message: "제목을 입력해 주세요." })
  @Length(1, 200, { message: "제목은 1~200자로 입력해 주세요." })
  title: string;

  @Transform(trim)
  @IsString({ message: "설명을 입력해 주세요." })
  @Length(1, 5000, { message: "설명은 1~5000자로 입력해 주세요." })
  description: string;

  // 생략하면 MEDIUM (IC-001)
  @IsOptional()
  @IsEnum(Severity, { message: SEVERITY_MESSAGE })
  severity?: Severity;
}

export class AssignIncidentDto {
  @IsUUID("4", { message: "담당자(assigneeId) 형식이 올바르지 않습니다." })
  assigneeId: string;
}

export class AddNoteDto {
  @Transform(trim)
  @IsString({ message: "기록 내용을 입력해 주세요." })
  @Length(1, 5000, { message: "기록은 1~5000자로 입력해 주세요." })
  content: string;
}

export class ChangeSeverityDto {
  @IsEnum(Severity, { message: SEVERITY_MESSAGE })
  severity: Severity;
}

// PUT: 세 항목을 모두 보내 통째로 바꾼다
export class PostmortemDto {
  @Transform(trim)
  @IsString({ message: "원인을 입력해 주세요." })
  @Length(1, 5000, { message: "원인은 1~5000자로 입력해 주세요." })
  cause: string;

  @Transform(trim)
  @IsString({ message: "조치 내용을 입력해 주세요." })
  @Length(1, 5000, { message: "조치 내용은 1~5000자로 입력해 주세요." })
  action: string;

  @Transform(trim)
  @IsString({ message: "재발 방지 대책을 입력해 주세요." })
  @Length(1, 5000, { message: "재발 방지 대책은 1~5000자로 입력해 주세요." })
  prevention: string;
}

// SRS 표기(snake_case) → 엔티티 속성. severity 정렬은 LOW → CRITICAL 순 (enum 선언 순서)
export const SORT_FIELDS = {
  created_at: "createdAt",
  updated_at: "updatedAt",
  status: "status",
  severity: "severity",
  title: "title",
} as const;

// page/limit/sort/order 관례는 ListRequestsQuery와 같다
export class ListIncidentsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsIn(Object.keys(SORT_FIELDS))
  sort: keyof typeof SORT_FIELDS = "created_at";

  @IsOptional()
  @IsIn(["asc", "desc"])
  order: "asc" | "desc" = "desc";

  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;
}

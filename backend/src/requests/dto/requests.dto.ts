import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { RequestStatus } from '../work-request.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRequestDto {
  @IsUUID('4', { message: '요청 유형(templateId)을 선택해 주세요.' })
  templateId: string;

  @Transform(trim)
  @IsString({ message: '제목을 입력해 주세요.' })
  @Length(1, 200, { message: '제목은 1~200자로 입력해 주세요.' })
  title: string;

  @Transform(trim)
  @IsString({ message: '내용을 입력해 주세요.' })
  @Length(1, 5000, { message: '내용은 1~5000자로 입력해 주세요.' })
  content: string;
}

// 보낸 필드만 바꾼다. 아무 필드도 없으면 서비스에서 400.
export class UpdateRequestDto {
  @IsOptional()
  @IsUUID('4', { message: '요청 유형(templateId) 형식이 올바르지 않습니다.' })
  templateId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200, { message: '제목은 1~200자로 입력해 주세요.' })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000, { message: '내용은 1~5000자로 입력해 주세요.' })
  content?: string;
}

export class RejectRequestDto {
  @Transform(trim)
  @IsString({ message: '반려 사유를 입력해 주세요.' })
  @Length(1, 1000, { message: '반려 사유는 1~1000자로 입력해 주세요.' })
  reason: string;
}

export class AssignRequestDto {
  @IsUUID('4', { message: '담당자(assigneeId) 형식이 올바르지 않습니다.' })
  assigneeId: string;
}

// SRS 표기(snake_case) → 엔티티 속성
export const SORT_FIELDS = {
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  status: 'status',
  title: 'title',
} as const;

export class ListRequestsQuery {
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
  sort: keyof typeof SORT_FIELDS = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  // 유형 필터
  @IsOptional()
  @IsUUID('4')
  templateId?: string;
}

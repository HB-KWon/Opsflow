import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

// page/limit 관례는 ListRequestsQuery와 같다 (기본 20, 최대 100). 정렬은 createdAt DESC 고정.
export class ListAuditLogsQuery {
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
  @IsUUID('4')
  actorId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  entityType?: string;

  // from 이상, to 미만 (ISO 8601). 날짜만 주면 UTC 자정 기준
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'from은 ISO 8601 날짜여야 합니다.' })
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'to는 ISO 8601 날짜여야 합니다.' })
  to?: Date;
}

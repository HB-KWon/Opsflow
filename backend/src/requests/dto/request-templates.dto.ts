import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTemplateDto {
  @Transform(trim)
  @IsString({ message: '유형 이름을 입력해 주세요.' })
  @Length(1, 100, { message: '유형 이름은 1~100자로 입력해 주세요.' })
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 500, { message: '설명은 500자 이하로 입력해 주세요.' })
  description?: string | null;
}

// 이름·설명만 바꾼다. isActive는 보관 액션으로만 바뀌므로 본문에 오면 400(forbidNonWhitelisted).
// description: null 은 설명을 지운다.
export class UpdateTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100, { message: '유형 이름은 1~100자로 입력해 주세요.' })
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 500, { message: '설명은 500자 이하로 입력해 주세요.' })
  description?: string | null;
}

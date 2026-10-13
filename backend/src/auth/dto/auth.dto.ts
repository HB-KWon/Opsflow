import { Transform } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ADMIN은 초대로 만들 수 없다. 관리자 권한은 역할 변경(AUTH-006)으로만 준다.
export const INVITABLE_ROLES = [UserRole.MEMBER, UserRole.MANAGER] as const;

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateInvitationDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  @MaxLength(255)
  email: string;

  @IsIn(INVITABLE_ROLES, { message: `역할은 ${INVITABLE_ROLES.join(', ')} 중 하나여야 합니다.` })
  role: (typeof INVITABLE_ROLES)[number];
}

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100, { message: '이름은 1~100자로 입력해 주세요.' })
  name: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  // bcrypt는 72바이트 뒤를 조용히 잘라 버리므로 그보다 긴 비밀번호는 받지 않는다
  @IsByteLength(1, 72, { message: '비밀번호가 너무 깁니다. (최대 72바이트)' })
  password: string;
}

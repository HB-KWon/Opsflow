// 첫 관리자 계정을 만드는 스크립트.
// 공개 회원가입이 없어서(AUTH-005) 조직의 첫 Admin은 초대할 사람이 없으므로 서버에서 직접 만든다.
//
// 사용법 (backend 폴더에서):
//   ADMIN_PASSWORD='비밀번호' npm run admin:create -- admin@opsflow.test "관리자" [organization_id]
// organization_id를 생략하면 새 조직 id를 만든다. 비밀번호는 셸 기록에 남지 않도록 환경변수로 받는다.
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

async function main() {
  const [emailArg, name, organizationId = randomUUID()] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;
  if (!emailArg || !name || !password) {
    console.error('사용법: ADMIN_PASSWORD=... npm run admin:create -- <email> <name> [organization_id]');
    process.exit(1);
  }
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    console.error('비밀번호는 8자 이상, 72바이트 이하여야 합니다.');
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const users = app.get(DataSource).getRepository(User);
    if (await users.existsBy({ email })) {
      console.error(`이미 있는 이메일입니다: ${email}`);
      process.exitCode = 1;
      return;
    }
    const admin = await users.save(
      users.create({
        email,
        name,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: UserRole.ADMIN,
        organizationId,
        isActive: true,
      }),
    );
    console.log(`관리자 생성 완료: ${admin.email} (organization_id=${admin.organizationId})`);
  } finally {
    await app.close();
  }
}

main();

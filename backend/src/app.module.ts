import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { typeOrmConfig } from './config/typeorm.config';
import { HealthController } from './health/health.controller';
import { IncidentsModule } from './incidents/incidents.module';
import { RequestsModule } from './requests/requests.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // .env 파일을 읽어서 process.env 로 쓸 수 있게 해줌
    ConfigModule.forRoot({ isGlobal: true }),
    // DB 연결 설정 (아래 config/typeorm.config.ts 참고)
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig }),
    AuthModule,
    RequestsModule,
    IncidentsModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

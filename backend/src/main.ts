import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 프론트·배포 환경과 같은 /api 경로를 쓴다 (Refresh Token 쿠키 경로도 /api/auth 기준)
  app.setGlobalPrefix('api');
  // httpOnly 쿠키로 오는 Refresh Token을 읽기 위해
  app.use(cookieParser());

  // 요청으로 들어온 DTO를 자동으로 검증 (잘못된 값이면 400 에러로 바로 막아줌)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ credentials: true, origin: true });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`OpsFlow API running on http://localhost:${port}`);
}
bootstrap();

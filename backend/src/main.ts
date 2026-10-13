import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

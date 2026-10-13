import { TypeOrmModuleOptions } from '@nestjs/typeorm';

// DB 접속 정보를 한곳에 모아둔 설정 파일.
// 지금은 entity가 없어서 빈 배열이고, 도메인 모듈을 만들 때마다
// 여기 entities 배열에 추가하면 된다 (또는 autoLoadEntities: true로 전환).
export function typeOrmConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'opsflow',
    password: process.env.DB_PASSWORD ?? 'opsflow',
    database: process.env.DB_NAME ?? 'opsflow',
    entities: [],
    autoLoadEntities: true,
    // 개발 중에는 entity 변경사항을 자동으로 테이블에 반영 (운영에서는 반드시 false + 마이그레이션으로 전환)
    synchronize: process.env.NODE_ENV !== 'production',
  };
}

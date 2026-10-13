import { Controller, Get } from '@nestjs/common';

// 서버가 떠있는지, DB 설정까지 잘 붙었는지 확인하는 용도의 간단한 엔드포인트.
// GET /health 로 호출하면 {"status":"ok"} 가 와야 정상.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'opsflow-backend' };
  }
}

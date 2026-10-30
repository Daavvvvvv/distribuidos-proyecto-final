import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/decoradores';

/**
 * Liveness para el balanceador (fuera del prefijo /api). No consulta Postgres a propósito:
 * un parpadeo de RDS no debe hacer que el balanceador marque las 2 réplicas como no sanas a la vez.
 */
@Controller()
export class HealthController {
  @Publico()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

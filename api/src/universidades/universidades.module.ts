import { Module } from '@nestjs/common';
import { UniversidadesController } from './universidades.controller';
import { UniversidadesService } from './universidades.service';

@Module({
  controllers: [UniversidadesController],
  providers: [UniversidadesService],
  exports: [UniversidadesService],
})
export class UniversidadesModule {}

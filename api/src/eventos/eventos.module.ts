import { Module } from '@nestjs/common';
import { CategoriasController } from './categorias.controller';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';

@Module({
  controllers: [EventosController, CategoriasController],
  providers: [EventosService],
  exports: [EventosService],
})
export class EventosModule {}

import { Module } from '@nestjs/common';
import { EventosModule } from '../eventos/eventos.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { InscripcionesController } from './inscripciones.controller';
import { InscripcionesService } from './inscripciones.service';

@Module({
  imports: [EventosModule, NotificacionesModule],
  controllers: [InscripcionesController],
  providers: [InscripcionesService],
})
export class InscripcionesModule {}

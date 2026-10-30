import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { UsuarioActual, type UsuarioToken } from '../auth/decoradores';
import { IdPipe } from '../common/id.pipe';
import { EventosService } from '../eventos/eventos.service';
import { InscripcionesService } from './inscripciones.service';

@Controller()
export class InscripcionesController {
  constructor(
    private readonly inscripciones: InscripcionesService,
    private readonly eventos: EventosService,
  ) {}

  @Post('eventos/:id/inscripcion')
  @HttpCode(200)
  inscribir(@UsuarioActual() usuario: UsuarioToken, @Param('id', new IdPipe()) id: number) {
    return this.inscripciones.inscribir(usuario.id, id);
  }

  @Delete('eventos/:id/inscripcion')
  cancelar(@UsuarioActual() usuario: UsuarioToken, @Param('id', new IdPipe()) id: number) {
    return this.inscripciones.cancelar(usuario.id, id);
  }

  @Get('mis-inscripciones')
  misInscripciones(@UsuarioActual() usuario: UsuarioToken) {
    return this.eventos.inscritosPor(usuario.id);
  }
}

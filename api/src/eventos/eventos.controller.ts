import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IdPipe } from '../common/id.pipe';
import { Roles, UsuarioActual, type UsuarioToken } from '../auth/decoradores';
import { CrearEventoDto, ListarEventosDto } from './dto/eventos.dto';
import { EventosService } from './eventos.service';

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventos: EventosService) {}

  @Get()
  listar(@UsuarioActual() usuario: UsuarioToken, @Query() filtros: ListarEventosDto) {
    return this.eventos.listar(usuario.id, filtros);
  }

  @Get(':id')
  detalle(@UsuarioActual() usuario: UsuarioToken, @Param('id', new IdPipe()) id: number) {
    return this.eventos.detalle(usuario.id, id);
  }

  @Roles('organizador')
  @Post()
  crear(@UsuarioActual() usuario: UsuarioToken, @Body() dto: CrearEventoDto) {
    return this.eventos.crear(usuario.id, dto);
  }

  @Roles('organizador')
  @Get(':id/inscritos')
  inscritos(@UsuarioActual() usuario: UsuarioToken, @Param('id', new IdPipe()) id: number) {
    return this.eventos.inscritos(usuario.id, id);
  }
}

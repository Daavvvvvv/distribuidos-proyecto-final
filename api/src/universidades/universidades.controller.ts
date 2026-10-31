import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/decoradores';
import { UniversidadesService } from './universidades.service';

@Controller('universidades')
export class UniversidadesController {
  constructor(private readonly universidades: UniversidadesService) {}

  /** Público: la pantalla de registro muestra qué universidades se aceptan. */
  @Publico()
  @Get()
  listar() {
    return this.universidades.listar();
  }
}

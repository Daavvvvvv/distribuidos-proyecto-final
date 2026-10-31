import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/decoradores';
import { CATEGORIAS } from './categorias';

@Controller('categorias')
export class CategoriasController {
  /** Público: los filtros y el formulario de crear evento usan esta lista. */
  @Publico()
  @Get()
  listar() {
    return CATEGORIAS;
  }
}

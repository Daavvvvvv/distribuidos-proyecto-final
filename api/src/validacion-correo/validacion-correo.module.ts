import { Module } from '@nestjs/common';
import { ValidacionCorreoService } from './validacion-correo.service';

@Module({
  providers: [ValidacionCorreoService],
  exports: [ValidacionCorreoService],
})
export class ValidacionCorreoModule {}

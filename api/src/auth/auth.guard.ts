import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ES_PUBLICO, ROLES, ROLES_PERMITIDOS, type Rol, type UsuarioToken } from './decoradores';

interface PayloadJwt {
  sub: number;
  rol: Rol;
  nombre: string;
}

/** Guard global: toda ruta exige `Authorization: Bearer <token>` salvo las marcadas @Publico(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const solicitud = ctx.switchToHttp().getRequest();
    const [esquema, token] = String(solicitud.headers.authorization ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }

    let payload: PayloadJwt;
    try {
      payload = await this.jwt.verifyAsync<PayloadJwt>(token);
    } catch {
      throw new UnauthorizedException('Tu sesión expiró, inicia sesión de nuevo');
    }
    if (!Number.isInteger(payload.sub) || !ROLES.includes(payload.rol)) {
      throw new UnauthorizedException('Tu sesión expiró, inicia sesión de nuevo');
    }
    const usuario: UsuarioToken = { id: payload.sub, rol: payload.rol, nombre: payload.nombre };
    solicitud.usuario = usuario;

    const permitidos = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_PERMITIDOS, objetivos);
    if (permitidos && !permitidos.includes(usuario.rol)) {
      throw new ForbiddenException('Solo los organizadores pueden hacer esto');
    }
    return true;
  }
}

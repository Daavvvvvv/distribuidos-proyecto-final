import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const ROLES = ['estudiante', 'organizador'] as const;
export type Rol = (typeof ROLES)[number];

/** Lo que el guard deja en la solicitud a partir del JWT. Sin sesión en memoria: todo sale del token. */
export interface UsuarioToken {
  id: number;
  rol: Rol;
  nombre: string;
}

export const ES_PUBLICO = 'esPublico';
export const ROLES_PERMITIDOS = 'rolesPermitidos';

/** La ruta no exige token. */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/** La ruta exige token y uno de estos roles. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_PERMITIDOS, roles);

export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioToken => ctx.switchToHttp().getRequest().usuario,
);

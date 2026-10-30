import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { DatabaseError } from 'pg';
import { Db } from '../db/db';
import { ValidacionCorreoService } from '../validacion-correo/validacion-correo.service';
import type { Rol } from './decoradores';
import type { LoginDto, RegistroDto } from './dto/auth.dto';

export interface UsuarioPublico {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface Sesion {
  token: string;
  usuario: UsuarioPublico;
}

const COSTO_BCRYPT = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly validacion: ValidacionCorreoService,
  ) {}

  /**
   * El correo institucional se valida aquí, en el registro (premisa 4 de DISENO-BACKEND.md; OV7 abierta).
   * Si el servicio externo no responde, el registro sigue con correo_validado = PENDIENTE.
   */
  async registro(dto: RegistroDto): Promise<Sesion> {
    const email = dto.email.trim().toLowerCase();
    const validacion = await this.validacion.validar(email);
    if (validacion === 'INVALIDO') {
      throw new BadRequestException('El correo debe ser institucional');
    }

    const hash = await bcrypt.hash(dto.password, COSTO_BCRYPT);
    try {
      const { rows } = await this.db.query<UsuarioPublico>(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, correo_validado)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nombre, email, rol`,
        [dto.nombre.trim(), email, hash, dto.rol, validacion],
      );
      return this.sesion(rows[0]);
    } catch (error) {
      // 400 y no 409: el frontend interpreta 409 como "cupo lleno" (DISENO-BACKEND.md, Open Question 2).
      if (error instanceof DatabaseError && error.code === '23505') {
        throw new BadRequestException('Ya existe una cuenta con ese correo');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<Sesion> {
    const { rows } = await this.db.query<UsuarioPublico & { password_hash: string }>(
      `SELECT id, nombre, email, rol, password_hash FROM usuarios WHERE lower(email) = lower($1)`,
      [dto.email.trim()],
    );
    const usuario = rows[0];
    if (!usuario || !(await bcrypt.compare(dto.password, usuario.password_hash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    const { password_hash: _omitido, ...publico } = usuario;
    return this.sesion(publico);
  }

  private async sesion(usuario: UsuarioPublico): Promise<Sesion> {
    const token = await this.jwt.signAsync({ sub: usuario.id, rol: usuario.rol, nombre: usuario.nombre });
    return { token, usuario };
  }
}

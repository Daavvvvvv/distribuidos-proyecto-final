import { IsEmail, IsIn, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { ROLES, type Rol } from '../decoradores';

export class RegistroDto {
  @IsString({ message: 'El nombre es obligatorio' })
  @Length(2, 80, { message: 'El nombre debe tener entre 2 y 80 caracteres' })
  nombre!: string;

  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(254, { message: 'El correo no es válido' })
  email!: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(72, { message: 'La contraseña puede tener como máximo 72 caracteres' })
  password!: string;

  @IsIn(ROLES, { message: 'El rol debe ser estudiante u organizador' })
  rol!: Rol;
}

export class LoginDto {
  @IsString({ message: 'El correo es obligatorio' })
  email!: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  password!: string;
}

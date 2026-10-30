import { IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

// Sin zona horaria, "2026-11-03T08:00" se interpretaría en UTC (Fargate) y quedaría corrido 5 h.
const CON_ZONA = /(Z|[+-]\d{2}:\d{2})$/;

export class CrearEventoDto {
  @IsString({ message: 'El título es obligatorio' })
  @Length(3, 120, { message: 'El título debe tener entre 3 y 120 caracteres' })
  titulo!: string;

  @IsString({ message: 'La descripción es obligatoria' })
  @Length(1, 2000, { message: 'La descripción debe tener entre 1 y 2000 caracteres' })
  descripcion!: string;

  @IsISO8601({ strict: true }, { message: 'La fecha no es válida' })
  @Matches(CON_ZONA, { message: 'La fecha debe incluir zona horaria (por ejemplo 2026-11-03T08:00:00-05:00)' })
  fecha!: string;

  @IsString({ message: 'El lugar es obligatorio' })
  @Length(1, 200, { message: 'El lugar debe tener entre 1 y 200 caracteres' })
  lugar!: string;

  @IsInt({ message: 'El cupo debe ser un número entero' })
  @Min(1, { message: 'El cupo debe ser al menos 1' })
  @Max(10000, { message: 'El cupo puede ser como máximo 10000' })
  cupo!: number;

  @IsString({ message: 'La categoría es obligatoria' })
  @Length(1, 50, { message: 'La categoría debe tener entre 1 y 50 caracteres' })
  categoria!: string;
}

export class ListarEventosDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La búsqueda puede tener como máximo 100 caracteres' })
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'La categoría puede tener como máximo 50 caracteres' })
  categoria?: string;
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../db/db';
import { UNIVERSIDAD_JSON } from '../universidades/universidad-json';
import type { Universidad } from '../universidades/universidades.service';
import type { CrearEventoDto, ListarEventosDto } from './dto/eventos.dto';

/** Forma exacta que espera el frontend (README, "Forma de evento"). */
export interface Evento {
  id: number;
  titulo: string;
  descripcion: string;
  fecha: Date;
  lugar: string;
  cupo: number;
  inscritos: number;
  categoria: string;
  organizador: string;
  /** La universidad del organizador. */
  universidad: Universidad | null;
  /** Si el usuario autenticado ya está inscrito. */
  inscrito: boolean;
}

export interface Inscrito {
  id: number;
  nombre: string;
  email: string;
}

// $1 = usuario autenticado, para calcular `inscrito`.
const SELECT_EVENTO = `
  SELECT e.id, e.titulo, e.descripcion, e.fecha, e.lugar, e.cupo, e.inscritos, e.categoria,
         u.nombre AS organizador,
         ${UNIVERSIDAD_JSON} AS universidad,
         EXISTS (SELECT 1 FROM inscripciones i WHERE i.evento_id = e.id AND i.usuario_id = $1) AS inscrito
  FROM eventos e
  JOIN usuarios u ON u.id = e.organizador_id
  LEFT JOIN universidades un ON un.id = u.universidad_id`;

// Primero los próximos (más cercano primero) y luego los pasados (más reciente primero).
const ORDEN_EVENTOS = `
  ORDER BY (e.fecha < now()),
           CASE WHEN e.fecha >= now() THEN e.fecha END ASC,
           e.fecha DESC`;

const LIMITE_LISTADO = 200;

/** Patrón ILIKE que busca el texto literal (un "%" o "_" del usuario no actúa como comodín). */
function patronLiteral(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, '\\$&')}%`;
}

@Injectable()
export class EventosService {
  constructor(private readonly db: Db) {}

  /** Máximo 200, para no tener una consulta sin límite. */
  async listar(usuarioId: number, filtros: ListarEventosDto): Promise<Evento[]> {
    const q = filtros.q?.trim() || null;
    const categoria = filtros.categoria?.trim() || null;
    const { rows } = await this.db.query<Evento>(
      `${SELECT_EVENTO}
       WHERE ($2::text IS NULL OR e.titulo ILIKE $2 OR e.descripcion ILIKE $2)
         AND ($3::text IS NULL OR e.categoria = $3)
       ${ORDEN_EVENTOS}
       LIMIT ${LIMITE_LISTADO}`,
      [usuarioId, q && patronLiteral(q), categoria],
    );
    return rows;
  }

  /** Eventos en los que el usuario está inscrito (GET /api/mis-inscripciones). */
  async inscritosPor(usuarioId: number): Promise<Evento[]> {
    const { rows } = await this.db.query<Evento>(
      `${SELECT_EVENTO}
       WHERE EXISTS (SELECT 1 FROM inscripciones i WHERE i.evento_id = e.id AND i.usuario_id = $1)
       ${ORDEN_EVENTOS}`,
      [usuarioId],
    );
    return rows;
  }

  async detalle(usuarioId: number, eventoId: number): Promise<Evento> {
    const { rows } = await this.db.query<Evento>(`${SELECT_EVENTO} WHERE e.id = $2`, [usuarioId, eventoId]);
    if (!rows[0]) throw new NotFoundException('El evento no existe');
    return rows[0];
  }

  async crear(organizadorId: number, dto: CrearEventoDto): Promise<Evento> {
    if (new Date(dto.fecha).getTime() <= Date.now()) {
      throw new BadRequestException('La fecha del evento debe ser futura');
    }
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO eventos (titulo, descripcion, fecha, lugar, cupo, categoria, organizador_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [dto.titulo.trim(), dto.descripcion.trim(), dto.fecha, dto.lugar.trim(), dto.cupo, dto.categoria.trim(), organizadorId],
    );
    return this.detalle(organizadorId, rows[0].id);
  }

  /** Solo el organizador dueño del evento ve la lista de inscritos. */
  async inscritos(organizadorId: number, eventoId: number): Promise<Inscrito[]> {
    const evento = await this.db.query<{ organizador_id: number }>(
      'SELECT organizador_id FROM eventos WHERE id = $1',
      [eventoId],
    );
    if (!evento.rows[0]) throw new NotFoundException('El evento no existe');
    if (evento.rows[0].organizador_id !== organizadorId) {
      throw new ForbiddenException('Solo el organizador del evento puede ver los inscritos');
    }
    const { rows } = await this.db.query<Inscrito>(
      `SELECT u.id, u.nombre, u.email
       FROM inscripciones i JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.evento_id = $1
       ORDER BY i.creado_en`,
      [eventoId],
    );
    return rows;
  }
}

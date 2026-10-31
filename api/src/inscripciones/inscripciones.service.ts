import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Db } from '../db/db';
import { EventosService, type Evento } from '../eventos/eventos.service';
import { MOTIVO, motivoParaNoInscribirse } from '../eventos/reglas-inscripcion';
import { Metricas, type ResultadoInscripcion } from '../metricas/metricas';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

/**
 * Bloquea la fila del evento hasta el COMMIT. Serializa solo las operaciones del MISMO evento
 * (de cualquier réplica): eventos distintos no se esperan entre sí.
 */
async function bloquearEvento(c: PoolClient, eventoId: number) {
  const { rows } = await c.query<{ cupo: number; inscritos: number; pasado: boolean; organizador_id: number }>(
    'SELECT cupo, inscritos, fecha < now() AS pasado, organizador_id FROM eventos WHERE id = $1 FOR UPDATE',
    [eventoId],
  );
  if (!rows[0]) throw new NotFoundException('El evento no existe');
  return rows[0];
}

@Injectable()
export class InscripcionesService {
  constructor(
    private readonly db: Db,
    private readonly eventos: EventosService,
    private readonly notificaciones: NotificacionesService,
    private readonly metricas: Metricas,
  ) {}

  /**
   * Inscribe respetando el cupo bajo concurrencia. Idempotente: si ya estaba inscrito responde
   * igual (200), sin duplicar la inscripción ni la notificación.
   */
  async inscribir(usuarioId: number, eventoId: number): Promise<Evento> {
    let resultado: ResultadoInscripcion = 'inscrito';
    let notificacionId: number | null;
    try {
      notificacionId = await this.db.transaccion(async (c) => {
        const evento = await bloquearEvento(c, eventoId);

        // Con el evento bloqueado, esta lectura no tiene condición de carrera: todo INSERT en
        // inscripciones toma KEY SHARE sobre el evento (llave foránea), que choca con FOR UPDATE,
        // así que una inscripción concurrente o ya confirmó (y se ve aquí) o espera a este COMMIT.
        // El UNIQUE(usuario_id, evento_id) queda como red de la base de datos, no como camino normal.
        const ya = await c.query('SELECT 1 FROM inscripciones WHERE usuario_id = $1 AND evento_id = $2', [
          usuarioId,
          eventoId,
        ]);
        if (ya.rowCount) {
          resultado = 'ya_inscrito';
          return null;
        }

        const motivo = motivoParaNoInscribirse({
          esOrganizador: evento.organizador_id === usuarioId,
          pasado: evento.pasado,
          lleno: evento.inscritos >= evento.cupo,
        });
        // 409 solo para el cupo: el frontend lo distingue de los demás rechazos.
        if (motivo === MOTIVO.lleno) throw new ConflictException(motivo);
        if (motivo) throw new BadRequestException(motivo);

        await c.query('INSERT INTO inscripciones (usuario_id, evento_id) VALUES ($1, $2)', [usuarioId, eventoId]);
        await c.query('UPDATE eventos SET inscritos = inscritos + 1 WHERE id = $1', [eventoId]);
        // Outbox: el aviso queda guardado en la misma transacción, así no se pierde si la API cae
        // entre el COMMIT y el envío a la cola.
        const { rows } = await c.query<{ id: number }>(
          'INSERT INTO notificaciones (usuario_id, evento_id) VALUES ($1, $2) RETURNING id',
          [usuarioId, eventoId],
        );
        return rows[0].id;
      });
    } catch (error) {
      this.metricas.inscripciones.inc({ resultado: error instanceof ConflictException ? 'cupo_lleno' : 'rechazada' });
      throw error;
    }
    this.metricas.inscripciones.inc({ resultado });

    // Después del COMMIT: un fallo de SQS no deshace la inscripción (queda para el barrido).
    if (notificacionId !== null) {
      await this.notificaciones.encolar({ id: notificacionId, evento_id: eventoId, usuario_id: usuarioId });
    }
    return this.eventos.detalle(usuarioId, eventoId);
  }

  /** Cancela la inscripción. Idempotente: si no estaba inscrito, devuelve el evento sin cambios. */
  async cancelar(usuarioId: number, eventoId: number): Promise<Evento> {
    await this.db.transaccion(async (c) => {
      const evento = await bloquearEvento(c, eventoId);
      if (evento.pasado) throw new BadRequestException(MOTIVO.pasado);

      const borrada = await c.query('DELETE FROM inscripciones WHERE usuario_id = $1 AND evento_id = $2', [
        usuarioId,
        eventoId,
      ]);
      if (!borrada.rowCount) return;

      await c.query('UPDATE eventos SET inscritos = inscritos - 1 WHERE id = $1', [eventoId]);
      // Si el aviso todavía no salió, ya no corresponde enviarlo.
      await c.query(
        `UPDATE notificaciones SET estado = 'DESCARTADA'
         WHERE usuario_id = $1 AND evento_id = $2 AND estado = 'PENDIENTE'`,
        [usuarioId, eventoId],
      );
    });
    return this.eventos.detalle(usuarioId, eventoId);
  }
}

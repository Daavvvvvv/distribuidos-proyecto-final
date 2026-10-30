// El esquema vive como constante TypeScript (no como .sql suelto) porque tsc no copia
// archivos .sql a dist y la imagen Docker no los encontraría.
//
// Es idempotente: RDS arranca vacía y las 2 réplicas lo ejecutan al iniciar.
// Cambios posteriores al primer despliegue: agregarlos AL FINAL como
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, nunca editando un CREATE TABLE.
export const ESQUEMA_SQL = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('estudiante', 'organizador')),
  correo_validado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (correo_validado IN ('VALIDO', 'PENDIENTE')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uq ON usuarios (lower(email));

CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  lugar TEXT NOT NULL,
  cupo INT NOT NULL CHECK (cupo > 0),
  inscritos INT NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL,
  organizador_id INT NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Segunda red contra el sobrecupo: aunque el código fallara, Postgres lo rechaza.
  CHECK (inscritos >= 0 AND inscritos <= cupo)
);
CREATE INDEX IF NOT EXISTS eventos_fecha ON eventos (fecha);

CREATE TABLE IF NOT EXISTS inscripciones (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  evento_id INT NOT NULL REFERENCES eventos(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL salvo que la validación de correo se haga en la inscripción (ver DISENO-BACKEND.md, OV7).
  validacion TEXT CHECK (validacion IN ('VALIDO', 'PENDIENTE')),
  UNIQUE (usuario_id, evento_id)
);
CREATE INDEX IF NOT EXISTS inscripciones_evento ON inscripciones (evento_id);

CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  evento_id INT NOT NULL REFERENCES eventos(id),
  tipo TEXT NOT NULL DEFAULT 'InscripcionConfirmada',
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ENVIADA', 'DESCARTADA')),
  encolada_en TIMESTAMPTZ,
  enviada_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificaciones_pendientes ON notificaciones (creado_en) WHERE estado = 'PENDIENTE';
`;

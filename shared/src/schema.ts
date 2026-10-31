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

-- Catálogo de universidades: el registro solo acepta correos de estos dominios.
-- Para agregar una, una fila más aquí; ON CONFLICT la hace idempotente.
CREATE TABLE IF NOT EXISTS universidades (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  sigla TEXT NOT NULL,
  dominio TEXT NOT NULL UNIQUE
);
INSERT INTO universidades (nombre, sigla, dominio) VALUES
  ('Universidad EAFIT', 'EAFIT', 'eafit.edu.co'),
  ('Universidad de Antioquia', 'UdeA', 'udea.edu.co'),
  ('Universidad Nacional de Colombia, sede Medellín', 'UNAL', 'unal.edu.co'),
  ('Universidad Pontificia Bolivariana', 'UPB', 'upb.edu.co'),
  ('Universidad de Medellín', 'UdeM', 'udem.edu.co'),
  ('Universidad CES', 'CES', 'ces.edu.co'),
  ('Universidad EIA', 'EIA', 'eia.edu.co'),
  ('Politécnico Colombiano Jaime Isaza Cadavid', 'Poli JIC', 'elpoli.edu.co'),
  ('Instituto Tecnológico Metropolitano', 'ITM', 'itm.edu.co'),
  ('Institución Universitaria Pascual Bravo', 'Pascual Bravo', 'pascualbravo.edu.co'),
  ('Universidad Católica Luis Amigó', 'Luis Amigó', 'amigo.edu.co'),
  ('Universidad Autónoma Latinoamericana', 'UNAULA', 'unaula.edu.co'),
  ('Institución Universitaria Colegio Mayor de Antioquia', 'Colmayor', 'colmayor.edu.co'),
  ('Universidad de San Buenaventura, Medellín', 'USB', 'usbmed.edu.co'),
  ('Universidad Demo (cuentas de prueba)', 'Demo', 'universidad.edu.co')
ON CONFLICT (dominio) DO NOTHING;

-- NULL solo en cuentas anteriores al catálogo cuyo dominio no está en él.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS universidad_id INT REFERENCES universidades(id);
UPDATE usuarios u SET universidad_id = un.id
FROM universidades un
WHERE u.universidad_id IS NULL AND un.dominio = split_part(lower(u.email), '@', 2);
`;

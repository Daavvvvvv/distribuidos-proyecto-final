// Demo local (docker compose up -d): 200 inscripciones simultáneas a un evento de cupo 40,
// a través de nginx y las 2 réplicas de la API.
//
//   node scripts/prueba-concurrencia.mjs                  # caso normal
//   node scripts/prueba-concurrencia.mjs --matar-replica  # además, SIGKILL a api-1 a mitad de camino
//
// Variables: API_URL (por defecto http://localhost:3000), DB_PORT (5435). Los usuarios de carga se
// crean por SQL (RDS está en una VPC privada: esta demo es solo local) y hacen login por la API real.
import { exec, execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const API = process.env.API_URL ?? 'http://localhost:3000';
const USUARIOS = 200;
const CUPO = 40;
const matar = process.argv.includes('--matar-replica');

const db = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5435),
  database: process.env.DB_NAME ?? 'eventos',
  user: process.env.DB_USER ?? 'eventos_admin',
  password: process.env.DB_PASSWORD ?? 'eventos_local',
});

/** Líneas de error de upstream en el log de nginx (cada una es una solicitud que pasó a la otra réplica). */
function erroresUpstream() {
  const log = execSync('docker compose logs nginx 2>&1', { maxBuffer: 64 * 1024 * 1024 }).toString();
  return (log.match(/upstream prematurely closed|connect\(\) failed|Connection reset by peer/g) ?? []).length;
}

/** fetch con hasta 3 reintentos ante error de red o 502/503 (réplica caída). */
async function conReintento(url, opciones) {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(url, opciones);
      if ((res.status !== 502 && res.status !== 503) || intento === 3) return res;
    } catch (error) {
      if (intento === 3) throw error;
    }
    await new Promise((r) => setTimeout(r, 200 * intento));
  }
}

const corrida = Date.now();
console.log(`Preparando: evento de cupo ${CUPO} y ${USUARIOS} estudiantes (corrida ${corrida})...`);

const organizador = await db.query(`SELECT id FROM usuarios WHERE email = 'club@universidad.edu.co'`);
if (!organizador.rows[0]) throw new Error('Falta el organizador de demo: levanta la API con SEED_DEMO=true');
const evento = await db.query(
  `INSERT INTO eventos (titulo, descripcion, fecha, lugar, cupo, categoria, organizador_id)
   VALUES ($1, 'Prueba de concurrencia', now() + interval '7 days', 'Auditorio', $2, 'Tecnología', $3)
   RETURNING id`,
  [`Concurrencia ${corrida}`, CUPO, organizador.rows[0].id],
);
const eventoId = evento.rows[0].id;
const hash = await bcrypt.hash('carga123', 10);
await db.query(
  `INSERT INTO usuarios (nombre, email, password_hash, rol, correo_validado)
   SELECT 'Carga ' || g, 'carga-' || $1::text || '-' || g || '@universidad.edu.co', $2, 'estudiante', 'VALIDO'
   FROM generate_series(1, $3) AS g`,
  [String(corrida), hash, USUARIOS],
);

const tokens = [];
for (let i = 1; i <= USUARIOS; i += 25) {
  const lote = await Promise.all(
    Array.from({ length: Math.min(25, USUARIOS - i + 1) }, async (_, j) => {
      const res = await conReintento(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `carga-${corrida}-${i + j}@universidad.edu.co`, password: 'carga123' }),
      });
      if (!res.ok) throw new Error(`login falló: ${res.status} ${await res.text()}`);
      return (await res.json()).token;
    }),
  );
  tokens.push(...lote);
}

console.log(`Disparando ${USUARIOS} inscripciones simultáneas${matar ? ' y matando api-1 (SIGKILL) en paralelo' : ''}...`);
// `docker kill` directo y en paralelo: el CLI de compose tarda más que la ráfaga completa y llegaría tarde.
const contenedorApi1 = matar ? execSync('docker compose ps -q api-1').toString().trim() : '';
const erroresAntes = matar ? erroresUpstream() : 0;
if (matar) exec(`docker kill --signal=SIGKILL ${contenedorApi1}`);
const inicio = Date.now();
const estados = await Promise.all(
  tokens.map(async (token) => {
    try {
      const res = await conReintento(`${API}/api/eventos/${eventoId}/inscripcion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status;
    } catch {
      return 'red';
    }
  }),
);
const duracion = Date.now() - inicio;

const reintentosNginx = matar ? erroresUpstream() - erroresAntes : 0;
const conteo = estados.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
const { rows } = await db.query(
  `SELECT e.inscritos,
          (SELECT count(*)::int FROM inscripciones i WHERE i.evento_id = e.id) AS filas,
          (SELECT count(DISTINCT usuario_id)::int FROM inscripciones i WHERE i.evento_id = e.id) AS usuarios,
          (SELECT count(*)::int FROM notificaciones n WHERE n.evento_id = e.id) AS avisos
   FROM eventos e WHERE e.id = $1`,
  [eventoId],
);
const enDb = rows[0];

console.log(`\nRespuestas en ${duracion} ms:`, conteo);
console.log('En la base de datos:', enDb);
if (matar) {
  console.log(`Solicitudes que nginx tuvo que reintentar en api-2 porque api-1 murió: ${reintentosNginx}`);
  if (reintentosNginx === 0) console.log('(El kill llegó después de la ráfaga: vuelve a correr la demo para verlo a mitad de camino.)');
}
const ok =
  conteo[200] === CUPO &&
  conteo[409] === USUARIOS - CUPO &&
  enDb.inscritos === CUPO &&
  enDb.filas === CUPO &&
  enDb.usuarios === CUPO &&
  enDb.avisos === CUPO;
console.log(ok ? `\nOK: exactamente ${CUPO} inscritos, sin sobrecupo ni duplicados.` : '\nFALLÓ el invariante.');

if (matar) {
  console.log('Levantando api-1 de nuevo...');
  execSync('docker compose start api-1', { stdio: 'ignore' });
}
await db.end();
process.exit(ok ? 0 : 1);

// Sonda de escritura para la prueba de disponibilidad: mientras se provoca una falla, los estudiantes
// de prueba (npm run demo:poblar) se inscriben uno por uno en un evento de prueba. Al final compara las
// inscripciones que la API confirmó con las que quedaron guardadas. Si coinciden, no se perdió ni se
// duplicó nada; si hay más guardadas que confirmadas, alguna se guardó aunque el usuario vio un error.
//
//   API_URL=http://<alb> INTERVALO=2 node scripts/sonda-inscripciones.mjs
//
// Deja el resumen en resultados/sonda-inscripciones-<fecha>.json (relativo a donde se ejecuta).
import { mkdirSync, writeFileSync } from 'node:fs';

const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const INTERVALO_MS = Number(process.env.INTERVALO ?? 2) * 1000;
const TIMEOUT_MS = 5000;
const PASSWORD = 'demo1234';
// Un solo evento para todas las corridas, a 60 días para que quede al final de la lista pública.
const TITULO = 'Prueba de disponibilidad (PAM)';

async function api(ruta, { method = 'GET', body, token } = {}) {
  try {
    const res = await fetch(`${API}/api${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, datos: await res.json().catch(() => null) };
  } catch (error) {
    return { status: 0, datos: { error: error.name === 'TimeoutError' ? 'timeout' : error.message } };
  }
}

async function entrar(email) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.datos)}`);
  return r.datos.token;
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function main() {
  // Preparación, antes de provocar la falla: organizador, evento de prueba y sesiones de los estudiantes.
  const organizador = await entrar('demo.club.software@eafit.edu.co');
  const sello = new Date().toISOString();
  const { datos: eventos } = await api('/eventos', { token: organizador });
  let eventoId = eventos.find((e) => e.esOrganizador && e.titulo === TITULO)?.id;
  if (!eventoId) {
    const creado = await api('/eventos', {
      method: 'POST',
      token: organizador,
      body: {
        titulo: TITULO,
        descripcion: 'Evento de la sonda de escritura: aquí se inscriben los estudiantes de prueba durante una falla controlada.',
        fecha: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        lugar: 'Prueba técnica',
        cupo: 1000,
        categoria: 'Otro',
      },
    });
    if (creado.status !== 201) throw new Error(`crear evento: ${creado.status} ${JSON.stringify(creado.datos)}`);
    eventoId = creado.datos.id;
  }

  const estudiantes = [];
  // Los correos de poblar-demo.mjs: demo.<nombre>.<apellido><i>@<dominio>. Se toman de la lista de
  // inscritos de los eventos del organizador, que ya los conoce, para no duplicar esa lógica aquí.
  for (const e of eventos.filter((x) => x.esOrganizador && x.titulo !== TITULO)) {
    const { datos: inscritos } = await api(`/eventos/${e.id}/inscritos`, { token: organizador });
    for (const i of inscritos ?? []) if (!estudiantes.includes(i.email)) estudiantes.push(i.email);
  }
  const tokens = [];
  for (const email of estudiantes) tokens.push([email, await entrar(email)]);
  // Cada corrida empieza con el evento vacío (cancelar es idempotente).
  for (const [, token] of tokens) await api(`/eventos/${eventoId}/inscripcion`, { method: 'DELETE', token });
  console.log(`Evento ${eventoId}; ${tokens.length} estudiantes listos. Inscribiendo cada ${INTERVALO_MS / 1000} s.`);

  const intentos = [];
  for (const [email, token] of tokens) {
    const inicio = Date.now();
    const r = await api(`/eventos/${eventoId}/inscripcion`, { method: 'POST', token });
    const fila = { hora: new Date(inicio).toISOString(), email, status: r.status, ms: Date.now() - inicio };
    intentos.push(fila);
    console.log(`${fila.hora}  ${r.status === 200 ? 'OK   ' : 'FALLA'}  ${String(fila.ms).padStart(5)} ms  ${r.status} ${email}`);
    await espera(INTERVALO_MS);
  }

  // Lo guardado, leído cuando el servicio ya se recuperó.
  let guardados = null;
  for (let i = 0; i < 60 && guardados === null; i++) {
    const r = await api(`/eventos/${eventoId}/inscritos`, { token: organizador });
    if (r.status === 200) guardados = r.datos.map((x) => x.email);
    else await espera(2000);
  }
  const confirmados = intentos.filter((x) => x.status === 200).map((x) => x.email);
  const resumen = {
    destino: API,
    evento_id: eventoId,
    intentos: intentos.length,
    confirmados: confirmados.length,
    guardados: guardados?.length ?? null,
    confirmados_sin_guardar: guardados ? confirmados.filter((e) => !guardados.includes(e)) : null,
    guardados_sin_confirmar: guardados ? guardados.filter((e) => !confirmados.includes(e)) : null,
    respuestas: intentos.reduce((c, x) => ({ ...c, [x.status]: (c[x.status] ?? 0) + 1 }), {}),
    detalle: intentos,
  };
  mkdirSync('resultados', { recursive: true });
  const archivo = `resultados/sonda-inscripciones-${sello.replace(/[:.]/g, '-')}.json`;
  writeFileSync(archivo, JSON.stringify(resumen, null, 2));
  console.log('\n===== RESUMEN DE INSCRIPCIONES =====');
  console.log(`Intentos ${resumen.intentos} | confirmados ${resumen.confirmados} | guardados ${resumen.guardados}`);
  console.log(`Confirmados sin guardar (perdidos): ${resumen.confirmados_sin_guardar?.length}`);
  console.log(`Guardados sin confirmar: ${resumen.guardados_sin_confirmar?.length}`);
  console.log(`Respuestas: ${JSON.stringify(resumen.respuestas)}  Detalle: ${archivo}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

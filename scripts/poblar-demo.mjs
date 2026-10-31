// Puebla Campus Eventos con datos ficticios para la demo, usando solo la API pública: cada usuario,
// evento e inscripción pasa por las mismas validaciones, la cola y el worker que un uso real.
//
//   node scripts/poblar-demo.mjs                                   (API local, por nginx)
//   API_URL=https://<cloudfront> node scripts/poblar-demo.mjs      (AWS)
//
// Se puede correr varias veces: entra con las cuentas que ya existen y no repite eventos.
// Los correos llevan el prefijo "demo." para que nunca coincidan con una persona real.
const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = 'demo1234';

// Aleatorio con semilla fija: la misma corrida reparte las inscripciones igual.
let semilla = 20261031;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

async function api(ruta, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}/api${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const datos = await res.json().catch(() => null);
  return { status: res.status, datos };
}

/** Registra la cuenta o, si ya existe, entra con ella. Devuelve el token. */
async function cuenta(nombre, email, rol) {
  let r = await api('/auth/registro', { method: 'POST', body: { nombre, email, password: PASSWORD, rol } });
  if (r.status === 400 && r.datos?.error === 'Ya existe una cuenta con ese correo') {
    r = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  }
  if (r.status !== 200 && r.status !== 201) throw new Error(`${email}: ${r.status} ${JSON.stringify(r.datos)}`);
  return r.datos.token;
}

/** Fecha ISO con la zona de Colombia, `dias` días desde hoy a la hora dada. */
function fecha(dias, hora) {
  const d = new Date(Date.now() + dias * 86_400_000);
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return `${ymd}T${String(hora).padStart(2, '0')}:00:00-05:00`;
}

const ORGANIZADORES = [
  ['Club de Software EAFIT', 'demo.club.software@eafit.edu.co', [
    ['Hackathon de sistemas distribuidos', 'Equipos de 3 a 4 personas construyen un servicio tolerante a fallas en 24 horas. Hay mentores y premios.', 'Tecnología', 'Bloque 38, EAFIT', 60, 12, 8],
    ['Taller de Docker y despliegue en AWS', 'De la imagen local a un servicio en Fargate detrás de un balanceador. Trae tu portátil.', 'Tecnología', 'Sala de cómputo 19-405, EAFIT', 25, 4, 14],
    ['Charla: cómo conseguir tu primera práctica', 'Egresados cuentan cómo prepararon la hoja de vida y las entrevistas técnicas.', 'Académico', 'Auditorio Fundadores, EAFIT', 120, 9, 17],
  ]],
  ['Grupo de Robótica UdeA', 'demo.robotica@udea.edu.co', [
    ['Competencia de seguidores de línea', 'Trae tu robot o arma uno en el taller previo. Categorías principiante y avanzada.', 'Tecnología', 'Bloque 21, Ciudad Universitaria', 40, 6, 9],
    ['Introducción a Arduino', 'Taller práctico para quienes nunca han programado un microcontrolador. Los kits se prestan.', 'Académico', 'Laboratorio 18-210, UdeA', 5, 3, 15],
  ]],
  ['Bienestar UNAL Medellín', 'demo.bienestar@unal.edu.co', [
    ['Caminata ecológica al Cerro El Volador', 'Recorrido guiado de dos horas. Lleva agua, gorra y zapatos cómodos.', 'Bienestar', 'Portería de la calle 65, UNAL', 30, 5, 7],
    ['Taller de manejo del estrés en parciales', 'Técnicas de respiración, organización del tiempo y pausas activas.', 'Bienestar', 'Bloque M8, UNAL', 20, 2, 16],
    ['Torneo relámpago de voleibol mixto', 'Equipos de 6 con mínimo dos mujeres. Inscripción individual; los equipos se arman ese día.', 'Deportes', 'Coliseo, UNAL', 48, 11, 14],
  ]],
  ['Semillero de IA UPB', 'demo.semillero.ia@upb.edu.co', [
    ['Meetup: modelos de lenguaje en producción', 'Tres charlas cortas sobre costos, latencia y evaluación de modelos en sistemas reales.', 'Tecnología', 'Bloque 11, UPB Laureles', 80, 10, 18],
    ['Club de lectura de papers', 'Esta semana: atención y transformers. Se lee antes; en la sesión se discute.', 'Académico', 'Biblioteca, UPB', 15, 4, 17],
  ]],
  ['Cineclub UdeM', 'demo.cineclub@udem.edu.co', [
    ['Ciclo de cine colombiano: noche 1', 'Proyección de una película colombiana reciente y conversación con estudiantes de comunicación.', 'Cultura', 'Teatro, Universidad de Medellín', 150, 3, 19],
    ['Taller de crítica de cine', 'Cómo escribir una reseña que vaya más allá de "me gustó". Cupos limitados.', 'Cultura', 'Aula 7-201, UdeM', 4, 8, 15],
  ]],
  ['Deportes ITM', 'demo.deportes@itm.edu.co', [
    ['Torneo interuniversitario de fútbol sala', 'Inscripción individual; se arman equipos mixtos entre universidades.', 'Deportes', 'Coliseo ITM Robledo', 64, 13, 8],
    ['Clase abierta de yoga', 'Para todos los niveles. Trae tu tapete o toalla.', 'Bienestar', 'Gimnasio ITM Fraternidad', 25, 1, 7],
  ]],
  ['Emprendimiento EIA', 'demo.emprende@eia.edu.co', [
    ['Pitch day: ideas de estudiantes', 'Diez equipos presentan su idea en tres minutos ante un jurado de emprendedores.', 'Académico', 'Auditorio EIA Las Palmas', 90, 15, 10],
    ['Taller: valida tu idea en una semana', 'Entrevistas a clientes, prototipos baratos y cómo saber si vale la pena seguir.', 'Otro', 'Aula 302, EIA', 30, 6, 14],
  ]],
  ['Cultura Poli JIC', 'demo.cultura@elpoli.edu.co', [
    ['Festival de bandas universitarias', 'Seis bandas de distintas universidades. Entrada libre con inscripción.', 'Cultura', 'Plazoleta central, Politécnico JIC', 200, 20, 17],
    ['Taller de fotografía con celular', 'Composición, luz y edición básica. Salida fotográfica por el campus al final.', 'Cultura', 'Bloque P19, Politécnico JIC', 18, 5, 14],
    ['Feria de intercambios académicos', 'Oficinas internacionales de varias universidades explican convocatorias y becas.', 'Académico', 'Coliseo, Politécnico JIC', 100, 22, 9],
  ]],
];

const NOMBRES = ['Laura', 'Santiago', 'Valentina', 'Mateo', 'Mariana', 'Samuel', 'Isabella', 'Juan José', 'Sara', 'Tomás',
  'Daniela', 'Miguel', 'Manuela', 'Simón', 'Gabriela', 'Emilio', 'Antonia', 'Martín', 'Salomé', 'Pablo'];
const APELLIDOS = ['Restrepo', 'Gómez', 'Zapata', 'Ospina', 'Arango', 'Vélez', 'Londoño', 'Mejía', 'Cardona', 'Montoya',
  'Henao', 'Correa', 'Álvarez', 'Uribe', 'Jaramillo'];
const DOMINIOS = ['eafit.edu.co', 'udea.edu.co', 'unal.edu.co', 'upb.edu.co', 'udem.edu.co', 'ces.edu.co', 'eia.edu.co',
  'elpoli.edu.co', 'itm.edu.co', 'pascualbravo.edu.co', 'amigo.edu.co', 'unaula.edu.co', 'colmayor.edu.co', 'usbmed.edu.co'];

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');

async function main() {
  console.log(`Poblando ${API}`);
  const conteo = { organizadores: 0, eventosNuevos: 0, estudiantes: 0, inscripciones: 0, cupoLleno: 0 };

  const eventos = [];
  for (const [nombre, email, susEventos] of ORGANIZADORES) {
    const token = await cuenta(nombre, email, 'organizador');
    conteo.organizadores++;
    const propios = (await api('/eventos', { token })).datos.filter((e) => e.esOrganizador);
    for (const [titulo, descripcion, categoria, lugar, cupo, dias, hora] of susEventos) {
      let evento = propios.find((e) => e.titulo === titulo);
      if (!evento) {
        const r = await api('/eventos', {
          method: 'POST',
          token,
          body: { titulo, descripcion, categoria, lugar, cupo, fecha: fecha(dias, hora) },
        });
        if (r.status !== 201) throw new Error(`${titulo}: ${r.status} ${JSON.stringify(r.datos)}`);
        evento = r.datos;
        conteo.eventosNuevos++;
      }
      eventos.push(evento);
    }
  }

  for (let i = 0; i < 40; i++) {
    const pila = NOMBRES[i % NOMBRES.length];
    const apellido = APELLIDOS[(i * 7) % APELLIDOS.length];
    const email = `demo.${sinTildes(pila)}.${sinTildes(apellido)}${i}@${DOMINIOS[i % DOMINIOS.length]}`;
    const token = await cuenta(`${pila} ${apellido}`, email, 'estudiante');
    conteo.estudiantes++;
    const elegidos = new Set(Array.from({ length: 2 + Math.floor(azar() * 5) }, () => elegir(eventos).id));
    for (const id of elegidos) {
      const r = await api(`/eventos/${id}/inscripcion`, { method: 'POST', token });
      if (r.status === 200) conteo.inscripciones++;
      else if (r.status === 409) conteo.cupoLleno++;
      else throw new Error(`inscripción de ${email}: ${r.status} ${JSON.stringify(r.datos)}`);
    }
  }

  console.log(conteo);
  console.log(`Todas las cuentas usan la contraseña "${PASSWORD}". Ejemplo: demo.club.software@eafit.edu.co`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

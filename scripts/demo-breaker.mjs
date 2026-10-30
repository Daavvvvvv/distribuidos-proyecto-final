// Demo del circuit breaker de validación de correo: hace 12 registros seguidos y muestra cuánto
// tarda cada uno y con qué estado quedó el correo.
//
// Local:  EXTERNAL_QUERY=fail=1 docker compose up -d api-1 api-2 && node scripts/demo-breaker.mjs
// AWS:    poner EXTERNAL_QUERY=fail=1 en la tarea ECS y API_URL=https://<cloudfront> node scripts/demo-breaker.mjs
//
// Qué se ve: los primeros registros esperan el reintento y quedan PENDIENTE; cuando el circuito de
// cada réplica se abre (5 fallos en 10 s), los siguientes responden al instante sin llamar al servicio.
// Cada réplica tiene su propio circuito, por eso hacen falta ~10 registros para abrir los dos.
const API = process.env.API_URL ?? 'http://localhost:3000';
const corrida = Date.now();

for (let i = 1; i <= 12; i++) {
  const inicio = Date.now();
  const res = await fetch(`${API}/api/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: `Breaker ${i}`,
      email: `breaker-${corrida}-${i}@universidad.edu.co`,
      password: 'secreto1',
      rol: 'estudiante',
    }),
  });
  const ms = String(Date.now() - inicio).padStart(5);
  console.log(`registro ${String(i).padStart(2)}: HTTP ${res.status} en ${ms} ms`);
}
console.log(`\nEstado de los correos: SELECT email, correo_validado FROM usuarios WHERE email LIKE 'breaker-${corrida}-%';`);
console.log('Estado del circuito por réplica: curl http://localhost:3000/metrics | grep circuito (en local, vía nginx).');

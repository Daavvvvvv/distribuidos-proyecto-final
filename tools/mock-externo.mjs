// Servicio externo simulado de validación de correo institucional (solo para desarrollo local).
// Simula el directorio de correos institucionales: vale cualquier dominio que termine en ALLOWED_SUFFIX.
// Qué universidades acepta Campus Eventos lo decide el catálogo del backend, no este servicio.
// Mismo contrato que el de infra:
//   POST /validar-correo  { "email": "..." }  ->  { email, valid, domain }
//   ?delay_ms=3000  demora la respuesta;  ?fail=1  responde 500.
// MOCK_DELAY_MS y MOCK_FAIL hacen lo mismo para todas las solicitudes (pruebas sin tocar la URL).
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4010);
const ALLOWED_SUFFIX = (process.env.ALLOWED_SUFFIX ?? '.edu.co').toLowerCase();

function responder(res, status, cuerpo) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'POST' || url.pathname !== '/validar-correo') {
    return responder(res, 404, { error: 'not found' });
  }

  let datos = '';
  req.on('data', (parte) => (datos += parte));
  req.on('end', () => {
    const delayMs = Number(url.searchParams.get('delay_ms') ?? process.env.MOCK_DELAY_MS ?? 0);
    const fallar = url.searchParams.get('fail') === '1' || process.env.MOCK_FAIL === '1';

    setTimeout(() => {
      if (fallar) return responder(res, 500, { error: 'falla simulada' });

      let email;
      try {
        email = String(JSON.parse(datos).email ?? '');
      } catch {
        return responder(res, 400, { error: 'JSON inválido' });
      }
      const domain = email.split('@')[1]?.toLowerCase() ?? '';
      responder(res, 200, { email, valid: domain.endsWith(ALLOWED_SUFFIX), domain });
    }, delayMs);
  });
});

servidor.listen(PORT, () => console.log(JSON.stringify({ time: new Date().toISOString(), msg: `mock-externo escuchando en ${PORT}` })));
process.on('SIGTERM', () => servidor.close(() => process.exit(0)));

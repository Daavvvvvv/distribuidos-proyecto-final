import { INestApplication } from '@nestjs/common';
import http from 'node:http';
import request from 'supertest';
import { Db } from '../src/db/db';
import { crearApp, limpiarDb } from './app';

type Modo = 'valido' | 'invalido' | 'error500' | 'colgado';

/** Servicio externo falso: responde según `modo` y registra cada llamada. */
function crearExternoFalso() {
  const llamadas: string[] = [];
  let modo: Modo = 'valido';
  const colgadas: http.ServerResponse[] = [];
  const servidor = http.createServer((req, res) => {
    llamadas.push(req.url ?? '');
    let cuerpo = '';
    req.on('data', (p) => (cuerpo += p));
    req.on('end', () => {
      if (modo === 'colgado') return void colgadas.push(res);
      if (modo === 'error500') return void res.writeHead(500).end();
      const { email } = JSON.parse(cuerpo);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ email, valid: modo === 'valido', domain: email.split('@')[1] }));
    });
  });
  return {
    llamadas,
    modo: (m: Modo) => (modo = m),
    iniciar: async () => {
      await new Promise<void>((ok) => servidor.listen(0, ok));
      return `http://localhost:${(servidor.address() as { port: number }).port}`;
    },
    cerrar: () => {
      colgadas.forEach((r) => r.destroy());
      return new Promise((ok) => servidor.close(ok));
    },
  };
}

describe('Validación de correo institucional en el registro', () => {
  let externo: ReturnType<typeof crearExternoFalso>;
  let url: string;
  let app: INestApplication;
  let n = 0;

  const registrar = () =>
    request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ nombre: 'Ana', email: `ana${++n}@universidad.edu.co`, password: 'secreto1', rol: 'estudiante' });
  const estadoCorreo = async (email: string) =>
    (await app.get(Db).query('SELECT correo_validado FROM usuarios WHERE email = $1', [email])).rows[0]?.correo_validado;

  beforeAll(async () => {
    externo = crearExternoFalso();
    url = await externo.iniciar();
  });
  // App nueva por prueba: el circuito vive en memoria de cada réplica.
  beforeEach(async () => {
    externo.llamadas.length = 0;
    externo.modo('valido');
    app = await crearApp({ EXTERNAL_URL: url });
    await limpiarDb(app);
  });
  afterEach(() => app.close());
  afterAll(() => externo.cerrar());

  it('correo válido: registra con correo_validado = VALIDO', async () => {
    const res = await registrar().expect(201);
    expect(await estadoCorreo(res.body.usuario.email)).toBe('VALIDO');
    expect(externo.llamadas).toEqual(['/validar-correo']);
  });

  it('correo no institucional: 400 y no crea la cuenta', async () => {
    externo.modo('invalido');
    const res = await registrar().expect(400);
    expect(res.body).toEqual({ error: 'El correo debe ser institucional' });
    expect((await app.get(Db).query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n).toBe(0);
  });

  it('servicio con error 500: reintenta una vez y registra PENDIENTE (no tumba el registro)', async () => {
    externo.modo('error500');
    const res = await registrar().expect(201);
    expect(await estadoCorreo(res.body.usuario.email)).toBe('PENDIENTE');
    expect(externo.llamadas).toHaveLength(2);
  });

  it('servicio colgado: corta a los 2 s por intento y registra PENDIENTE en menos de 5 s', async () => {
    externo.modo('colgado');
    const inicio = Date.now();
    const res = await registrar().expect(201);
    const duracion = Date.now() - inicio;
    expect(duracion).toBeGreaterThanOrEqual(4000); // 2 intentos de 2 s
    expect(duracion).toBeLessThan(5000);
    expect(await estadoCorreo(res.body.usuario.email)).toBe('PENDIENTE');
  }, 10_000);

  it('tras 5 registros fallidos el circuito se abre: el 6º no llama al servicio y responde al instante', async () => {
    externo.modo('error500');
    for (let i = 0; i < 5; i++) await registrar().expect(201);
    expect(externo.llamadas).toHaveLength(10); // 5 registros × 2 intentos

    const inicio = Date.now();
    const res = await registrar().expect(201);
    expect(Date.now() - inicio).toBeLessThan(500);
    expect(externo.llamadas).toHaveLength(10); // circuito abierto: ninguna llamada nueva
    expect(await estadoCorreo(res.body.usuario.email)).toBe('PENDIENTE');
  });

  it('EXTERNAL_QUERY se agrega a la URL (demo del breaker contra el servicio simulado de infra)', async () => {
    await app.close();
    app = await crearApp({ EXTERNAL_URL: url, EXTERNAL_QUERY: 'fail=1' });
    await registrar().expect(201);
    expect(externo.llamadas[0]).toBe('/validar-correo?fail=1');
  });
});

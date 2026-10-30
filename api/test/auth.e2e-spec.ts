import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, limpiarDb } from './app';

describe('Auth (/api/auth)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const ana = { nombre: 'Ana Gómez', email: 'Ana@Universidad.edu.co', password: 'ana123', rol: 'estudiante' };

  beforeAll(async () => {
    app = await crearApp();
  });
  beforeEach(() => limpiarDb(app));
  afterAll(() => app.close());

  it('registro devuelve { token, usuario: {id, nombre, email, rol} } con el correo normalizado', async () => {
    const res = await http().post('/api/auth/registro').send(ana).expect(201);
    expect(res.body).toEqual({
      token: expect.any(String),
      usuario: { id: expect.any(Number), nombre: 'Ana Gómez', email: 'ana@universidad.edu.co', rol: 'estudiante' },
    });
  });

  it('registro con un correo ya usado (sin importar mayúsculas) responde 400, no 409', async () => {
    await http().post('/api/auth/registro').send(ana).expect(201);
    const res = await http()
      .post('/api/auth/registro')
      .send({ ...ana, email: 'ana@universidad.edu.co' })
      .expect(400);
    expect(res.body).toEqual({ error: 'Ya existe una cuenta con ese correo' });
  });

  it.each([
    [{ ...ana, rol: 'admin' }, 'El rol debe ser estudiante u organizador'],
    [{ ...ana, email: 'no-es-correo' }, 'El correo no es válido'],
    [{ ...ana, password: '123' }, 'La contraseña debe tener al menos 6 caracteres'],
    [{ ...ana, nombre: undefined }, 'El nombre es obligatorio'],
  ])('registro inválido responde 400 con el primer mensaje: %#', async (cuerpo, mensaje) => {
    const res = await http().post('/api/auth/registro').send(cuerpo).expect(400);
    expect(res.body).toEqual({ error: mensaje });
  });

  it('login correcto devuelve la misma forma que el registro', async () => {
    await http().post('/api/auth/registro').send(ana).expect(201);
    const res = await http()
      .post('/api/auth/login')
      .send({ email: 'ANA@universidad.edu.co', password: 'ana123' })
      .expect(200);
    expect(res.body.usuario).toEqual({
      id: expect.any(Number),
      nombre: 'Ana Gómez',
      email: 'ana@universidad.edu.co',
      rol: 'estudiante',
    });
    expect(res.body.usuario).not.toHaveProperty('password_hash');
  });

  it.each([
    ['contraseña incorrecta', 'ana@universidad.edu.co', 'otra'],
    ['correo inexistente', 'nadie@universidad.edu.co', 'ana123'],
  ])('login con %s responde 401 con el mismo mensaje', async (_caso, email, password) => {
    await http().post('/api/auth/registro').send(ana).expect(201);
    const res = await http().post('/api/auth/login').send({ email, password }).expect(401);
    expect(res.body).toEqual({ error: 'Correo o contraseña incorrectos' });
  });

  it('una ruta protegida sin token responde 401', async () => {
    const res = await http().get('/api/eventos').expect(401);
    expect(res.body).toEqual({ error: 'Inicia sesión para continuar' });
  });

  it('un token alterado responde 401', async () => {
    const { body } = await http().post('/api/auth/registro').send(ana).expect(201);
    const res = await http()
      .get('/api/eventos')
      .set('Authorization', `Bearer ${body.token}x`)
      .expect(401);
    expect(res.body).toEqual({ error: 'Tu sesión expiró, inicia sesión de nuevo' });
  });
});

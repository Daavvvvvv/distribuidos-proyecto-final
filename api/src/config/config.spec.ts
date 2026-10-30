import { leerConfig, VARIABLES_REQUERIDAS } from './config';

const completo: NodeJS.ProcessEnv = {
  PORT: '3000',
  AWS_REGION: 'us-east-1',
  DB_HOST: 'db',
  DB_PORT: '5432',
  DB_NAME: 'eventos',
  DB_USER: 'eventos_admin',
  DB_PASSWORD: 'secreto',
  QUEUE_URL: 'http://cola',
  EXTERNAL_URL: 'http://externo/',
  JWT_SECRET: 'jwt',
};

describe('leerConfig', () => {
  it.each(VARIABLES_REQUERIDAS)('no arranca si falta %s y la nombra en el error', (nombre) => {
    expect(() => leerConfig({ ...completo, [nombre]: undefined })).toThrow(nombre);
    expect(() => leerConfig({ ...completo, [nombre]: '  ' })).toThrow(nombre);
  });

  it('acepta la configuración completa con los valores por defecto de las opcionales', () => {
    const config = leerConfig(completo);
    expect(config.port).toBe(3000);
    expect(config.db.ssl).toBe(true); // RDS exige SSL: activado salvo DB_SSL=false
    expect(config.externalUrl).toBe('http://externo');
    expect(config.seedDemo).toBe(false);
    expect(config.snsTopicArn).toBeUndefined();
  });

  it('DB_SSL=false lo desactiva (Postgres local)', () => {
    expect(leerConfig({ ...completo, DB_SSL: 'false' }).db.ssl).toBe(false);
  });

  it('rechaza un PORT no numérico', () => {
    expect(() => leerConfig({ ...completo, PORT: 'abc' })).toThrow('PORT');
  });
});

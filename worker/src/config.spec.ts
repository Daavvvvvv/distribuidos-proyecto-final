import { leerConfig, VARIABLES_REQUERIDAS } from './config';

const completo: NodeJS.ProcessEnv = {
  AWS_REGION: 'us-east-1',
  DB_HOST: 'db',
  DB_PORT: '5432',
  DB_NAME: 'eventos',
  DB_USER: 'eventos_admin',
  DB_PASSWORD: 'secreto',
  QUEUE_URL: 'http://cola',
};

describe('leerConfig (worker)', () => {
  it.each(VARIABLES_REQUERIDAS)('no arranca si falta %s y la nombra en el error', (nombre) => {
    expect(() => leerConfig({ ...completo, [nombre]: undefined })).toThrow(nombre);
  });

  it('arranca sin PORT, EXTERNAL_URL ni SNS_TOPIC_ARN (en ese caso solo registra el envío en el log)', () => {
    const config = leerConfig(completo);
    expect(config.snsTopicArn).toBeUndefined();
    expect(config.db.ssl).toBe(true);
  });

  it('el endpoint de SNS sale de AWS_ENDPOINT_URL_SNS o, si falta, de AWS_ENDPOINT_URL', () => {
    expect(leerConfig({ ...completo, AWS_ENDPOINT_URL: 'http://a' }).awsEndpointUrlSns).toBe('http://a');
    expect(
      leerConfig({ ...completo, AWS_ENDPOINT_URL: 'http://a', AWS_ENDPOINT_URL_SNS: 'http://b' }).awsEndpointUrlSns,
    ).toBe('http://b');
  });
});

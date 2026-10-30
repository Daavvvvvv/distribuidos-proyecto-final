// Variables para las pruebas: Postgres de docker-compose, base de datos aparte (eventos_test).
const valores: Record<string, string> = {
  PORT: '0',
  AWS_REGION: 'us-east-1',
  DB_HOST: 'localhost',
  DB_PORT: '5435',
  DB_NAME: 'eventos_test',
  DB_USER: 'eventos_admin',
  DB_PASSWORD: 'eventos_local',
  DB_SSL: 'false',
  QUEUE_URL: 'http://localhost:9324/000000000000/notificaciones-test',
  AWS_ENDPOINT_URL: 'http://localhost:9324',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  EXTERNAL_URL: 'http://localhost:4010',
  JWT_SECRET: 'secreto-de-pruebas',
  LOG_LEVEL: 'silent',
  SEED_DEMO: 'false',
};
for (const [nombre, valor] of Object.entries(valores)) {
  process.env[nombre] ??= valor;
}

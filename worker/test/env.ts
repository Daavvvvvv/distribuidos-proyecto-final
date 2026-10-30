// Postgres de docker-compose (base eventos_test) y una cola propia con visibilidad de 1 s.
const valores: Record<string, string> = {
  AWS_REGION: 'us-east-1',
  DB_HOST: 'localhost',
  DB_PORT: '5435',
  DB_NAME: 'eventos_test',
  DB_USER: 'eventos_admin',
  DB_PASSWORD: 'eventos_local',
  DB_SSL: 'false',
  QUEUE_URL: 'http://localhost:9324/000000000000/notificaciones-worker-test',
  AWS_ENDPOINT_URL: 'http://localhost:9324',
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  LOG_LEVEL: 'silent',
};
for (const [nombre, valor] of Object.entries(valores)) {
  process.env[nombre] ??= valor;
}

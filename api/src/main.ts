import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { leerConfig, VARIABLES_LEIDAS } from './config/config';
import { configurarApp } from './configurar-app';

async function bootstrap(): Promise<void> {
  // Falla antes de levantar nada si falta una variable requerida.
  const config = leerConfig(process.env);

  const app = await NestFactory.create(AppModule.registrar(config), { bufferLogs: true });
  configurarApp(app);

  // Qué variables llegaron (sin valores: algunas son secretos).
  app.get(Logger).log({
    msg: 'Configuración cargada',
    presentes: VARIABLES_LEIDAS.filter((nombre) => process.env[nombre]),
    ausentes: VARIABLES_LEIDAS.filter((nombre) => !process.env[nombre]),
  });

  await app.listen(config.port);
}

bootstrap().catch((error: unknown) => {
  // El logger de Nest puede no existir todavía: se escribe el JSON a mano.
  console.error(
    JSON.stringify({
      level: 'fatal',
      time: new Date().toISOString(),
      msg: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});

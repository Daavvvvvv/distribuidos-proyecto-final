import { DynamicModule, Module, RequestMethod } from '@nestjs/common';
import { opcionesLogger } from '@eventos/shared';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import type { Config } from './config/config';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { DemoSeed } from './demo/demo.seed';
import { EventosModule } from './eventos/eventos.module';
import { HealthController } from './health/health.controller';
import { InscripcionesModule } from './inscripciones/inscripciones.module';
import { MetricasModule } from './metricas/metricas.module';

@Module({})
export class AppModule {
  static registrar(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.registrar(config),
        LoggerModule.forRoot({
          pinoHttp: {
            ...opcionesLogger(config.logLevel),
            // El health check del balanceador (cada 15 s) no llena los logs.
            autoLogging: { ignore: (req) => req.url === '/health' },
          },
          // El valor por defecto de nestjs-pino ('*') es la sintaxis vieja de rutas y Nest 11 lo advierte al arrancar.
          forRoutes: [{ path: '{*ruta}', method: RequestMethod.ALL }],
        }),
        DbModule,
        MetricasModule,
        AuthModule,
        EventosModule,
        InscripcionesModule,
      ],
      controllers: [HealthController],
      providers: [DemoSeed],
    };
  }
}

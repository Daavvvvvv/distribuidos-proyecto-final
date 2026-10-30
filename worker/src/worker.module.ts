import { DynamicModule, Module } from '@nestjs/common';
import { opcionesLogger } from '@eventos/shared';
import { LoggerModule } from 'nestjs-pino';
import { CONFIG, type Config } from './config';
import { Consumidor } from './consumidor';
import { Db } from './db';
import { Notificador } from './notificador';

@Module({})
export class WorkerModule {
  static registrar(config: Config): DynamicModule {
    return {
      module: WorkerModule,
      imports: [LoggerModule.forRoot({ pinoHttp: opcionesLogger(config.logLevel) })],
      providers: [{ provide: CONFIG, useValue: config }, Db, Notificador, Consumidor],
    };
  }
}

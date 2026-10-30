import { DynamicModule, Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from './config';

@Global()
@Module({})
export class ConfigModule {
  static registrar(config: Config): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}

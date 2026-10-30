import { Global, Module } from '@nestjs/common';
import { Db } from './db';

@Global()
@Module({
  providers: [Db],
  exports: [Db],
})
export class DbModule {}

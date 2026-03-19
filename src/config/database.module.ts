import { Module, Global } from '@nestjs/common';
import { databasePool } from './database';

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useValue: databasePool,
    },
  ],
  exports: ['DATABASE_POOL'],
})
export class DatabaseModule {}

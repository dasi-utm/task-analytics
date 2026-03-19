import { Module, Global } from '@nestjs/common';
import { RabbitMQConnection } from './rabbitmq';

@Global()
@Module({
  providers: [
    {
      provide: 'RABBITMQ_CONNECTION',
      useValue: new RabbitMQConnection(),
    },
  ],
  exports: ['RABBITMQ_CONNECTION'],
})
export class RabbitMQModule {}

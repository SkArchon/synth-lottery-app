import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { ContractEventListener } from './ethereum.server';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const microservice = app.connectMicroservice({
    strategy: new ContractEventListener()
  });

  app.enableCors();
  await app.startAllMicroservicesAsync();
  await app.listen(3000);
}
bootstrap();


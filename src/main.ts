import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GasService } from './eth/gas.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.init();

  // Ensure initial gas snapshot is ready before serving traffic
  const gas = app.get(GasService);
  const timeoutMs = parseInt(process.env.GAS_READY_TIMEOUT_MS ?? '10000', 10);
  const start = Date.now();
  while (!gas.getSnapshot() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

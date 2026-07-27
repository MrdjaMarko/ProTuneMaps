import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import { AppModule } from "./app.module";

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(3000, "0.0.0.0");
}

if (require.main === module) {
  void bootstrap();
}

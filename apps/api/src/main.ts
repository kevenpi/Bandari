import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

/**
 * Load .env BEFORE the DI container constructs PrismaClient. Existing env vars
 * win (so a parent process can override e.g. ORCHESTRATOR for verification).
 */
function loadEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.replace(/\r$/, "");
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function bootstrap(): Promise<void> {
  loadEnv(".env");
  loadEnv("../../.env");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 5 * 1024 * 1024 }),
  );
  app.enableCors({ origin: true });
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  Logger.log(
    `Bandari API on http://localhost:${port} | adapterMode=${process.env.ADAPTER_MODE ?? "mock"} | orchestrator=${process.env.ORCHESTRATOR ?? "bullmq"}`,
    "Bootstrap",
  );
}

void bootstrap();

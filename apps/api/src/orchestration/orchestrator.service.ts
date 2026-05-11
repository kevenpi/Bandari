import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import { AppConfigService } from "../config/app-config.service";
import { PaymentEngine, type StepResult } from "../payments/payment-engine.service";
import type { ParsedCallback } from "../adapters/mpesa.adapter";

const QUEUE_NAME = "bandari-payment-steps";
const JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 400 },
  removeOnComplete: 1000,
  removeOnFail: false, // keep failed jobs as a dead-letter record
};
const MAX_INLINE_STEPS = 25;

/**
 * Drives payments through the state machine. In `bullmq` mode each step is a
 * durable job (retries + dead-letter); in `inline` mode steps run synchronously
 * in-process (used by the verification suite and when Redis is unavailable).
 */
@Injectable()
export class OrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Orchestrator");
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: AppConfigService,
    private readonly engine: PaymentEngine,
  ) {}

  get mode() {
    return this.config.orchestrator;
  }

  private connectionOptions(): ConnectionOptions {
    const url = new URL(this.config.redisUrl);
    return {
      host: url.hostname || "localhost",
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: url.pathname && url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
      maxRetriesPerRequest: null,
    };
  }

  async onModuleInit(): Promise<void> {
    if (this.mode !== "bullmq") {
      this.logger.log("Orchestrator running in INLINE mode (no Redis queue).");
      return;
    }
    const connection = this.connectionOptions();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { paymentId } = job.data as { paymentId: string };
        const result = await this.engine.step(paymentId);
        if (!result.waiting && !result.done) {
          await this.queue!.add("step", { paymentId }, JOB_OPTS);
        }
        return result;
      },
      { connection, concurrency: 5 },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Step job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
    this.logger.log("Orchestrator running in BULLMQ mode.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Kick off processing for a payment (or resume it after an external event). */
  async drive(paymentId: string): Promise<StepResult | void> {
    if (this.mode === "inline") return this.driveInline(paymentId);
    await this.queue!.add("step", { paymentId }, JOB_OPTS);
  }

  /** Apply funding then continue driving to a terminal/waiting state. */
  async onFunding(paymentId: string, callback: ParsedCallback): Promise<StepResult> {
    const funded = await this.engine.applyFunding(paymentId, callback);
    if (funded.status === "Funded") await this.drive(paymentId);
    if (this.mode === "inline") {
      const result = await this.driveInline(paymentId);
      return result;
    }
    return funded;
  }

  private async driveInline(paymentId: string): Promise<StepResult> {
    let result = await this.engine.step(paymentId);
    let steps = 1;
    while (!result.waiting && !result.done && steps < MAX_INLINE_STEPS) {
      result = await this.engine.step(paymentId);
      steps += 1;
    }
    return result;
  }
}

import { BadRequestException } from "@nestjs/common";
import type { z, ZodTypeAny } from "zod";

/** Parse and validate a request body against a zod schema (400 on failure). */
export function zodBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: "Validation failed",
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

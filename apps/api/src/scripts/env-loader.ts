import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal .env loader (no dependency). Existing process.env always wins. */
export function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trimStart().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

/** apps/api/.env path (relative to this source file under tsx). */
export const API_ENV_PATH = path.resolve(__dirname, "../../.env");

/** Load apps/api/.env then the repo-root .env. */
export function loadLocalEnv(): void {
  loadEnvFile(API_ENV_PATH);
  loadEnvFile(path.resolve(__dirname, "../../../../.env"));
}

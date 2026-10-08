import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Local stand-in for Airo's secret store: reads .env and .env.local from the
// project root, then falls back to real environment variables.
function readEnvFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[m[1]] = value;
    }
  }
  return out;
}

export function getSecret(name: string): string | undefined {
  return process.env[name] ?? readEnvFiles()[name];
}

export async function requestSecrets(..._names: string[]): Promise<void> {
  // No-op locally: secrets come from .env.local.
}
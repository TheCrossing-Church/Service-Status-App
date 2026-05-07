import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} must be a number`);
  return n;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: int("PORT", 4000),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: optional("SESSION_SECRET", "dev-secret-change-me"),
  sessionMaxAgeMs: int("SESSION_MAX_AGE_MS", 12 * 60 * 60 * 1000),
  corsOrigins: optional("CORS_ORIGINS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  vapidPublicKey: optional("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: optional("VAPID_PRIVATE_KEY"),
  vapidSubject: optional("VAPID_SUBJECT", "mailto:it@thecrossing.church"),
  rockBaseUrl: optional("ROCK_BASE_URL"),
  rockApiKey: optional("ROCK_API_KEY"),
};

export const isProd = env.nodeEnv === "production";

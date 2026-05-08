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
  port: int("PORT", 3000),
  databasePath: optional("DATABASE_PATH", "./tmp/dev.db"),
  // Used to sign JWTs. Must be ≥ 32 bytes in production. The fallback
  // exists to keep `npm run dev` working out of the box; warn loudly
  // anywhere that's not local development.
  jwtSecret: optional("JWT_SECRET", "dev-jwt-secret-change-me"),
  // jsonwebtoken accepts strings like "12h", "7d", or a number of seconds.
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "12h"),
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

if (isProd && env.jwtSecret === "dev-jwt-secret-change-me") {
  throw new Error(
    "JWT_SECRET must be set in production. Generate one with `openssl rand -base64 48`.",
  );
}

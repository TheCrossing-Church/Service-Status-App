import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { pool } from "./db.js";
import { env } from "./env.js";
import { HttpError } from "./lib/httpError.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { sendRouter } from "./routes/send.js";
import { statusRouter } from "./routes/status.js";
import { subscribersRouter } from "./routes/subscribers.js";
import { triggerRouter } from "./routes/trigger.js";

const app = express();
app.set("trust proxy", 1);

// Helmet defaults are fine for an API; we relax CSP since we don't serve HTML.
app.use(helmet({ contentSecurityPolicy: false }));

// Allow-list CORS for the PWA dev origins. Auth is via Bearer header, so
// we don't need credentialed requests — but still echo the origin and Vary
// so dev tooling behaves.
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (origin && env.corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
  }
  next();
});

app.use(express.json({ limit: "100kb" }));

// Disallow indexing for the entire API surface (status page lives here too).
app.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

app.use("/api/auth", authRouter);
app.use("/api", statusRouter);
app.use("/api", sendRouter);
app.use("/api", triggerRouter);
app.use("/api", subscribersRouter);
app.use("/api/admin", adminRouter);

app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port}`);
});

function shutdown(signal: string): void {
  console.log(`[server] received ${signal}, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

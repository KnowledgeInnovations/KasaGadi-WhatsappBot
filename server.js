import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import config from "./src/config/index.js";
import { connectDB } from "./src/db/connection.js";
import webhookRoutes from "./src/routes/webhook.js";
import apiRoutes from "./src/routes/api.js";
import { authMiddleware, loginHandler } from "./src/middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------- Middleware ----------
// Trust proxy (required for Render, Heroku, etc. behind reverse proxy)
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

// Serve static files (assets)
app.use("/static", express.static(path.join(__dirname, "public")));

// Serve React dashboard app (built to public/app)
app.use("/app", express.static(path.join(__dirname, "public", "app")));
// React Router fallback — serve index.html for any /app/* path
app.get("/app/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app", "index.html"));
});

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/webhook", limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path !== "/api/health") {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ---------- Routes ----------
app.use(webhookRoutes);

// Auth endpoint (public)
app.post("/api/auth/login", loginHandler);

// Protect all other /api routes
app.use("/api", authMiddleware, apiRoutes);

// Legacy /dashboard path — the real admin dashboard now lives at /app
app.get("/dashboard", (req, res) => res.redirect("/app"));

// Root
app.get("/", (req, res) => {
  res.json({
    service: "Kasagadi AI WhatsApp Assistant",
    status: "running",
    version: "1.0.0",
    poweredBy: "Mansa AI",
    endpoints: {
      webhook: "/webhook",
      dashboard: "/app",
      health: "/api/health",
      stats: "/api/stats",
      claims: "/api/claims",
      members: "/api/members",
    },
  });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  // express.json() sets err.status = 400 for malformed request bodies (e.g. a
  // probe or a buggy client sending invalid JSON) — that's a client error, not
  // a server failure. Treating it as 500 previously misclassified routine bad
  // requests as outages, which could trip alerting and make Meta's webhook
  // delivery treat us as unhealthy rather than just rejecting one bad request.
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error("[Server Error]", err.message);
  } else {
    console.warn("[Client Error]", status, err.message);
  }
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message || "Bad request" });
});

// ---------- Start ----------
async function start() {
  // Connect to MongoDB (sessions/members/broadcasts only — claims come live from the Kasagadi API)
  const dbConnected = await connectDB();

  app.listen(config.port, () => {
    console.log(`\n🤖 Kasagadi AI WhatsApp Assistant`);
    console.log(`   Server running on port ${config.port}`);
    console.log(`   Database:   ${dbConnected ? "MongoDB Atlas ✅" : "In-memory (no persistence) ⚠️"}`);
    console.log(`   Webhook:    http://localhost:${config.port}/webhook`);
    console.log(`   Dashboard:  http://localhost:${config.port}/app`);
    console.log(`   API:        http://localhost:${config.port}/api/health`);
    console.log(`   AI Model:   Mansa AI (${config.mansa.baseUrl})`);
    console.log(`   Claims API: ${config.kasagadi.apiKey ? "Kasagadi API ✅" : "⚠️  KASAGADI_API_KEY not set — bot will run with no verified claims"}\n`);

    // Keep-alive ping to prevent Render free-tier cold starts (every 14 min)
    const BASE_URL = process.env.BASE_URL;
    if (BASE_URL) {
      setInterval(async () => {
        try {
          const res = await fetch(`${BASE_URL}/api/health`);
          console.log(`[Keep-Alive] Ping ${res.status}`);
        } catch (err) {
          console.warn(`[Keep-Alive] Ping failed:`, err.message);
        }
      }, 14 * 60 * 1000); // 14 minutes
      console.log(`   Keep-Alive: Enabled (every 14 min) ✅\n`);
    }
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

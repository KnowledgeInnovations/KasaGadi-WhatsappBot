import crypto from "crypto";
import config from "../config/index.js";

const { admin } = config;

/**
 * Create a signed JWT-like token using HMAC-SHA256.
 * No external dependencies — uses Node's built-in crypto.
 */
function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", admin.jwtSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode a token. Returns the payload or null.
 */
function verifyToken(token) {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const expected = crypto
      .createHmac("sha256", admin.jwtSecret)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (signature !== expected) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString());

    // Check expiry
    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Login handler — POST /api/auth/login
 * Body: { username, password }
 */
export function loginHandler(req, res) {
  let { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  // Trim stray whitespace a browser/password-manager autofill can add (e.g.
  // a trailing newline) — passwords never legitimately need leading/trailing
  // whitespace, so this only helps, never weakens the check.
  username = String(username).trim();
  password = String(password).trim();

  // Constant-time comparison to prevent timing attacks
  const usernameMatch =
    username.length === admin.username.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(admin.username));
  const passwordMatch =
    password.length === admin.password.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(admin.password));

  if (!usernameMatch || !passwordMatch) {
    console.log(`[Auth] Failed login attempt for "${username}"`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = createToken({
    sub: username,
    role: "admin",
    iat: Date.now(),
    exp: Date.now() + admin.tokenExpiry,
  });

  console.log(`[Auth] Admin login successful: ${username}`);
  res.json({ token, expiresIn: admin.tokenExpiry });
}

/**
 * Auth middleware — protects /api routes.
 * Expects: Authorization: Bearer <token>
 *
 * Exempts /api/health for uptime monitoring.
 */
export function authMiddleware(req, res, next) {
  // Allow health check without auth (for uptime monitors / keep-alive)
  if (req.path === "/health") return next();

  // Allow public GET access to served media (images/videos).
  // WhatsApp must fetch these by URL to deliver them, and browser <img>/<video>
  // tags on the dashboard can't send the Bearer token. Upload/delete stay protected.
  if (req.method === "GET" && (/^\/images\//.test(req.path) || /^\/videos\//.test(req.path))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.admin = payload;
  next();
}

import dotenv from "dotenv";
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || "",

  // WhatsApp Business API
  whatsapp: {
    verifyToken: process.env.VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    apiVersion: "v22.0",
    get baseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    },
  },

  // Mansa AI — https://mansa-control-plane-623708969253.us-central1.run.app
  mansa: {
    baseUrl: process.env.MANSA_BASE_URL || "https://mansa-control-plane-623708969253.us-central1.run.app",
    apiKey: process.env.MANSA_API_KEY || "", // not required today; endpoint is open. Set if Mansa adds auth later.
    maxTokens: 900,
    temperature: 0.5,       // lower — this is a fact-checking assistant, not a creative one
    webSearch: "auto",      // let Mansa decide when to ground answers in live search
    responseLanguage: "source", // reply in the language the user wrote in (English/Twi/Hausa)
    historyTurns: 16,       // stay under Mansa's 20-turn history limit
  },

  // Kasagadi Claims API — https://kasagadi.ai/api/v1 (read-only, published claims only)
  // Documented at docs.kasagadi.ai. Key is issued by the Kasagadi team.
  kasagadi: {
    apiBaseUrl: process.env.KASAGADI_API_BASE_URL || "https://kasagadi.ai/api/v1",
    apiKey: process.env.KASAGADI_API_KEY || "",
  },

  // Session — 24h so users can return within a day without re-onboarding
  session: {
    ttlMinutes: 1440,
  },

  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || "",
    dbName: process.env.MONGODB_DB_NAME || "kasagadi-bot",
  },

  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000,   // 1 minute
    maxRequests: 30,        // per user per window
  },

  // Admin dashboard authentication
  //
  // .trim() guards against a very common failure mode: a hosting provider's
  // env-var UI (or a copy-paste into it) silently adding a trailing newline
  // or space to a pasted secret. Because the login check compares buffer
  // *lengths* before running crypto.timingSafeEqual (required — unequal
  // lengths throw), a single stray whitespace character on the stored value
  // makes every correctly-typed password fail with no way to tell why from
  // the "Invalid credentials" response alone.
  admin: {
    username: (process.env.ADMIN_USERNAME || "admin").trim(),
    password: (process.env.ADMIN_PASSWORD || "kasagadi2026").trim(),
    jwtSecret: process.env.JWT_SECRET || "kasagadi-bot-secret-" + (process.env.WHATSAPP_TOKEN || "").slice(-8),
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Company info for the AI system prompt + WhatsApp footers
  company: {
    name: "Kasagadi AI",
    industry: "Fact-Checking & Misinformation Context",
    description:
      "Kasagadi AI is a fact-checking and misinformation-context service for Ghana and the wider region. It helps people check the background of circulating stories, headlines, and rumours, surfaces relevant past fact-checks, and explains the cultural or local context behind claims — in English, Twi, and Hausa.",
    website: "https://www.kasagadi.ai",
    phone: process.env.COMPANY_PHONE || "+233597309383",           // WhatsApp: MTN 0597309383
    escalationWhatsApp: process.env.ESCALATION_WHATSAPP || "+233597309383", // human review/fact-checker team handoff
    email: process.env.COMPANY_EMAIL || "hello@kasagadi.ai",
    address: process.env.COMPANY_ADDRESS || "Accra, Ghana",
    tone: "trustworthy, calm, non-judgmental",
    businessHours: "Monday – Friday, 8:00 AM – 6:00 PM GMT (the AI itself is always on; human review follows these hours)",
    // Read from the live kasagadi.ai homepage (Ghana-flag themed) — close approximations
    // from a screenshot, not exact source hex. Ask Jules for exact tokens if it matters.
    brandColors: { primary: "#1E3F6B", secondary: "#F7F6F1", accent: "#D4A017", flagRed: "#CE1126", flagGreen: "#006B3F" },
  },
};

// Validate required env vars
const required = ["VERIFY_TOKEN", "WHATSAPP_TOKEN", "PHONE_NUMBER_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export default config;

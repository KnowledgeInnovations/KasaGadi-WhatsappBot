import express from "express";
import multer from "multer";
import config from "../config/index.js";
import {
  getAllSessions,
  getActiveSessionCount,
  getSession,
  getSessionReadOnly,
  deleteSession,
  deleteAllSessions,
} from "../services/session.js";
import { listClaims, getClaimById } from "../services/kasagadiApi.js";
import {
  getAllMembers,
  registerMember,
  deleteMember,
  buildPersonalizedLink,
} from "../services/memberService.js";
import { sendTextMessage } from "../services/whatsapp.js";
import {
  broadcastMessage,
  parsePhoneNumbers,
  saveDraft,
  getAllDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  saveBroadcastResult,
  getBroadcastResults,
  getBroadcastResult,
  exportBroadcastResultAsCSV,
  exportBroadcastSummaryAsCSV,
} from "../services/broadcast.js";

const router = express.Router();

/**
 * GET /api/health — Health check
 */
router.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeSessions: await getActiveSessionCount(),
  });
});

/**
 * GET /api/stats — Dashboard stats
 */
router.get("/stats", async (req, res) => {
  const sessions = await getAllSessions();
  const claimsPage = await listClaims({ perPage: 1 });
  const members = await getAllMembers();

  const totalMessages = sessions.reduce((acc, s) => acc + (s.history?.length || 0), 0);
  const escalated = sessions.filter((s) => s.state === "ESCALATED").length;
  const awaitingReviewer = sessions.filter((s) => s.state === "ESCALATED" && s.metadata?.escalation?.status === "awaiting_reviewer").length;
  const reviewerResponded = sessions.filter((s) => s.metadata?.escalation?.status === "responded").length;
  const registered = sessions.filter((s) => s.profile?.registered).length;
  const guests = sessions.length - registered;

  res.json({
    activeSessions: await getActiveSessionCount(),
    totalConversations: sessions.length,
    registered,
    guests,
    totalMessages,
    escalated,
    awaitingReviewer,
    reviewerResponded,
    claims: claimsPage.meta?.total_count ?? 0,
    claimsApiConnected: !claimsPage.disabled,
    members: members.length,
  });
});

// ========== CLAIMS (fact-checks) — read-only proxy to the Kasagadi Claims API ==========
// Claims are authored/published on kasagadi.ai itself, not managed here.
// This just gives the dashboard visibility into what the bot can see.

router.get("/claims", async (req, res) => {
  const { q, topic, region, verdict, page } = req.query;
  const result = await listClaims({ q, topic, region, verdict, page: page ? parseInt(page, 10) : 1, perPage: 25 });
  if (result.disabled) {
    return res.status(503).json({ error: "KASAGADI_API_KEY not configured on the server", count: 0, claims: [] });
  }
  if (result.error) {
    return res.status(502).json({ error: result.error, count: 0, claims: [] });
  }
  res.json({ count: result.claims.length, claims: result.claims, meta: result.meta });
});

router.get("/claims/:id", async (req, res) => {
  const claim = await getClaimById(req.params.id);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  res.json(claim);
});

// ========== MEMBERS (registered users) ==========

router.get("/members", async (req, res) => {
  const members = await getAllMembers();
  res.json({ count: members.length, members });
});

/**
 * POST /api/members — Create a member from the dashboard (no WhatsApp message required).
 * Body: { name, phone, email? }
 */
router.post("/members", async (req, res) => {
  try {
    const { name, phone, email } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 8) return res.status(400).json({ error: "Invalid phone number" });
    const member = await registerMember({ phone: digits, name, email, source: "dashboard" });
    if (!member) return res.status(503).json({ error: "Database not connected" });
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/members/:id/whatsapp-link — the deep link kasagadi.ai's "Chat on WhatsApp"
 * dashboard button should point to for a given member (Path A of the brief).
 */
router.get("/members/:id/whatsapp-link", async (req, res) => {
  const members = await getAllMembers();
  const member = members.find((m) => m.memberId === req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const botNumber = req.query.botNumber || process.env.WHATSAPP_DISPLAY_NUMBER || "";
  if (!botNumber) return res.status(400).json({ error: "Provide ?botNumber=<international digits, no +> or set WHATSAPP_DISPLAY_NUMBER" });
  res.json({ link: buildPersonalizedLink(member, botNumber) });
});

router.delete("/members/:id", async (req, res) => {
  const result = await deleteMember(req.params.id);
  res.json({ success: result, message: result ? "Member deleted" : "Member not found" });
});

// ========== ESCALATIONS ==========

/**
 * GET /api/escalations — Conversations escalated to a human fact-checker.
 */
router.get("/escalations", async (req, res) => {
  const sessions = await getAllSessions();
  const escalations = sessions
    .filter((s) => s.state === "ESCALATED")
    .map((s) => ({
      userId: s.userId,
      name: s.profile?.name || null,
      registered: s.profile?.registered || false,
      state: s.state,
      escalationStatus: s.metadata?.escalation?.status || "awaiting_reviewer",
      escalationReason: s.metadata?.escalation?.reason || null,
      escalatedAt: s.metadata?.escalation?.timestamp || null,
      lastActivity: s.lastActivity,
      lastMessage: s.history?.length > 0 ? s.history[s.history.length - 1].content?.substring(0, 80) : null,
    }))
    .sort((a, b) => (a.lastActivity || 0) - (b.lastActivity || 0));

  res.json({ count: escalations.length, escalations });
});

// ========== CONVERSATIONS ==========

router.delete("/conversations", async (req, res) => {
  await deleteAllSessions();
  res.json({ success: true, message: "All conversations cleared" });
});

router.delete("/conversations/:userId", async (req, res) => {
  await deleteSession(req.params.userId);
  res.json({ success: true, message: `Conversation ${req.params.userId} deleted` });
});

router.get("/conversations", async (req, res) => {
  const sessions = await getAllSessions();
  const convos = sessions.map((s) => ({
    userId: s.userId,
    state: s.state,
    messageCount: s.history?.length || 0,
    escalationStatus: s.metadata?.escalation?.status || null,
    lastMessage: s.history?.length > 0 ? s.history[s.history.length - 1].content?.substring(0, 80) : null,
    lastActivity: s.lastActivity,
    firstContact: s.firstContact || s.lastActivity,
    name: s.profile?.name || null,
    email: s.profile?.email || null,
    registered: s.profile?.registered || false,
  }));
  res.json({ count: convos.length, conversations: convos });
});

router.get("/conversations/:userId", async (req, res) => {
  const session = await getSessionReadOnly(req.params.userId);
  if (!session) return res.status(404).json({ error: "Conversation not found" });
  res.json({
    userId: session.userId,
    state: session.state,
    messageCount: session.history?.length || 0,
    history: session.history || [],
    name: session.profile?.name || null,
    email: session.profile?.email || null,
    registered: session.profile?.registered || false,
    firstContact: session.firstContact || session.lastActivity,
    lastActivity: session.lastActivity,
  });
});

// ========== BROADCAST MESSAGES (announcements / new-fact-check alerts) ==========

/**
 * POST /api/broadcast/send — Send a broadcast to an explicit list of numbers.
 */
router.post("/broadcast/send", async (req, res) => {
  try {
    const { phoneNumbers, message, templateName, templateLanguage } = req.body || {};
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: "Provide phoneNumbers array with at least one number" });
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Provide a non-empty message" });
    }

    const options = templateName ? { templateName, templateLanguage: templateLanguage || "en_US" } : {};
    const results = await broadcastMessage(phoneNumbers, message, options);
    const durationSeconds = (results.endTime - results.startTime) / 1000;

    try {
      await saveBroadcastResult({
        title: `Broadcast - ${new Date().toLocaleString()}`,
        message: templateName ? `[Template: ${templateName}]` : message,
        phoneNumbers,
        ...results,
        durationSeconds,
      });
    } catch (saveErr) {
      console.error("[API] Failed to save broadcast result:", saveErr.message);
    }

    res.status(202).json({ status: "broadcast_completed", ...results, durationSeconds });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/broadcast/members-audience — Preview how many registered members a broadcast would reach.
 */
router.get("/broadcast/members-audience", async (req, res) => {
  try {
    const members = await getAllMembers();
    const recipients = members.map((m) => ({ phone: normalizePhone(m.phone), name: m.name })).filter((r) => r.phone);
    res.json({ count: recipients.length, recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/broadcast/send-members — Broadcast to registered members (e.g. "new fact-check published").
 * Body: { message, title?, phones? } — message supports {name} / {first_name} placeholders.
 */
router.post("/broadcast/send-members", async (req, res) => {
  try {
    const { message, title, phones } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Provide a non-empty message" });
    }

    const members = await getAllMembers();
    const memberMap = new Map(members.map((m) => [normalizePhone(m.phone), m.name]));

    let recipients;
    if (Array.isArray(phones) && phones.length > 0) {
      const seen = new Set();
      recipients = [];
      for (const p of phones) {
        const phone = normalizePhone(p);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        recipients.push({ phone, name: memberMap.get(phone) || "" });
      }
    } else {
      recipients = members.map((m) => ({ phone: normalizePhone(m.phone), name: m.name })).filter((r) => r.phone);
    }

    if (recipients.length === 0) return res.status(400).json({ error: "No valid recipients to send to" });

    const results = await broadcastMessage(recipients, message);
    const durationSeconds = (results.endTime - results.startTime) / 1000;

    try {
      await saveBroadcastResult({
        title: title || `Members Broadcast - ${new Date().toLocaleString()}`,
        message,
        phoneNumbers: recipients.map((r) => r.phone),
        ...results,
        durationSeconds,
        notes: "Audience: registered members",
      });
    } catch (saveErr) {
      console.error("[API] Failed to save members broadcast result:", saveErr.message);
    }

    res.status(202).json({ status: "broadcast_completed", audience: recipients.length, ...results, durationSeconds });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `+${digits}`;
}

/**
 * POST /api/broadcast/upload-excel — Upload a CSV/JSON file of phone numbers and send a broadcast.
 */
const broadcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype.includes("csv") ||
      file.mimetype.includes("json") ||
      file.mimetype.includes("spreadsheet") ||
      file.originalname.endsWith(".csv") ||
      file.originalname.endsWith(".json") ||
      file.originalname.endsWith(".xlsx");
    if (ok) cb(null, true);
    else cb(new Error("Only CSV, JSON, or XLSX files are allowed"), false);
  },
});

router.post("/broadcast/upload-excel", broadcastUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { message } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Provide a non-empty message in body" });
    }

    let phoneNumbers = [];
    if (req.file.mimetype.includes("json")) {
      const jsonData = JSON.parse(req.file.buffer.toString());
      phoneNumbers = parsePhoneNumbers(jsonData, req.body.phoneField);
    } else if (req.file.originalname.endsWith(".csv")) {
      const csvText = req.file.buffer.toString();
      const lines = csvText.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const phoneColumnIndex = headers.findIndex((h) => h.includes("phone") || h.includes("whatsapp") || h.includes("mobile"));
      if (phoneColumnIndex === -1) return res.status(400).json({ error: "Could not find phone column in CSV" });
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(",").map((c) => c.trim());
        if (cells[phoneColumnIndex]) {
          let phone = cells[phoneColumnIndex];
          if (!phone.startsWith("+")) phone = "+233" + phone.replace(/^0/, "");
          phoneNumbers.push(phone);
        }
      }
    } else {
      return res.status(400).json({ error: "Unsupported file format. Use CSV or JSON" });
    }

    if (phoneNumbers.length === 0) return res.status(400).json({ error: "No valid phone numbers found in file" });

    const results = await broadcastMessage(phoneNumbers, message);
    try {
      await saveBroadcastResult({
        title: `Broadcast - ${new Date().toLocaleString()}`,
        message,
        phoneNumbers,
        ...results,
        filename: req.file.originalname,
        durationSeconds: (results.endTime - results.startTime) / 1000,
      });
    } catch (err) {
      console.error("[API] Failed to save broadcast result:", err.message);
    }

    res.status(202).json({
      status: "broadcast_completed",
      filename: req.file.originalname,
      parsedNumbers: phoneNumbers.length,
      ...results,
      durationSeconds: (results.endTime - results.startTime) / 1000,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/broadcast/status", (req, res) => {
  res.json({
    info: "Broadcasts execute synchronously. Check response from /api/broadcast/send or /api/broadcast/upload-excel",
    endpoints: { send: "POST /api/broadcast/send", uploadExcel: "POST /api/broadcast/upload-excel" },
  });
});

// ========== DRAFT MANAGEMENT ==========

router.post("/broadcast/drafts", async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ error: "title and message are required" });
    const draft = await saveDraft(title, message);
    res.status(201).json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/broadcast/drafts", async (req, res) => {
  try {
    const drafts = await getAllDrafts();
    res.json({ count: drafts.length, drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/broadcast/drafts/:draftId", async (req, res) => {
  try {
    const draft = await getDraft(req.params.draftId);
    res.json(draft);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.put("/broadcast/drafts/:draftId", async (req, res) => {
  try {
    const { title, message } = req.body;
    const updates = {};
    if (title) updates.title = title;
    if (message) updates.message = message;
    const draft = await updateDraft(req.params.draftId, updates);
    res.json(draft);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.delete("/broadcast/drafts/:draftId", async (req, res) => {
  try {
    await deleteDraft(req.params.draftId);
    res.json({ success: true, message: "Draft deleted" });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ========== BROADCAST RESULTS & EXPORT ==========

router.get("/broadcast/results", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const skip = parseInt(req.query.skip || "0", 10);
    const { results, total } = await getBroadcastResults({ limit, skip });
    res.json({ count: results.length, total, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/broadcast/results/:broadcastId", async (req, res) => {
  try {
    const result = await getBroadcastResult(req.params.broadcastId);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get("/broadcast/results/:broadcastId/export-csv", async (req, res) => {
  try {
    const broadcast = await getBroadcastResult(req.params.broadcastId);
    const csv = exportBroadcastResultAsCSV(broadcast);
    res.set("Content-Type", "text/csv");
    res.set("Content-Disposition", `attachment; filename="broadcast-results-${broadcast.broadcastId}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get("/broadcast/export-summary-csv", async (req, res) => {
  try {
    const { results } = await getBroadcastResults({ limit: 1000 });
    const csv = exportBroadcastSummaryAsCSV(results);
    res.set("Content-Type", "text/csv");
    res.set("Content-Disposition", `attachment; filename="broadcast-summary-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

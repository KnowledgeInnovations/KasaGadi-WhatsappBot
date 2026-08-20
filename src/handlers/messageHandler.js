import { generateResponse } from "../services/mansa.js";
import { getSession, addMessage, updateState, updateProfile } from "../services/session.js";
import { searchClaims } from "../services/kasagadiApi.js";
import {
  findMemberByPhone,
  findMemberById,
  registerMember,
  touchMember,
  extractRefToken,
} from "../services/memberService.js";
import {
  sendTextMessage,
  sendButtonMessage,
  markAsRead,
} from "../services/whatsapp.js";
import config from "../config/index.js";

// --- Review-team session keep-alive ---
// WhatsApp only allows interactive/button messages within 24h of last team message.
// Every 22h we send the review team an activation request. When they reply, the 24h window reopens.
const REVIEW_SESSION_DAYS = 30;
const KEEP_ALIVE_INTERVAL_MS = 22 * 60 * 60 * 1000; // 22 hours

let reviewKeepAliveTimer = null;
let reviewSessionExpiry = 0; // epoch ms — 0 means inactive

function startReviewKeepAlive() {
  if (reviewKeepAliveTimer) clearInterval(reviewKeepAliveTimer);
  reviewSessionExpiry = Date.now() + REVIEW_SESSION_DAYS * 24 * 60 * 60 * 1000;

  reviewKeepAliveTimer = setInterval(async () => {
    if (Date.now() >= reviewSessionExpiry) {
      clearInterval(reviewKeepAliveTimer);
      reviewKeepAliveTimer = null;
      console.log("[Review] Keep-alive session expired");
      return;
    }
    const reviewNumber = config.company.escalationWhatsApp.replace("+", "");
    const daysLeft = Math.ceil((reviewSessionExpiry - Date.now()) / (24 * 60 * 60 * 1000));
    try {
      await sendButtonMessage(
        reviewNumber,
        `🔔 *Kasagadi Bot — Session Activation*\n\nTap the button below to keep your escalation alerts active.\n\n⏳ Session expires in *${daysLeft} day${daysLeft !== 1 ? "s" : ""}*.`,
        [{ id: "review_keepalive_ack", title: "✅ Keep Active" }],
        "Stay Active"
      );
    } catch {
      await sendTextMessage(
        reviewNumber,
        `🔔 *Kasagadi Bot — Session Activation Required*\n\nReply to this message to keep your escalation alerts active with action buttons.\n\n⏳ Session expires in *${daysLeft} day${daysLeft !== 1 ? "s" : ""}*.`
      );
    }
    console.log(`[Review] Sent 22h activation request — ${daysLeft} day(s) remaining`);
  }, KEEP_ALIVE_INTERVAL_MS);

  console.log(`[Review] Keep-alive started — activation requests every 22h for ${REVIEW_SESSION_DAYS} days`);
}

// --- Message deduplication (prevents duplicate processing from webhook retries) ---
const recentMessageIds = new Set();
const DEDUP_TTL = 60_000; // 60 seconds

function isDuplicate(messageId) {
  if (recentMessageIds.has(messageId)) return true;
  recentMessageIds.add(messageId);
  setTimeout(() => recentMessageIds.delete(messageId), DEDUP_TTL);
  return false;
}

/**
 * Main conversation handler — routes every incoming message through the
 * Kasagadi / Mansa fact-checking pipeline.
 */
export async function handleIncomingMessage(messagePayload) {
  const { from, messageId, type, text, interactive, media } = normalizePayload(messagePayload);

  if (!from || !messageId) return;

  if (isDuplicate(messageId)) {
    console.log(`[Dedup] Skipping duplicate message ${messageId}`);
    return;
  }

  markAsRead(messageId);

  // --- Review team message handling (human fact-checkers) ---
  const reviewNumber = config.company.escalationWhatsApp.replace("+", "");
  if (from === reviewNumber) {
    startReviewKeepAlive();

    if (type === "interactive") {
      const interactiveId = interactive?.button_reply?.id || "";
      if (interactiveId.startsWith("escalation_respond_")) {
        const clientNumber = interactiveId.replace("escalation_respond_", "");
        await handleReviewerResponse(clientNumber, "responded", reviewNumber);
        return;
      }
      if (interactiveId.startsWith("escalation_later_")) {
        const clientNumber = interactiveId.replace("escalation_later_", "");
        await handleReviewerResponse(clientNumber, "later", reviewNumber);
        return;
      }
      if (interactiveId === "review_keepalive_ack") {
        await sendTextMessage(reviewNumber, `✅ Session activated! You'll receive escalation alerts with action buttons for the next 24 hours.`);
        return;
      }
    }

    const greeting = /^(hi|hello|hey|good\s*(?:morning|afternoon|evening)|yo|sup|howdy)[\s!.]*$/i;
    if (greeting.test(text.trim())) {
      const expiryDate = new Date(reviewSessionExpiry);
      const expiryStr = expiryDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      await sendTextMessage(
        reviewNumber,
        `👋 Hello! I'm the Kasagadi AI bot assistant.\n\n✅ *Notification session activated for 30 days!*\nYou'll receive escalation alerts with interactive buttons until *${expiryStr}*.\n\nReply *hi* anytime to reset the window.`
      );
      return;
    }

    console.log(`[Review] Message from review team — keep-alive refreshed`);
    return;
  }

  // --- Audio/voice message — politely ask for text ---
  if (type === "audio") {
    await sendTextMessage(
      from,
      `🎙️ I received your voice message!\n\nPlease send a *text message* instead — this helps me check claims and respond accurately. 😊\n\nWhat would you like to check today?`
    );
    return;
  }

  const session = await getSession(from);
  let userText = extractUserText(type, text, interactive, media);
  if (!userText) return; // unsupported message type

  // --- Personalised-link support (Path A): strip & resolve a hidden [ref:memberId] token ---
  const { memberId: refMemberId, cleanText } = extractRefToken(userText);
  if (refMemberId) userText = cleanText || userText;

  // --- Command shortcuts ---
  const command = userText.trim().toLowerCase();

  if (command === "/reset" || command === "start over") {
    await updateState(from, "GREETING");
    session.history = [];
    await sendTextMessage(from, "🔄 Conversation reset! What would you like to check today?");
    return;
  }

  if (command === "/menu" || command === "menu" || command === "help" || command === "/help") {
    await sendMenu(from, session);
    return;
  }

  const speakToHumanCmd = /^(?:\/agent|speak(?:\s+to)?\s+(?:an?\s+)?(?:agent|human|person|someone|staff|fact.?checker|team\s+member)|human\s+(?:agent|please|help|support)|talk\s+to\s+(?:an?\s+)?(?:agent|human|person|someone|fact.?checker|team\s+member)|connect\s+(?:me\s+)?(?:to|with)\s+(?:an?\s+)?(?:agent|human|person|real\s+person|someone|fact.?checker|staff|representative|team\s+member)|i\s+(?:want|need|would\s+like)\s+(?:to\s+(?:speak|talk|chat|connect)\s+(?:to|with)\s+)?(?:an?\s+)?(?:agent|human|person|real\s+person|fact.?checker|staff|someone)|get\s+(?:a\s+)?(?:human|real\s+person|agent|fact.?checker)|real\s+(?:agent|person|human)|report\s+(?:this|an?\s+issue))$/i;
  if (speakToHumanCmd.test(command)) {
    await handleEscalation(from, "User requested a human fact-checker");
    return;
  }

  if (["register", "sign up", "signup", "create account", "create an account", "/register"].includes(command)) {
    await updateState(from, "AWAITING_REGISTER_NAME");
    await sendTextMessage(from, `Great! Let's get you registered. 📝\n\nWhat name should I save your account under?`);
    return;
  }

  // --- Resolve identity: known member by ref token, phone match, or already-known session profile ---
  if (!session.profile?.name) {
    let member = null;
    if (refMemberId) member = await findMemberById(refMemberId);
    if (!member) member = await findMemberByPhone(from);
    if (member) {
      await updateProfile(from, { name: member.name, email: member.email || null, registered: true, memberId: member.memberId });
      session.profile.name = member.name;
      session.profile.registered = true;
      touchMember(from).catch(() => {});
    }
  } else if (session.profile.registered) {
    touchMember(from).catch(() => {});
  }

  // --- Name collection for in-chat registration ---
  if (session.state === "AWAITING_REGISTER_NAME") {
    const name = userText.trim().replace(/[.!,]+$/, "");
    const looksLikeName = name.length >= 2 && name.length <= 60 && !/\?/.test(name) && !/^(?:no|skip|cancel)$/i.test(name);
    if (!looksLikeName) {
      await sendTextMessage(from, `Please share just your name so I can register your account — or type *cancel* to skip.`);
      return;
    }
    if (/^cancel$/i.test(name)) {
      await updateState(from, "ACTIVE");
      await sendTextMessage(from, `No problem! You can register anytime by typing *register*.`);
      return;
    }
    const member = await registerMember({ phone: from, name, source: "whatsapp" });
    await updateState(from, "ACTIVE");
    if (member) {
      await updateProfile(from, { name: member.name, registered: true, memberId: member.memberId });
      await sendTextMessage(
        from,
        `You're all set, *${name}*! ✅ Your Kasagadi account is active.\n\nI'll remember you next time you message. What would you like to check today?`
      );
    } else {
      await sendTextMessage(from, `Sorry, registration isn't available right now (database offline). You can still ask me anything — I just won't remember your name between sessions.`);
    }
    return;
  }

  // --- First-ever message: greeting per Path A (known) / Path B (guest) ---
  if (session.history.length === 0) {
    await addMessage(from, "user", userText);

    const knownName = session.profile?.name;
    if (knownName) {
      await sendTextMessage(
        from,
        `Hello ${knownName}! Welcome to Kasagadi AI on WhatsApp. How can I help you today? You can ask me questions in English, Twi, or Hausa.`
      );
    } else {
      await sendTextMessage(
        from,
        `Hello! Welcome to Kasagadi AI on WhatsApp, powered by the Mansa model. I can help provide context, background info, and past verified claims in English, Twi, or Hausa. What would you like to check today?`
      );
    }
    await updateState(from, "ACTIVE");

    // If their first message was just a greeting with nothing to check, stop here and wait for the real question.
    const isJustGreeting = /^(hi|hello|hey|sannu|hola|good\s*(?:morning|afternoon|evening)|yo|sup)[\s!.]*$/i.test(userText.trim());
    if (isJustGreeting) return;
    // Otherwise fall through and answer their actual question below.
  } else {
    await addMessage(from, "user", userText);
  }

  // --- Returning user after session TTL reset — welcome back naturally ---
  if (session.metadata?.returningUser && session.profile?.name) {
    delete session.metadata.returningUser;
    await updateProfile(from, {}); // persist metadata deletion
    await sendTextMessage(from, `Welcome back, *${session.profile.name}*! 😊`);
  }

  // --- Escalated: the human reviewer owns this conversation now, not the AI ---
  // Without this check, every message the user sends after asking for a human
  // would still get an automatic AI reply — defeating the point of escalating.
  // Forward it to the reviewer in real time and stay silent on our end; the
  // conversation returns to ACTIVE (AI resumes) once the reviewer marks it
  // "Responded" via the button in handleReviewerResponse().
  if (session.state === "ESCALATED" && session.metadata?.escalation?.status !== "responded") {
    try {
      const reviewNumber = config.company.escalationWhatsApp.replace("+", "");
      const name = session.profile?.name || "Guest";
      await sendTextMessage(reviewNumber, `💬 Follow-up from *+${from}* (${name}):\n"${userText}"`);
    } catch (err) {
      console.error("[Escalation] Failed to forward follow-up message to reviewer:", err.message);
    }
    return;
  }

  // --- Claim search + AI pipeline ---
  const matchedClaims = await searchClaims(userText, { limit: 3 });
  const member = session.profile?.registered ? { name: session.profile.name } : null;

  const freshSession = await getSession(from);
  const aiResult = await generateResponse(freshSession.history, member, matchedClaims);
  await addMessage(from, "assistant", aiResult.text);

  console.log(`[Chat] ${from} → ${userText}`);
  console.log(`[Chat] Bot → ${aiResult.text.slice(0, 150)}...`);

  await sendTextMessage(from, aiResult.text);

  // --- Guest registration nudge — once per session, after a substantive answer ---
  if (!session.profile?.registered && !session.metadata?.registrationPromptShown) {
    const isSubstantive = aiResult.text.length > 60;
    if (isSubstantive) {
      session.metadata = session.metadata || {};
      session.metadata.registrationPromptShown = true;
      await updateProfile(from, {}); // persist metadata
      await sendTextMessage(
        from,
        `\nWant to submit claims for investigation or track updates? Create an account at ${config.company.website}, or type *register* to link this WhatsApp number now.`
      );
    }
  }

  if (aiResult.escalate) {
    await handleEscalation(from, aiResult.escalate);
  }
}

/**
 * Send the quick menu
 */
async function sendMenu(to, session) {
  const known = session.profile?.registered;
  await sendButtonMessage(
    to,
    "What would you like to do? Or just type a claim/question directly. 😊",
    [
      { id: "speak_agent", title: "👤 Human Fact-Checker" },
      { id: known ? "noop_registered" : "do_register", title: known ? "✅ Account Linked" : "📝 Register" },
    ],
    "Kasagadi AI",
    "Type 'menu' anytime to see this again"
  );
}

/**
 * Handle escalation to a human fact-checker / review team member
 */
async function handleEscalation(to, reason) {
  await updateState(to, "ESCALATED");

  const session = await getSession(to);
  session.metadata = session.metadata || {};
  session.metadata.escalation = {
    status: "awaiting_reviewer",
    reason,
    timestamp: Date.now(),
  };
  await updateProfile(to, {});

  await sendTextMessage(
    to,
    `👤 *Connecting you with our fact-checking team*\n\nI'm passing this on to a human reviewer who can help further.\n\n📞 You can also reach us directly:\n• WhatsApp: ${config.company.escalationWhatsApp}\n• Email: ${config.company.email}\n\n🕒 ${config.company.businessHours}\n\nSomeone will respond shortly. Thank you for your patience! 🙏`
  );

  try {
    const name = session.profile?.name || "Guest";
    const reviewNumber = config.company.escalationWhatsApp.replace("+", "");

    const clientInfo =
      `🔔 *New Escalation — Kasagadi AI*\n\n` +
      `👤 *Name:* ${name}\n` +
      `📱 *Phone:* +${to}\n` +
      `📋 *Registered:* ${session.profile?.registered ? "Yes" : "No (guest)"}\n\n` +
      `📝 *Reason:* ${reason}\n\n` +
      `Reply to the user directly: wa.me/${to}`;

    const textResult = await sendTextMessage(reviewNumber, clientInfo);
    console.log(`[Escalation] ✅ Review team notified:`, textResult?.messages?.[0]?.id || "ID not returned");

    try {
      await sendButtonMessage(
        reviewNumber,
        `Tap to update status:`,
        [
          { id: `escalation_respond_${to}`, title: "Responded" },
          { id: `escalation_later_${to}`, title: "Later" },
        ],
        "Quick Actions"
      );
    } catch {
      console.log(`[Escalation] Buttons unavailable (outside 24h window) — plain text already delivered`);
    }
  } catch (err) {
    console.error(`[Escalation] ❌ Failed to notify review team:`, err.response?.data || err.message);
  }

  console.log(`[Escalation] ${to} — Reason: ${reason}`);
}

/**
 * Handle a reviewer's response to an escalation (button press)
 */
async function handleReviewerResponse(clientNumber, action, reviewNumber) {
  const session = await getSession(clientNumber);
  session.metadata = session.metadata || {};

  if (action === "responded") {
    session.metadata.escalation = { ...session.metadata.escalation, status: "responded", respondedAt: Date.now() };
    await updateProfile(clientNumber, {});
    await updateState(clientNumber, "ACTIVE");
    await sendTextMessage(reviewNumber, `✅ Noted! User +${clientNumber} marked as attended to.`);
  } else {
    session.metadata.escalation = { ...session.metadata.escalation, status: "awaiting_reviewer" };
    await updateProfile(clientNumber, {});
    await sendTextMessage(reviewNumber, `⏰ Noted! User +${clientNumber} is still awaiting a response.`);
  }
}

/**
 * Normalize the incoming WhatsApp payload
 */
function normalizePayload(messagePayload) {
  const type = messagePayload.type;
  const mediaTypes = ["image", "video", "document", "audio", "sticker"];
  const raw = mediaTypes.includes(type) ? messagePayload[type] : null;
  return {
    // Meta's newer "usernames" feature identifies the sender by a BSUID
    // (from_user_id, e.g. "GH.968770808955253") instead of a phone number
    // (from) when the customer has a WhatsApp username set up. Fall back to
    // it so these conversations aren't silently dropped.
    from: messagePayload.from || messagePayload.from_user_id,
    messageId: messagePayload.id,
    type,
    text: messagePayload.text?.body || "",
    interactive: messagePayload.interactive || null,
    media: raw ? { id: raw.id, caption: raw.caption || "", mimeType: raw.mime_type || "" } : null,
  };
}

/**
 * Extract readable user text from different message types
 */
function extractUserText(type, text, interactive, media) {
  switch (type) {
    case "text":
      return text;
    case "interactive":
      if (interactive?.type === "button_reply") {
        const id = interactive.button_reply?.id;
        if (id === "speak_agent") return "speak to agent";
        if (id === "do_register") return "register";
        if (id === "noop_registered") return null;
        return interactive.button_reply?.title || id;
      }
      if (interactive?.type === "list_reply") {
        return interactive.list_reply?.title || interactive.list_reply?.id;
      }
      return null;
    case "image":
      return media?.caption ? `[Image: ${media.caption}] — can you check if this is genuine or misleading?` : "[User sent an image] — can you check if this is genuine or misleading?";
    case "video":
      return media?.caption ? `[Video: ${media.caption}]` : "[User sent a video]";
    case "document":
      return media?.caption ? `[Document: ${media.caption}]` : "[User sent a document]";
    case "location":
      return "I shared my location";
    default:
      return null;
  }
}

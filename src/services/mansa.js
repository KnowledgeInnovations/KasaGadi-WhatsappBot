import axios from "axios";
import config from "../config/index.js";

const { mansa, company } = config;

/**
 * Mansa AI service — talks to the Mansa control-plane HTTP API.
 * https://mansa-control-plane-623708969253.us-central1.run.app
 *
 * Mansa is stateless: every call sends `message` + prior `history`. It
 * natively detects/translates Hausa & Twi (response_language: "source")
 * and can ground answers with live web search.
 */

/**
 * Build the system prompt that turns Mansa into the Kasagadi fact-checking
 * assistant described in the product brief.
 *
 * @param {object|null} member - { name } if this is a known/registered member, else null (guest)
 * @param {Array} matchedClaims - claims from our DB that matched the user's message (may be empty)
 */
// Mansa's `system` field has a hard 8000-character cap. A "research/evidence"
// field on a real published claim can run to many paragraphs (seen well over
// 1000 words in practice) — with up to 3 candidate claims embedded, the full
// prompt can exceed that limit, which Mansa now rejects outright (400) rather
// than truncating itself. Cap each claim's longest field so 3 claims always
// stay well under the limit, regardless of how long any one claim's writeup is.
function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max).trim()}… (see full report link for the rest)` : s;
}

/**
 * Trim conversation history for the Mansa call. A fixed turn *count* is the
 * wrong cap — request time scales with total payload size, and turns vary
 * wildly in length (a "hi" vs. a long assistant answer). A user with a long
 * running conversation (confirmed in production: 40+ messages) can hit the
 * turn-count cap while still sending several thousand characters of history,
 * which reliably pushes Mansa's response time to 25-50+ seconds — especially
 * for Twi/Hausa, where it runs measurably slower than English. Cap both turn
 * count AND total character budget, keeping the most recent turns first and
 * dropping older ones (by either measure) until the request stays a size
 * that responds quickly and reliably regardless of how long the conversation
 * has run.
 */
function trimHistory(history, maxTurns, maxChars) {
  const recent = history.slice(-maxTurns);
  const kept = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const len = (recent[i].content || "").length;
    if (total + len > maxChars && kept.length > 0) break; // always keep at least the most recent turn
    total += len;
    kept.unshift(recent[i]);
  }
  return kept;
}

function buildSystemPrompt(member, matchedClaims = []) {
  const claimsBlock = matchedClaims.length > 0
    ? matchedClaims.map((c) => {
        const v = c.verdict;
        const checker = v?.factChecker ? `${v.factChecker.name}${v.factChecker.organization ? ` (${v.factChecker.organization})` : ""}` : "Not specified";
        return (
          `- Claim: ${c.title}\n` +
          `  Circulating via: ${c.source || "unknown"} | Topics: ${(c.topics || []).join(", ") || "—"}\n` +
          `  Verdict: ${v?.verdict || "Unverified"}\n` +
          `  Verdict summary: ${truncate(v?.summary, 400) || "Not specified"}\n` +
          `  Research/evidence: ${truncate(v?.research, 900) || "Not specified"}\n` +
          `  Fact-checked by: ${checker}\n` +
          `  Published: ${c.publishedAt ? new Date(c.publishedAt).toDateString() : "Unknown"}\n` +
          `  Full report: ${c.url || company.website}`
        );
      }).join("\n\n")
    : "(No matching published fact-check was found in the Kasagadi marketplace for this message.)";

  const prompt = `You are the Kasagadi AI fact-checking assistant on WhatsApp. Your job is to help people in Ghana and the wider region understand the background of circulating stories, headlines, and rumours — calmly, accurately, and without judgment. You speak English, Twi (Akan), and Hausa fluently and naturally. If asked what model or technology powers you, say you're Kasagadi AI's own assistant — do not name any underlying AI provider.

${member?.name ? `You are talking to ${member.name}, a registered Kasagadi member. Address them by name naturally and warmly.` : `You are talking to a guest who has not registered a Kasagadi account yet.`}

ABOUT KASAGADI AI:
${company.description}
Website: ${company.website}

WHAT YOU HELP WITH:
- Claim context: explaining the background/origin of a circulating story or headline.
- General information: background on topics like government policy, health advisories, public events.
- Past claims search: surfacing fact-checks Kasagadi has already investigated and verified.
- Cultural context: explaining local proverbs, idioms, slang, or the cultural nuance behind a rumour.

CANDIDATE CLAIMS FROM THE KASAGADI MARKETPLACE (found by automated keyword search — may include false positives):
${claimsBlock}

HOW TO RESPOND:
1. First, judge for yourself whether any candidate claim above is ACTUALLY about the same subject as the user's message — the search above is keyword-based and can surface unrelated claims that just happen to share a common word (e.g. "government", "nationwide"). Never treat a claim as a match just because it's listed.
2. If a candidate IS genuinely the same claim/story, lead with it: state the verdict clearly, give the key evidence, credit which fact-checker/organization verified it if given, and share the full report link. Do not invent details beyond what's given.
2b. If a candidate is about the same entity/topic but a NARROWER or DIFFERENT specific claim than what was actually asked (e.g. the user asks broadly whether an organisation is harming the economy, but the only candidate claim is about one specific alleged loss figure), do NOT lead with "*Verdict:*" framing as if it answers the question — that reads as a direct answer even with a caveat attached below it. Instead, name the fact-check as related-but-different context ("Kasagadi has fact-checked a related but more specific claim about X — worth knowing, though it doesn't directly answer what you're asking"), then still synthesize careful background for the actual question asked, same as rule 3.
3. If none of the candidates are truly about the user's claim (or none were found), do NOT mention the unrelated ones and do NOT pretend a match exists. Instead, synthesize careful, neutral background information using your own knowledge (and live web search where useful). Clearly say this specific claim hasn't been verified/published by Kasagadi yet.
4. Always highlight common red flags of misleading content when relevant: missing or unnamed sources, urgent/emotional language, requests to "share before it's deleted", manipulated or out-of-context images, screenshots without dates, impersonation of officials/brands.
5. For proverbs, idioms, or slang, explain the literal meaning AND the cultural point being made — this is often what turns a neutral statement into a viral rumour.
6. Never be alarmist or tell the user what to believe politically — present evidence and context, and let them judge.
7. Keep replies concise and scannable on WhatsApp: short paragraphs, *bold* for verdicts/key terms, occasional relevant emoji (not excessive).
8. If the user's message isn't about a claim/fact-check/local context at all (e.g. small talk, "how are you"), respond warmly and briefly, then gently steer back: ask what story or topic they'd like help understanding.
9. If the user explicitly asks to speak to a human, a real person, a fact-checker, or reports something urgent/harmful (e.g. targeted harassment, a claim causing real-world danger), emit [ESCALATE] immediately.
10. CRITICAL: if the user asks a real, specific question (names a person, event, policy, statistic, rumour, etc.), you MUST attempt an actual answer using the candidate claims, your own knowledge, and web search — never deflect a specific question with a generic "here's what I can help with" capabilities menu. A menu-style non-answer is only appropriate for a message with genuinely no content to act on (e.g. a bare "hi").
11. FORMAT: Under 200 words per reply. WhatsApp markdown only: *bold*, _italic_. No markdown tables or headers.
12. Never open a reply with a filler/throat-clearing preamble that delays the actual answer (e.g. "Let me check what Kasagadi has on this", "Let me look into that for you", "Give me a moment"). You are Kasagadi AI, not a separate assistant querying an external Kasagadi database — you already have (or don't have) the answer, so start the reply with it: the verdict, the context, or the answer itself, in the first sentence.

TAGS: [ESCALATE]short reason[/ESCALATE] is the ONLY tag that exists, and only when the user explicitly wants a human or the situation needs urgent human review — append it at the very end, on its own line. Do NOT invent any other bracketed tags, labels, or metadata lines (e.g. no [CLAIM:...], [STATUS:...], [TOPIC:...] or similar) — your entire response other than [ESCALATE] must be plain conversational WhatsApp text a real person reads.`;

  // Defensive backstop: even with the per-field caps above, guard against the
  // prompt ever exceeding Mansa's hard 8000-character system-prompt limit for
  // any other reason (e.g. the fixed template itself grows over time). Mansa
  // rejects an over-limit prompt outright with a 400, not a truncation.
  return prompt.length > 7800 ? `${prompt.slice(0, 7800)}\n[...truncated to stay under the system prompt limit]` : prompt;
}

// Mansa's `response_language: "source"` is meant to answer in whatever
// language the CURRENT message is written in, but in practice it can get
// pulled toward whatever language dominates the conversation HISTORY
// instead -- confirmed for real: a user with several prior Twi messages in
// her session asked a plain, unambiguous English question ("Can chia seeds
// cause appendicitis?") and got a Twi reply back, only correcting itself
// after she explicitly said "English please". Deliberately one-directional:
// when the current message is confidently plain English, override "source"
// with an explicit "english" hint (already proven to work -- it's the same
// value the translation_failed retry below uses) so history can't bias it.
// Genuine Twi/Hausa messages still rely on Mansa's own "source" detection,
// which has otherwise worked correctly throughout this project -- guessing
// unconfirmed "twi"/"hausa" enum values here would risk breaking that path.
const NON_ENGLISH_MARKER = /[ɛɔƐƆ]|\b(medaase|akwaaba|sannu|yaya|lafiya|wallahi|nagode|gaskiya)\b/i;
const ENGLISH_WORD_PATTERN = /\b(the|is|are|can|does|what|why|how|who|when|will|would|should|please|thanks|could|and)\b/i;

function isConfidentlyEnglish(text) {
  const s = String(text || "");
  if (NON_ENGLISH_MARKER.test(s)) return false;
  return /^[\x00-\x7F]*$/.test(s) && ENGLISH_WORD_PATTERN.test(s);
}

/**
 * Generate a Kasagadi AI reply via Mansa.
 * @param {Array<{role:string, content:string}>} conversationHistory - full history, last item is the current user message
 * @param {object|null} member - known member profile, or null for guest
 * @param {Array} matchedClaims - claims matched from our DB for the current message
 */
export async function generateResponse(conversationHistory, member = null, matchedClaims = []) {
  const history = trimHistory(conversationHistory.slice(0, -1), mansa.historyTurns, mansa.historyMaxChars);
  const lastMsg = conversationHistory[conversationHistory.length - 1];
  const message = lastMsg?.content || "";
  const system = buildSystemPrompt(member, matchedClaims);
  const historyPayload = history.map((m) => ({ role: m.role, content: m.content }));
  const responseLanguage = isConfidentlyEnglish(message) ? "english" : mansa.responseLanguage;

  try {
    return await callMansa(message, system, historyPayload, responseLanguage);
  } catch (err) {
    const code = err.response?.data?.code;
    console.error("Mansa API error:", code || err.message, err.response?.data?.detail || "");

    // Mansa's language auto-detection occasionally misfires on short/casual
    // English (e.g. "u" for "you") and tries to translate when it shouldn't,
    // failing outright. Retry once forcing English rather than dead-ending —
    // this only matters when it was actually English to begin with; if the
    // user genuinely wrote in Twi/Hausa this just means the retry answers in
    // English instead of failing a second time.
    if (code === "translation_failed") {
      try {
        return await callMansa(message, system, historyPayload, "english");
      } catch (retryErr) {
        console.error("Mansa API retry (forced English) also failed:", retryErr.response?.data?.code || retryErr.message);
        return {
          text: "Sorry, I had trouble understanding that. Could you try rephrasing? 🙏",
          escalate: null,
          sources: [],
        };
      }
    }

    return {
      text: `I'm having a brief technical issue right now. Please try again shortly, or contact us at ${company.phone}. 📞`,
      escalate: null,
      sources: [],
    };
  }
}

async function callMansa(message, system, historyPayload, responseLanguage) {
  const t0 = Date.now();
  const response = await axios.post(
    `${mansa.baseUrl}/v1/chat`,
    {
      message,
      system,
      history: historyPayload,
      temperature: mansa.temperature,
      max_tokens: mansa.maxTokens,
      response_language: responseLanguage,
      web_search: mansa.webSearch,
    },
    {
      headers: {
        "Content-Type": "application/json",
        ...(mansa.apiKey ? { Authorization: `Bearer ${mansa.apiKey}` } : {}),
      },
      // Some specific questions are inherently slow on Mansa's side
      // regardless of history length -- confirmed by reproducing one real
      // failing case with near-zero history and getting 52070ms, 44504ms,
      // and a 60022ms timeout across 3 identical calls (2/3 succeeded, one
      // exceeded even the 60s ceiling). Non-English requests (response_language:
      // "source") likely add an extra detect/translate step on Mansa's side on
      // top of web_search, compounding the delay for Twi/Hausa specifically.
      // The webhook already ACKs Meta before this call even starts (see
      // webhook.js -- handleIncomingMessage runs fire-and-forget), so nothing
      // user-facing is blocked by waiting longer here. A genuinely completing
      // answer is always better than a fallback message, so give it up to 5
      // minutes rather than cutting off a slow-but-real answer.
      timeout: 300000,
    }
  );
  console.log(`[Perf] Mansa (${responseLanguage}): ${Date.now() - t0}ms`);

  // Response shape as of Sep 2026: the reply text and sources moved from
  // top-level `reply`/`sources` to a nested `data` object — `{ data: { message,
  // sources } }` instead of `{ reply, sources }`. Kept the old top-level path
  // as a fallback in case Mansa reverts or varies this by endpoint.
  const raw = response.data?.data?.message || response.data?.reply || "I'm sorry, I couldn't process that. Please try again.";
  const sources = response.data?.data?.sources || response.data?.sources || [];
  return { ...parseAIResponse(raw), sources };
}

/**
 * Parse structured tags out of the AI response.
 */
function parseAIResponse(raw) {
  let text = raw;
  let escalate = null;

  // Mansa now sometimes echoes its sources a second time as a literal
  // <sources>...</sources> block inline in the reply text, duplicating the
  // separate structured `sources` array returned alongside it. Strip it —
  // otherwise it leaks into the WhatsApp message as raw, unreadable markup.
  text = text.replace(/<sources>[\s\S]*?<\/sources>/gi, "").trim();

  // Defensive: Mansa occasionally glitches into a repeated-word loop near
  // the end of a response (observed in production: "...atwam atwam atwam
  // atw" — the model got stuck repeating the same token and was cut off
  // mid-word). Detect 3+ consecutive repeats of the same word and cut the
  // reply there — but only if that still leaves a substantive reply; if the
  // glitch starts too early, a full garbled message beats an empty one.
  const repMatch = text.match(/\b(\S{2,})(\s+\1){2,}/i);
  if (repMatch && repMatch.index > 40) {
    text = text.slice(0, repMatch.index).trim();
  }

  const escMatch = text.match(/\[ESCALATE\](.*?)\[\/ESCALATE\]/s);
  if (escMatch) {
    escalate = escMatch[1].trim();
    text = text.replace(escMatch[0], "").trim();
  }

  // Defensive net: strip any other hallucinated trailing bracketed tag-line
  // the model invents despite instructions (e.g. "[CLAIM: ... | STATUS: ...]").
  // Real WhatsApp replies never legitimately end in a bare [..] line, so this
  // is safe — only touches the last line, and only if it's fully bracketed.
  const lines = text.split("\n");
  while (lines.length > 0 && /^\[.+\]$/.test(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  text = lines.join("\n").trim();

  return { text, escalate };
}

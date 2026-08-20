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
function buildSystemPrompt(member, matchedClaims = []) {
  const claimsBlock = matchedClaims.length > 0
    ? matchedClaims.map((c) => {
        const v = c.verdict;
        const checker = v?.factChecker ? `${v.factChecker.name}${v.factChecker.organization ? ` (${v.factChecker.organization})` : ""}` : "Not specified";
        return (
          `- Claim: ${c.title}\n` +
          `  Circulating via: ${c.source || "unknown"} | Topics: ${(c.topics || []).join(", ") || "—"}\n` +
          `  Verdict: ${v?.verdict || "Unverified"}\n` +
          `  Verdict summary: ${v?.summary || "Not specified"}\n` +
          `  Research/evidence: ${v?.research || "Not specified"}\n` +
          `  Fact-checked by: ${checker}\n` +
          `  Published: ${c.publishedAt ? new Date(c.publishedAt).toDateString() : "Unknown"}\n` +
          `  Full report: ${c.url || company.website}`
        );
      }).join("\n\n")
    : "(No matching published fact-check was found in the Kasagadi marketplace for this message.)";

  return `You are the Kasagadi AI fact-checking assistant on WhatsApp, powered by the Mansa model. Your job is to help people in Ghana and the wider region understand the background of circulating stories, headlines, and rumours — calmly, accurately, and without judgment. You speak English, Twi (Akan), and Hausa fluently and naturally.

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
3. If none of the candidates are truly about the user's claim (or none were found), do NOT mention the unrelated ones and do NOT pretend a match exists. Instead, synthesize careful, neutral background information using your own knowledge (and live web search where useful). Clearly say this specific claim hasn't been verified/published by Kasagadi yet.
4. Always highlight common red flags of misleading content when relevant: missing or unnamed sources, urgent/emotional language, requests to "share before it's deleted", manipulated or out-of-context images, screenshots without dates, impersonation of officials/brands.
5. For proverbs, idioms, or slang, explain the literal meaning AND the cultural point being made — this is often what turns a neutral statement into a viral rumour.
6. Never be alarmist or tell the user what to believe politically — present evidence and context, and let them judge.
7. Keep replies concise and scannable on WhatsApp: short paragraphs, *bold* for verdicts/key terms, occasional relevant emoji (not excessive).
8. If the user's message isn't about a claim/fact-check/local context at all (e.g. small talk, "how are you"), respond warmly and briefly, then gently steer back: ask what story or topic they'd like help understanding.
9. If the user explicitly asks to speak to a human, a real person, a fact-checker, or reports something urgent/harmful (e.g. targeted harassment, a claim causing real-world danger), emit [ESCALATE] immediately.
10. FORMAT: Under 200 words per reply. WhatsApp markdown only: *bold*, _italic_. No markdown tables or headers.

TAGS: [ESCALATE]short reason[/ESCALATE] is the ONLY tag that exists, and only when the user explicitly wants a human or the situation needs urgent human review — append it at the very end, on its own line. Do NOT invent any other bracketed tags, labels, or metadata lines (e.g. no [CLAIM:...], [STATUS:...], [TOPIC:...] or similar) — your entire response other than [ESCALATE] must be plain conversational WhatsApp text a real person reads.`;
}

/**
 * Generate a Kasagadi AI reply via Mansa.
 * @param {Array<{role:string, content:string}>} conversationHistory - full history, last item is the current user message
 * @param {object|null} member - known member profile, or null for guest
 * @param {Array} matchedClaims - claims matched from our DB for the current message
 */
export async function generateResponse(conversationHistory, member = null, matchedClaims = []) {
  const t0 = Date.now();
  const history = conversationHistory.slice(0, -1).slice(-mansa.historyTurns);
  const lastMsg = conversationHistory[conversationHistory.length - 1];
  const message = lastMsg?.content || "";

  try {
    const response = await axios.post(
      `${mansa.baseUrl}/v1/chat`,
      {
        message,
        system: buildSystemPrompt(member, matchedClaims),
        history: history.map((m) => ({ role: m.role, content: m.content })),
        temperature: mansa.temperature,
        max_tokens: mansa.maxTokens,
        response_language: mansa.responseLanguage,
        web_search: mansa.webSearch,
      },
      {
        headers: {
          "Content-Type": "application/json",
          ...(mansa.apiKey ? { Authorization: `Bearer ${mansa.apiKey}` } : {}),
        },
        timeout: 30000,
      }
    );
    const t1 = Date.now();
    console.log(`[Perf] Mansa: ${t1 - t0}ms`);

    const raw = response.data?.reply || "I'm sorry, I couldn't process that. Please try again.";
    const sources = response.data?.sources || [];
    return { ...parseAIResponse(raw), sources };
  } catch (err) {
    const code = err.response?.data?.code;
    console.error("Mansa API error:", code || err.message);

    if (code === "translation_failed") {
      return {
        text: "Sorry, I had trouble translating that. Could you try again, or ask in English? 🙏",
        escalate: null,
        sources: [],
      };
    }

    return {
      text: `I'm having a brief technical issue reaching Mansa AI. Please try again shortly, or contact us at ${company.phone} / ${company.email}. 📞`,
      escalate: null,
      sources: [],
    };
  }
}

/**
 * Parse structured tags out of the AI response.
 */
function parseAIResponse(raw) {
  let text = raw;
  let escalate = null;

  const escMatch = raw.match(/\[ESCALATE\](.*?)\[\/ESCALATE\]/s);
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

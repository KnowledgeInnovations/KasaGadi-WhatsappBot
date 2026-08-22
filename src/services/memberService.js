import { v4 as uuidv4 } from "uuid";
import { isDBConnected } from "../db/connection.js";
import MemberModel from "../db/models/Member.js";

/**
 * Member service — links a WhatsApp phone number to a registered Kasagadi
 * identity, so returning/known users get greeted by name (brief: Path A/B).
 *
 * Today there's no live kasagadi.ai account system to sync against, so
 * registration happens either:
 *   1. In-chat — the user types "register"/"create account" and gives a name.
 *   2. Via a personalised link — see buildPersonalizedLink() — once kasagadi.ai
 *      adds a "Chat on WhatsApp" dashboard button, it can link here with
 *      ?ref=<memberId> and the bot will greet that member by name from message one.
 */

export async function findMemberByPhone(phone) {
  if (!isDBConnected()) return null;
  try {
    return await MemberModel.findOne({ phone }).lean();
  } catch (err) {
    console.error("[Member] findByPhone failed:", err.message);
    return null;
  }
}

export async function findMemberById(memberId) {
  if (!isDBConnected()) return null;
  try {
    return await MemberModel.findOne({ memberId }).lean();
  } catch (err) {
    console.error("[Member] findById failed:", err.message);
    return null;
  }
}

export async function registerMember({ phone, name, email = "", source = "whatsapp" }) {
  if (!isDBConnected()) return null;
  try {
    const existing = await MemberModel.findOne({ phone });
    if (existing) {
      existing.name = name || existing.name;
      if (email) existing.email = email;
      existing.lastActiveAt = new Date();
      await existing.save();
      return existing.toObject();
    }
    const member = new MemberModel({
      memberId: uuidv4(),
      phone,
      name,
      email,
      source,
      registeredAt: new Date(),
      lastActiveAt: new Date(),
    });
    await member.save();
    console.log(`[Member] Registered new member ${member.memberId} (${name}, ${phone})`);
    return member.toObject();
  } catch (err) {
    // Race: two requests for the same phone (duplicate webhook delivery, a
    // retry) can both pass the findOne check above before either saves —
    // the second hits the unique index on `phone` and lands here. Rather
    // than fail (which previously surfaced a misleading "database offline"
    // message to the user even though a member record now exists), treat
    // it as success: fetch whichever record won the race and use that.
    if (err.code === 11000) {
      console.warn(`[Member] Registration race on ${phone} — another request won, fetching its record`);
      const winner = await MemberModel.findOne({ phone }).lean();
      if (winner) return winner;
    }
    console.error("[Member] register failed:", err.message);
    return null;
  }
}

export async function touchMember(phone) {
  if (!isDBConnected()) return;
  try {
    await MemberModel.updateOne({ phone }, { lastActiveAt: new Date() });
  } catch {
    // non-fatal
  }
}

export async function getAllMembers() {
  if (!isDBConnected()) return [];
  try {
    return await MemberModel.find({}).sort({ registeredAt: -1 }).lean();
  } catch (err) {
    console.error("[Member] getAllMembers failed:", err.message);
    return [];
  }
}

export async function deleteMember(memberId) {
  const result = await MemberModel.deleteOne({ memberId });
  return result.deletedCount > 0;
}

/**
 * Build the deep-link kasagadi.ai's dashboard "Chat on WhatsApp" button should
 * use for a given member — opens WhatsApp with a hidden ref token in the
 * pre-filled message so the bot can identify the member on their very first
 * message, even if they've never messaged the bot from this number before.
 */
export function buildPersonalizedLink(member, whatsappNumber) {
  const prefill = `Hi, I'm ${member.name} from my Kasagadi dashboard. [ref:${member.memberId}]`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(prefill)}`;
}

/**
 * Parse a hidden "[ref:<memberId>]" token out of an incoming message, if present.
 * Returns { memberId, cleanText } — cleanText has the token stripped for display.
 */
export function extractRefToken(text) {
  const match = /\[ref:([a-zA-Z0-9-]+)\]/.exec(text || "");
  if (!match) return { memberId: null, cleanText: text };
  return { memberId: match[1], cleanText: text.replace(match[0], "").trim() };
}

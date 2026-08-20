import mongoose from "mongoose";

/**
 * A registered Kasagadi member — created either via the (future) kasagadi.ai
 * dashboard or by a WhatsApp user explicitly registering via the bot.
 * Phone number is the primary link between a WhatsApp conversation and an account.
 */
const memberSchema = new mongoose.Schema({
  memberId:     { type: String, required: true, unique: true, index: true },
  name:         { type: String, required: true },
  phone:        { type: String, required: true, unique: true, index: true }, // WhatsApp-format digits, no "+"
  email:        { type: String, default: "" },
  preferredLanguage: { type: String, default: "" }, // English | Twi | Hausa — inferred or self-reported
  source:       { type: String, default: "whatsapp" }, // "whatsapp" | "dashboard"
  registeredAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

export default mongoose.model("Member", memberSchema);

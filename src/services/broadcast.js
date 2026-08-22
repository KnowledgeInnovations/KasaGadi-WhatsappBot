import { sendTextMessage, sendTemplateMessage } from "./whatsapp.js";
import Broadcast from "../db/models/Broadcast.js";
import { v4 as uuidv4 } from "uuid";

const BATCH_SIZE = 20; // Send in batches to respect WhatsApp rate limits
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches

/**
 * Personalise a broadcast message for a single recipient.
 * Replaces {name} / {first_name} placeholders with the lead's name.
 */
export function personalizeMessage(message, name = "") {
  const clean = (name || "").trim();
  const first = clean.split(/\s+/)[0] || "there";
  return String(message)
    .replace(/\{first[_\s]?name\}/gi, first)
    .replace(/\{name\}/gi, clean || first);
}

/**
 * Send a broadcast message to multiple recipients.
 * @param {(string|{phone:string,name?:string})[]} recipients - Phone numbers (with country
 *        code, e.g. "+233123456789") or objects { phone, name } for {name} personalisation.
 * @param {string} message - Message text (supports {name} / {first_name} placeholders)
 * @param {Object} options - Optional: { templateName, templateLanguage, components, batchSize, delayMs }
 * @returns {Promise} - { totalSent, failed, status }
 */
export async function broadcastMessage(recipients, message, options = {}) {
  const {
    templateName = null,
    templateLanguage = "en_US",
    components = [],
    batchSize = BATCH_SIZE,
    delayMs = DELAY_BETWEEN_BATCHES,
  } = options;

  // Normalise recipients to { phone, name } — accept plain strings too
  const normalized = (recipients || []).map((r) =>
    typeof r === "string" ? { phone: r, name: "" } : { phone: r?.phone, name: r?.name || "" }
  );

  const results = {
    totalRequested: normalized.length,
    totalSent: 0,
    failed: 0,
    failedNumbers: [],
    startTime: new Date(),
    endTime: null,
    logs: [],
  };

  // Validate phone numbers
  const validRecipients = normalized.filter((r) => {
    const num = r.phone;
    if (!num || typeof num !== "string") {
      results.failedNumbers.push({ number: num, reason: "Invalid format" });
      results.failed++;
      return false;
    }
    // Check if it starts with +
    if (!num.startsWith("+")) {
      results.failedNumbers.push({ number: num, reason: "Missing country code (+)" });
      results.failed++;
      return false;
    }
    return true;
  });

  console.log(`[Broadcast] Starting broadcast to ${validRecipients.length} valid numbers (${results.failed} invalid)`);

  // Process in batches
  for (let i = 0; i < validRecipients.length; i += batchSize) {
    const batch = validRecipients.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(validRecipients.length / batchSize);

    console.log(`[Broadcast] Batch ${batchNumber}/${totalBatches} - Sending to ${batch.length} numbers`);

    // Send all in batch in parallel
    const promises = batch.map(({ phone: phoneNumber, name }) =>
      (async () => {
        try {
          if (templateName) {
            await sendTemplateMessage(phoneNumber, templateName, templateLanguage, components);
          } else {
            await sendTextMessage(phoneNumber, personalizeMessage(message, name));
          }
          results.totalSent++;
          results.logs.push({
            number: phoneNumber,
            status: "sent",
            timestamp: new Date(),
          });
        } catch (err) {
          results.failed++;
          results.failedNumbers.push({ number: phoneNumber, reason: err.message });
          results.logs.push({
            number: phoneNumber,
            status: "failed",
            error: err.message,
            timestamp: new Date(),
          });
          console.error(`[Broadcast] Failed to send to ${phoneNumber}: ${err.message}`);
        }
      })()
    );

    await Promise.all(promises);

    // Wait before next batch
    if (i + batchSize < validRecipients.length) {
      console.log(`[Broadcast] Waiting ${delayMs}ms before next batch...`);
      await sleep(delayMs);
    }
  }

  results.endTime = new Date();
  const duration = (results.endTime - results.startTime) / 1000;

  console.log(`[Broadcast] Complete! Sent: ${results.totalSent}, Failed: ${results.failed}, Duration: ${duration}s`);

  return results;
}

/**
 * Parse agent phone numbers from Excel data (JSON arrays or objects)
 * @param {Array} data - Array of objects with phone number field
 * @param {string} phoneFieldName - Field name containing phone (default: "phone" or "phone_number")
 * @returns {string[]} - Array of valid phone numbers
 */
export function parsePhoneNumbers(data, phoneFieldName = null) {
  if (!Array.isArray(data)) {
    throw new Error("Data must be an array");
  }

  // Auto-detect phone field if not provided
  let fieldName = phoneFieldName;
  if (!fieldName && data.length > 0) {
    const firstRecord = data[0];
    fieldName =
      Object.keys(firstRecord).find(
        (key) =>
          key.toLowerCase().includes("phone") ||
          key.toLowerCase().includes("whatsapp") ||
          key.toLowerCase().includes("mobile")
      ) || null;
  }

  if (!fieldName) {
    throw new Error("Could not auto-detect phone field. Provide phoneFieldName parameter.");
  }

  const numbers = [];
  data.forEach((record, index) => {
    let phone = record[fieldName];

    if (!phone) {
      console.warn(`Row ${index + 1}: Missing phone number`);
      return;
    }

    // Clean and format phone number
    phone = String(phone).trim();

    // Add country code if missing
    if (!phone.startsWith("+")) {
      // Assume Ghana by default (+233)
      phone = "+233" + phone.replace(/^0/, ""); // Replace leading 0 with +233
    }

    numbers.push(phone);
  });

  return numbers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== DRAFT MANAGEMENT ==========

/**
 * Save a message as a draft
 * @param {string} title - Draft title
 * @param {string} message - Message content
 * @returns {Promise} - Saved draft
 */
export async function saveDraft(title, message) {
  try {
    const draft = new Broadcast({
      draftId: uuidv4(),
      isDraft: true,
      title,
      message,
      savedBy: "admin",
    });
    await draft.save();
    console.log(`[Broadcast] Draft saved: ${draft.draftId}`);
    return draft;
  } catch (err) {
    console.error(`[Broadcast] Failed to save draft:`, err.message);
    throw err;
  }
}

/**
 * Get all drafts
 * @returns {Promise} - Array of drafts
 */
export async function getAllDrafts() {
  try {
    const drafts = await Broadcast.find({ isDraft: true })
      .sort({ createdAt: -1 })
      .select("draftId title message createdAt updatedAt");
    return drafts;
  } catch (err) {
    console.error(`[Broadcast] Failed to get drafts:`, err.message);
    throw err;
  }
}

/**
 * Get a specific draft
 * @param {string} draftId - Draft ID
 * @returns {Promise} - Draft document
 */
export async function getDraft(draftId) {
  try {
    const draft = await Broadcast.findOne({ draftId, isDraft: true });
    if (!draft) throw new Error("Draft not found");
    return draft;
  } catch (err) {
    console.error(`[Broadcast] Failed to get draft:`, err.message);
    throw err;
  }
}

/**
 * Update a draft
 * @param {string} draftId - Draft ID
 * @param {Object} updates - Fields to update (title, message)
 * @returns {Promise} - Updated draft
 */
export async function updateDraft(draftId, updates) {
  try {
    const draft = await Broadcast.findOneAndUpdate(
      { draftId, isDraft: true },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!draft) throw new Error("Draft not found");
    console.log(`[Broadcast] Draft updated: ${draftId}`);
    return draft;
  } catch (err) {
    console.error(`[Broadcast] Failed to update draft:`, err.message);
    throw err;
  }
}

/**
 * Delete a draft
 * @param {string} draftId - Draft ID
 * @returns {Promise} - Success status
 */
export async function deleteDraft(draftId) {
  try {
    const result = await Broadcast.deleteOne({ draftId, isDraft: true });
    if (result.deletedCount === 0) throw new Error("Draft not found");
    console.log(`[Broadcast] Draft deleted: ${draftId}`);
    return { success: true };
  } catch (err) {
    console.error(`[Broadcast] Failed to delete draft:`, err.message);
    throw err;
  }
}

// ========== BROADCAST RESULTS STORAGE ==========

/**
 * Save broadcast results to database
 * @param {Object} broadcastData - Results from broadcastMessage() + metadata
 * @returns {Promise} - Saved broadcast document
 */
export async function saveBroadcastResult(broadcastData) {
  try {
    const result = new Broadcast({
      broadcastId: uuidv4(),
      isDraft: false,
      title: broadcastData.title || "Broadcast " + new Date().toLocaleString(),
      message: broadcastData.message,
      phoneNumbers: broadcastData.phoneNumbers || [],
      totalRequested: broadcastData.totalRequested,
      totalSent: broadcastData.totalSent,
      totalFailed: broadcastData.failed,
      failedNumbers: broadcastData.failedNumbers || [],
      successNumbers: (broadcastData.phoneNumbers || []).filter(
        (num) => !broadcastData.failedNumbers?.some((f) => f.number === num)
      ),
      sentAt: new Date(),
      durationSeconds: broadcastData.durationSeconds || 0,
      filename: broadcastData.filename,
      notes: broadcastData.notes,
    });
    await result.save();
    console.log(`[Broadcast] Result saved: ${result.broadcastId}`);
    return result;
  } catch (err) {
    const detail = err.errors
      ? Object.entries(err.errors).map(([k, v]) => `${k}: ${v.message}`).join(", ")
      : err.message;
    console.error(`[Broadcast] Failed to save result:`, detail);
    throw err;
  }
}

/**
 * Get all broadcast results (sent broadcasts, not drafts)
 * @param {Object} options - Query options (limit, skip)
 * @returns {Promise} - Array of broadcasts
 */
export async function getBroadcastResults(options = {}) {
  try {
    const { limit = 50, skip = 0 } = options;
    const results = await Broadcast.find({ isDraft: false })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "broadcastId title message sentAt totalRequested totalSent totalFailed phoneNumbers successNumbers failedNumbers durationSeconds filename"
      );
    const total = await Broadcast.countDocuments({ isDraft: false });
    return { results, total };
  } catch (err) {
    console.error(`[Broadcast] Failed to get results:`, err.message);
    throw err;
  }
}

/**
 * Get a specific broadcast result
 * @param {string} broadcastId - Broadcast ID
 * @returns {Promise} - Broadcast document
 */
export async function getBroadcastResult(broadcastId) {
  try {
    const result = await Broadcast.findOne({ broadcastId, isDraft: false });
    if (!result) throw new Error("Broadcast not found");
    return result;
  } catch (err) {
    console.error(`[Broadcast] Failed to get broadcast:`, err.message);
    throw err;
  }
}

/**
 * Export broadcast results as CSV
 * @param {string} broadcastId - Broadcast ID
 * @returns {string} - CSV data
 */
export function exportBroadcastResultAsCSV(broadcast) {
  let csv = "Phone Number,Status\n";

  // Add successful numbers
  (broadcast.successNumbers || []).forEach((num) => {
    csv += `"${num}",Sent\n`;
  });

  // Add failed numbers with reasons
  (broadcast.failedNumbers || []).forEach((item) => {
    csv += `"${item.number}",Failed: ${item.reason}\n`;
  });

  return csv;
}

/**
 * Export multiple broadcasts as CSV summary
 * @param {Array} broadcasts - Array of broadcast documents
 * @returns {string} - CSV data
 */
export function exportBroadcastSummaryAsCSV(broadcasts) {
  let csv = "Broadcast Date,Title,Message,Total Requested,Sent,Failed,Success Rate,Duration (s)\n";

  broadcasts.forEach((b) => {
    const successRate = b.totalRequested > 0 ? ((b.totalSent / b.totalRequested) * 100).toFixed(1) : "0";
    const message = (b.message || "").replace(/"/g, '""').substring(0, 100);
    csv += `"${new Date(b.sentAt).toLocaleString()}","${b.title}","${message}",${b.totalRequested},${b.totalSent},${b.totalFailed},${successRate}%,${b.durationSeconds || 0}\n`;
  });

  return csv;
}

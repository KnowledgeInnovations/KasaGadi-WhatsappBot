import axios from "axios";
import config from "../config/index.js";

const { whatsapp } = config;

/**
 * Send a plain text message via WhatsApp Business API
 */
export async function sendTextMessage(to, text) {
  return sendMessage(to, { type: "text", text: { body: text } });
}

/**
 * Send a template message (can reach any number, no 24-hour window needed)
 */
export async function sendTemplateMessage(to, templateName = "hello_world", languageCode = "en_US", components = []) {
  const payload = {
    messaging_product: "whatsapp",
    // See isBsuid()/sendMessage() below — a BSUID recipient must use
    // "recipient", not "to", or Meta rejects the send.
    ...(isBsuid(to) ? { recipient: to } : { to }),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };
  if (components.length > 0) {
    payload.template.components = components;
  }
  try {
    const response = await axios.post(
      `${whatsapp.baseUrl}/messages`,
      payload,
      { headers: getHeaders(), timeout: 10000 }
    );
    return response.data;
  } catch (err) {
    const apiErr = err.response?.data?.error;
    const detail = apiErr
      ? `WhatsApp error ${apiErr.code || err.response.status}: ${apiErr.message || JSON.stringify(apiErr)}`
      : `HTTP ${err.response?.status || "?"}: ${err.message}`;
    console.error("Template send failed:", err.response?.data || err.message);
    throw new Error(detail);
  }
}

/**
 * Send an image message
 */
export async function sendImageMessage(to, imageUrl, caption = "") {
  return sendMessage(to, {
    type: "image",
    image: { link: imageUrl, caption },
  });
}

/**
 * Send a video message
 */
export async function sendVideoMessage(to, videoUrl, caption = "") {
  return sendMessage(to, {
    type: "video",
    video: { link: videoUrl, caption },
  });
}

/**
 * Send a document message
 */
export async function sendDocumentMessage(to, documentUrl, filename, caption = "") {
  return sendMessage(to, {
    type: "document",
    document: { link: documentUrl, filename, caption },
  });
}

/**
 * Send interactive buttons (up to 3)
 */
export async function sendButtonMessage(to, bodyText, buttons, headerText = "", footerText = "") {
  const action = {
    buttons: buttons.map((btn, i) => ({
      type: "reply",
      reply: { id: btn.id || `btn_${i}`, title: btn.title.slice(0, 20) },
    })),
  };

  const interactive = { type: "button", body: { text: bodyText }, action };
  if (headerText) interactive.header = { type: "text", text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  return sendMessage(to, { type: "interactive", interactive });
}

/**
 * Send interactive list message
 */
export async function sendListMessage(to, bodyText, buttonText, sections, headerText = "", footerText = "") {
  const interactive = {
    type: "list",
    body: { text: bodyText },
    action: { button: buttonText, sections },
  };
  if (headerText) interactive.header = { type: "text", text: headerText };
  if (footerText) interactive.footer = { text: footerText };

  return sendMessage(to, { type: "interactive", interactive });
}

/**
 * Get the temporary download URL for a WhatsApp media object.
 * Returns a URL valid for ~5 minutes; must be downloaded promptly.
 */
export async function getMediaUrl(mediaId) {
  const response = await axios.get(
    `https://graph.facebook.com/${whatsapp.apiVersion}/${mediaId}`,
    { headers: getHeaders(), timeout: 10000 }
  );
  return response.data.url;
}

/**
 * Download WhatsApp media bytes and return { base64, mimeType }.
 * The Authorization header is required — Meta blocks anonymous downloads.
 */
export async function downloadMediaAsBase64(mediaUrl) {
  const response = await axios.get(mediaUrl, {
    headers: getHeaders(),
    responseType: "arraybuffer",
    timeout: 30000,
  });
  const base64 = Buffer.from(response.data).toString("base64");
  const mimeType = response.headers["content-type"] || "image/jpeg";
  return { base64, mimeType };
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId) {
  try {
    await axios.post(
      `${whatsapp.baseUrl}/messages`,
      { messaging_product: "whatsapp", status: "read", message_id: messageId },
      { headers: getHeaders() }
    );
  } catch (err) {
    console.error("Failed to mark as read:", err.response?.data || err.message);
  }
}

/**
 * True for a business-scoped user ID (BSUID) — Meta's opaque identifier for
 * a sender who has hidden their phone number behind a WhatsApp username
 * (e.g. "GH.4287898731522060"), received as `from_user_id` in the webhook
 * (see normalizePayload() in messageHandler.js). Real phone numbers in this
 * codebase are always normalized to bare digit strings, so any non-digit
 * character reliably means "not a phone number".
 */
export function isBsuid(id) {
  return !/^\d+$/.test(String(id || ""));
}

/**
 * Core message sender with retry logic.
 *
 * Meta's outbound "to" field requires an actual phone number — sending to a
 * BSUID there fails silently from the user's perspective (Meta rejects the
 * request, we log it, but the user never receives a reply). BSUID recipients
 * must instead use the separate "recipient" field. Without this, EVERY user
 * who has hidden their phone number via WhatsApp's username feature would
 * never get any reply from the bot at all, no matter what they send.
 */
async function sendMessage(to, messagePayload, retries = 2) {
  const payload = isBsuid(to)
    ? { messaging_product: "whatsapp", recipient: to, ...messagePayload }
    : { messaging_product: "whatsapp", to, ...messagePayload };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        `${whatsapp.baseUrl}/messages`,
        payload,
        { headers: getHeaders(), timeout: 10000 }
      );
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      if (attempt < retries && status && status >= 500) {
        await sleep(1000 * (attempt + 1)); // exponential back-off
        continue;
      }
      const apiErr = err.response?.data?.error;
      const detail = apiErr
        ? `WhatsApp error ${apiErr.code || err.response.status}: ${apiErr.message || JSON.stringify(apiErr)}`
        : `HTTP ${err.response?.status || "?"}: ${err.message}`;
      console.error(`WhatsApp send failed (attempt ${attempt + 1}):`, err.response?.data || err.message);
      throw new Error(detail);
    }
  }
}

function getHeaders() {
  return {
    Authorization: `Bearer ${whatsapp.accessToken}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

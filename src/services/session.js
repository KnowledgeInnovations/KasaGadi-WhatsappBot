import config from "../config/index.js";
import { isDBConnected } from "../db/connection.js";
import SessionModel from "../db/models/Session.js";

/**
 * Session service — MongoDB-backed with in-memory fallback.
 *
 * The in-memory cache keeps hot sessions for fast access.
 * MongoDB provides persistence across server restarts.
 */

const cache = new Map(); // userId -> session (in-memory hot cache)

// ───────── Core API ─────────

export async function getSession(userId) {
  // Check cache first
  let session = cache.get(userId);

  if (session) {
    const elapsed = (Date.now() - session.lastActivity) / 1000 / 60;
    if (elapsed > config.session.ttlMinutes) {
      cache.delete(userId);
      return await resetSession(userId, session);
    }
    session.lastActivity = Date.now();
    return session;
  }

  // Try loading from MongoDB
  if (isDBConnected()) {
    try {
      const doc = await SessionModel.findOne({ userId }).lean();
      if (doc) {
        session = docToSession(doc);
        const elapsed = (Date.now() - session.lastActivity) / 1000 / 60;
        if (elapsed > config.session.ttlMinutes) {
          return await resetSession(userId, session);
        }
        session.lastActivity = Date.now();
        cache.set(userId, session);
        return session;
      }
    } catch (err) {
      console.error("[Session] DB load failed:", err.message);
    }
  }

  return await createSession(userId);
}

/**
 * Read-only session retrieval for dashboard/admin — no TTL enforcement,
 * no session reset. Returns null if session doesn't exist.
 */
export async function getSessionReadOnly(userId) {
  const cached = cache.get(userId);
  if (cached) return cached;

  if (isDBConnected()) {
    try {
      const doc = await SessionModel.findOne({ userId }).lean();
      if (doc) return docToSession(doc);
    } catch (err) {
      console.error("[Session] DB readOnly load failed:", err.message);
    }
  }

  return null;
}

export async function createSession(userId) {
  const session = {
    userId,
    history: [],
    state: "GREETING",
    profile: {
      name: null,
      email: null,
      phone: userId,
      registered: false,
      memberId: null,
    },
    lastActivity: Date.now(),
    // sessionStartedAt marks the boundary the message handler uses to decide
    // which history entries are "this conversation" vs. old, stale context —
    // see the identical note in resetSession() below.
    metadata: { sessionStartedAt: Date.now() },
  };
  cache.set(userId, session);
  await persistSession(session);
  return session;
}

/**
 * Reset a session after TTL expiry — clears conversation state but PRESERVES
 * the full message history in MongoDB for dashboard/audit purposes (nothing
 * is deleted). Known users (name already captured) resume as ACTIVE — no
 * re-onboarding.
 *
 * Critically, this stamps a fresh `sessionStartedAt`. The message handler
 * only feeds Mansa the history from this timestamp onward — otherwise a
 * plain "hi" the next day would drag yesterday's entire conversation back
 * into context and the bot would just keep re-answering an old question.
 */
async function resetSession(userId, oldSession) {
  const hasName = !!oldSession?.profile?.name;
  const session = {
    userId,
    history: oldSession?.history || [],
    state: hasName ? "ACTIVE" : "GREETING",
    profile: oldSession?.profile || {
      name: null, email: null, phone: userId, registered: false, memberId: null,
    },
    lastActivity: Date.now(),
    metadata: {
      returningUser: hasName,
      sessionStartedAt: Date.now(),
    },
  };
  cache.set(userId, session);
  await persistSession(session);
  return session;
}

export async function addMessage(userId, role, content, mediaUrl = null) {
  const session = await getSession(userId);
  const msg = { role, content, timestamp: Date.now() };
  if (mediaUrl) msg.mediaUrl = mediaUrl;
  session.history.push(msg);
  session.lastActivity = Date.now();
  await persistSession(session);
  return session;
}

export async function updateState(userId, newState) {
  const session = await getSession(userId);
  session.state = newState;
  session.lastActivity = Date.now();
  await persistSession(session);
  return session;
}

export async function updateProfile(userId, data) {
  const session = await getSession(userId);
  Object.assign(session.profile, data);
  session.lastActivity = Date.now();
  await persistSession(session);
  return session;
}

/**
 * Persist arbitrary metadata changes made directly on the session object
 * (e.g. session.metadata.foo = "bar") without changing profile fields.
 */
export async function touchSession(userId) {
  const session = await getSession(userId);
  session.lastActivity = Date.now();
  await persistSession(session);
  return session;
}

export async function deleteSession(userId) {
  cache.delete(userId);
  if (isDBConnected()) {
    try { await SessionModel.deleteOne({ userId }); } catch {}
  }
}

export async function deleteAllSessions() {
  const count = cache.size;
  cache.clear();
  if (isDBConnected()) {
    try {
      const result = await SessionModel.deleteMany({});
      console.log(`[Session] Deleted ${result.deletedCount} sessions from DB`);
    } catch (err) {
      console.error("[Session] DB deleteAll failed:", err.message);
    }
  }
  console.log(`[Session] Cleared ${count} cached sessions`);
}

export async function getAllSessions() {
  if (isDBConnected()) {
    try {
      const docs = await SessionModel.find({}).lean();
      return docs.map(docToSession);
    } catch (err) {
      console.error("[Session] DB getAllSessions failed:", err.message);
    }
  }
  return Array.from(cache.values());
}

export async function getActiveSessionCount() {
  if (isDBConnected()) {
    try {
      const cutoff = Date.now() - config.session.ttlMinutes * 60 * 1000;
      return await SessionModel.countDocuments({ lastActivity: { $gte: cutoff } });
    } catch {}
  }
  return cache.size;
}

// ───────── Persistence ─────────

async function persistSession(session) {
  if (!isDBConnected()) return;
  try {
    await SessionModel.findOneAndUpdate(
      { userId: session.userId },
      {
        userId: session.userId,
        history: session.history,
        state: session.state,
        profile: session.profile,
        lastActivity: session.lastActivity,
        metadata: session.metadata,
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (err) {
    console.error("[Session] Persist failed:", err.message);
  }
}

function docToSession(doc) {
  return {
    userId: doc.userId,
    history: doc.history || [],
    state: doc.state || "GREETING",
    profile: doc.profile || { name: null, email: null, phone: doc.userId, registered: false, memberId: null },
    lastActivity: doc.lastActivity || Date.now(),
    firstContact: doc.createdAt ? new Date(doc.createdAt).getTime() : (doc.lastActivity || Date.now()),
    metadata: doc.metadata || {},
  };
}

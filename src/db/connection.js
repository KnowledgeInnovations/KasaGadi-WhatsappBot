import dns from "dns";
import mongoose from "mongoose";
import config from "../config/index.js";

// Some networks (mobile hotspots, certain routers/ISPs, occasionally hosting
// providers) block or mishandle the DNS SRV queries that `mongodb+srv://`
// URIs rely on, even though normal DNS lookups work fine on the same network.
// Forcing Node's resolver to a public DNS server avoids that class of failure.
// Safe to apply globally — these are the same resolvers most systems already
// trust for regular browsing.
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (err) {
  console.warn("[DB] Could not override DNS servers:", err.message);
}

/**
 * Connect to MongoDB Atlas.
 * Retries up to 5 times with exponential backoff.
 */
let isConnected = false;

export async function connectDB() {
  if (!config.mongodb.uri) {
    console.warn("[DB] MONGODB_URI not set — running with in-memory fallback. Data will NOT persist across restarts.");
    return false;
  }

  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(config.mongodb.uri, {
        dbName: config.mongodb.dbName,
      });
      isConnected = true;
      console.log(`[DB] Connected to MongoDB Atlas (${config.mongodb.dbName})`);
      return true;
    } catch (err) {
      console.error(`[DB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error("[DB] All connection attempts failed — running with in-memory fallback");
  return false;
}

export function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

// Graceful shutdown
process.on("SIGINT", async () => {
  if (isConnected) {
    await mongoose.connection.close();
    console.log("[DB] Connection closed");
  }
  process.exit(0);
});

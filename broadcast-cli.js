#!/usr/bin/env node
/**
 * CLI tool to send WhatsApp broadcasts to registered members/contacts
 *
 * Usage:
 *   node broadcast-cli.js --file agents.json --message "Your message here"
 *   node broadcast-cli.js --csv agents.csv --message "Your message here"
 *   node broadcast-cli.js --numbers "+233123456789,+233987654321" --message "Your message here"
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { broadcastMessage, parsePhoneNumbers } from "./src/services/broadcast.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple argument parser
const args = process.argv.slice(2);
const params = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].substring(2);
    params[key] = args[i + 1];
    i++;
  }
}

async function main() {
  try {
    let phoneNumbers = [];
    let message = params.message;

    if (!message) {
      console.error("Error: --message parameter is required");
      printUsage();
      process.exit(1);
    }

    // Get phone numbers from file or direct input
    if (params.file) {
      const filePath = path.isAbsolute(params.file) ? params.file : path.join(process.cwd(), params.file);

      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const fileContent = fs.readFileSync(filePath, "utf8");
      let data;

      if (filePath.endsWith(".json")) {
        data = JSON.parse(fileContent);
      } else if (filePath.endsWith(".csv")) {
        // Simple CSV parser
        const lines = fileContent.trim().split("\n");
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const phoneColumnIndex = headers.findIndex(
          (h) => h.includes("phone") || h.includes("whatsapp") || h.includes("mobile") || h.includes("number")
        );

        if (phoneColumnIndex === -1) {
          console.error("Error: Could not find phone column in CSV (looking for: phone, whatsapp, mobile, number)");
          console.error(`Available columns: ${headers.join(", ")}`);
          process.exit(1);
        }

        data = [];
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            const cells = lines[i].split(",").map((c) => c.trim());
            const fieldName = headers[phoneColumnIndex];
            const record = {};
            headers.forEach((h, idx) => {
              record[h] = cells[idx];
            });
            data.push(record);
          }
        }
      } else {
        console.error("Error: File must be .json or .csv");
        process.exit(1);
      }

      phoneNumbers = parsePhoneNumbers(data, params.phoneField);
    } else if (params.numbers) {
      phoneNumbers = params.numbers.split(",").map((n) => n.trim());
    } else if (params.csv) {
      // Shorthand for --file
      const filePath = path.isAbsolute(params.csv) ? params.csv : path.join(process.cwd(), params.csv);

      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const csvContent = fs.readFileSync(filePath, "utf8");
      const lines = csvContent.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const phoneColumnIndex = headers.findIndex(
        (h) => h.includes("phone") || h.includes("whatsapp") || h.includes("mobile")
      );

      if (phoneColumnIndex === -1) {
        console.error("Error: Could not find phone column in CSV");
        process.exit(1);
      }

      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const cells = lines[i].split(",").map((c) => c.trim());
          let phone = cells[phoneColumnIndex];
          if (!phone.startsWith("+")) {
            phone = "+233" + phone.replace(/^0/, "");
          }
          phoneNumbers.push(phone);
        }
      }
    } else {
      console.error("Error: Provide phone numbers via --numbers, --file, or --csv");
      printUsage();
      process.exit(1);
    }

    if (phoneNumbers.length === 0) {
      console.error("Error: No phone numbers found");
      process.exit(1);
    }

    console.log("=".repeat(60));
    console.log("WhatsApp Broadcast");
    console.log("=".repeat(60));
    console.log(`Recipients: ${phoneNumbers.length}`);
    console.log(`Message: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`);
    console.log("=".repeat(60));
    console.log("");

    // Confirm before sending
    if (phoneNumbers.length > 10) {
      console.log("⚠️  Large broadcast detected!");
      console.log(`Sending to ${phoneNumbers.length} numbers...`);
      console.log("");
    }

    const results = await broadcastMessage(phoneNumbers, message);

    console.log("");
    console.log("=".repeat(60));
    console.log("Broadcast Complete!");
    console.log("=".repeat(60));
    console.log(`✓ Sent: ${results.totalSent}`);
    console.log(`✗ Failed: ${results.failed}`);
    console.log(`Duration: ${((results.endTime - results.startTime) / 1000).toFixed(2)}s`);
    console.log("=".repeat(60));

    if (results.failed > 0) {
      console.log(`\nFailed numbers:`);
      results.failedNumbers.forEach((item) => {
        console.log(`  - ${item.number}: ${item.reason}`);
      });
    }

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage:
  node broadcast-cli.js --message "Your message" [--file agents.json | --csv agents.csv | --numbers "+233123,+233456"]

Options:
  --message TEXT         Message to send (required)
  --file PATH           Path to JSON or CSV file with contact data
  --csv PATH            Shorthand for --file with CSV
  --numbers LIST        Comma-separated phone numbers with country codes
  --phoneField NAME     Column name for phone (auto-detected if omitted)

Examples:
  node broadcast-cli.js --file agents.json --message "New fact-check published — check it out!"
  node broadcast-cli.js --csv agents.csv --message "Weekly digest" --phoneField "whatsapp_number"
  node broadcast-cli.js --numbers "+233123456789,+233987654321" --message "Hello!"
`);
}

main();

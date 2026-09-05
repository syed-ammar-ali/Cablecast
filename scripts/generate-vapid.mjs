import webpush from "web-push";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const envLocalPath = path.join(rootDir, ".env.local");

const vapidKeys = webpush.generateVAPIDKeys();

console.log("=========================================");
console.log("VAPID Keys Generated for Cablecast Web Push:");
console.log("=========================================");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:support@cablecast.tv"`);
console.log("=========================================");

let envContent = "";
if (fs.existsSync(envLocalPath)) {
  envContent = fs.readFileSync(envLocalPath, "utf8");
}

if (!envContent.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY")) {
  const toAppend = `\n# Web Push Notifications VAPID Keys\nNEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"\nVAPID_PRIVATE_KEY="${vapidKeys.privateKey}"\nVAPID_SUBJECT="mailto:support@cablecast.tv"\nCRON_SECRET="cablecast-cron-secret-2026"\n`;
  fs.appendFileSync(envLocalPath, toAppend, "utf8");
  console.log("✅ Successfully appended VAPID keys and CRON_SECRET to .env.local");
} else {
  console.log("ℹ️ .env.local already contains VAPID keys. Existing keys retained.");
}

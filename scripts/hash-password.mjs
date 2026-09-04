import bcrypt from "bcryptjs";
import readline from "node:readline";

let password = process.argv[2];

if (!password) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  password = await new Promise((resolve) => {
    rl.question("\n🔑 Enter password to hash: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

if (!password) {
  console.log("\n❌ No password entered. Aborted.\n");
  process.exit(1);
}

const saltRounds = 12;
const hash = await bcrypt.hash(password, saltRounds);

const escapedHash = hash.replace(/\$/g, "\\$");

console.log("\n✅ Generated Bcrypt Password Hash (12 rounds):");
console.log(`\n${hash}\n`);
console.log("Add this to your .env.local file as:");
console.log(`ADMIN_PASSWORD_HASH="${escapedHash}"\n`);

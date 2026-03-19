import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import renderCart from "@typek/render/templates/cart.html";
import renderEmail from "@typek/render/templates/email.html";
import renderProfile from "@typek/render/templates/profile.html";
import renderStore from "@typek/render/templates/store.html";

import { storeData } from "./data/store.js";
import { cartData } from "./data/cart.js";
import { profileData } from "./data/profile.js";
import { emailData } from "./data/email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

fs.mkdirSync(distDir, { recursive: true });

const files: Array<{ name: string; html: string }> = [
  { name: "store.html", html: renderStore(storeData) },
  { name: "cart.html", html: renderCart(cartData) },
  { name: "profile.html", html: renderProfile(profileData) },
  { name: "email.html", html: renderEmail(emailData) },
];

for (const file of files) {
  const outPath = path.join(distDir, file.name);
  fs.writeFileSync(outPath, file.html);
  console.log(`  ✓ ${file.name} (${file.html.length} bytes)`);
}

console.log(`\nDone! Open dist/ to view the rendered HTML files.`);

import { cpSync, mkdirSync, rmSync } from "node:fs";

const files = [
  "index.html",
  "privacy.html",
  "styles.css",
  "data.js",
  "i18n.js",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "icons",
];

rmSync("www", { recursive: true, force: true });
mkdirSync("www");
for (const f of files) cpSync(f, `www/${f}`, { recursive: true });
console.log("Copied web files to www/");

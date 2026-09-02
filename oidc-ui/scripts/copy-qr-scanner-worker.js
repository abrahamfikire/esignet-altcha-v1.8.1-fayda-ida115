const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "../node_modules/@agicash/qr-scanner/dist/worker.js"
);
const dest = path.join(__dirname, "../public/qr-scanner-worker.js");

if (!fs.existsSync(src)) {
  console.warn("@agicash/qr-scanner worker not found; skip copy");
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied @agicash/qr-scanner worker to public/qr-scanner-worker.js");

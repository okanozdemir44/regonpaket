/**
 * Restoran logosundan Android ikon üretir.
 * Kullanım: node scripts/generate-app-icon.mjs
 * Girdi: assets/logo.png (yoksa Supabase'den çekilmeli)
 */
import fs from "node:fs";
import sharp from "sharp";
import { spawnSync } from "node:child_process";

if (!fs.existsSync("assets/logo.png")) {
  console.error("assets/logo.png yok");
  process.exit(1);
}

fs.mkdirSync("assets", { recursive: true });
await sharp("assets/logo.png")
  .resize(1024, 1024, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png()
  .toFile("assets/icon.png");

await sharp("assets/logo.png")
  .resize(2732, 2732, {
    fit: "contain",
    background: { r: 18, g: 23, b: 30, alpha: 1 },
  })
  .png()
  .toFile("assets/splash.png");

const r = spawnSync("npx", ["capacitor-assets", "generate", "--android"], {
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);

// Regenerates the PNG app icons from app/icon.svg (the mark).
//   node scripts/generate-icons.mjs
// Outputs: app/apple-icon.png (180), public/icons/icon-192.png, icon-512.png,
// icon-maskable-512.png. The mark sits on a flat #0B0B0F square (iOS and the PWA
// need a square; the mark itself is never put in a tile elsewhere).
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = "#0B0B0F";
const markSvg = readFileSync(join(root, "app/icon.svg"), "utf8");

// The mark is 2.8r wide in a 64 box (r = 16), i.e. 44.8 units wide.
// `markWidth` is the share of the canvas the mark's width takes up.
async function render(file, size, markWidth) {
  const box = Math.round((size * markWidth) / (44.8 / 64)); // svg box so the mark is markWidth wide
  const mark = await sharp(Buffer.from(markSvg), { density: 384 }).resize(box, box).png().toBuffer();
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log("wrote", file);
}

await render("app/apple-icon.png", 180, 0.6);
await render("public/icons/icon-192.png", 192, 0.6);
await render("public/icons/icon-512.png", 512, 0.6);
// Maskable: launchers crop to a circle of radius 40% of the canvas, so keep the
// mark's half-diagonal (sqrt(22.4^2 + 16^2) = 27.5 of 64 units) inside ~36%.
await render("public/icons/icon-maskable-512.png", 512, 0.5);

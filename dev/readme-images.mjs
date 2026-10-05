#!/usr/bin/env node
// Builds the README images from raw screenshots in docs/images/raw/:
// cropped/rounded screen images plus a composed cover banner.
//
//   node dev/readme-images.mjs

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(root, "docs/images/raw");
const OUT = path.join(root, "docs/images");
const rawPath = (f) => path.join(RAW, f);

// Paint out the mouse cursor captured in some screenshots by copying a nearby
// patch of matching background (dial offsets are whole tick spacings).
const CURSOR_PATCHES = {
  "phone-dial.jpg": [{ from: [865, 598], to: [897, 598], size: [26, 44] }],
  "big-guessing.jpg": [{ from: [1250, 140], to: [1205, 140], size: [30, 34] }],
};
const cleaned = new Map();
async function raw(file) {
  if (cleaned.has(file)) return cleaned.get(file);
  let buf = await sharp(rawPath(file)).toBuffer();
  for (const p of CURSOR_PATCHES[file] ?? []) {
    const patch = await sharp(buf).extract({ left: p.from[0], top: p.from[1], width: p.size[0], height: p.size[1] }).toBuffer();
    buf = await sharp(buf).composite([{ input: patch, left: p.to[0], top: p.to[1] }]).toBuffer();
  }
  cleaned.set(file, buf);
  return buf;
}

/** Round the corners of an image buffer. */
async function rounded(buf, radius) {
  const { width, height } = await sharp(buf).metadata();
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></svg>`);
  return sharp(buf).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

/** A soft drop shadow sized to an image, for compositing underneath it. */
async function shadow(width, height, blur = 28, opacity = 0.65) {
  const pad = blur * 3;
  const svg = `<svg width="${width + pad * 2}" height="${height + pad * 2}"><rect x="${pad}" y="${pad + blur / 2}" width="${width}" height="${height}" rx="24" fill="black" fill-opacity="${opacity}"/></svg>`;
  return { buf: await sharp(Buffer.from(svg)).blur(blur).png().toBuffer(), pad };
}

/** Rotate with a transparent background. */
const tilt = (buf, deg) => sharp(buf).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

// ---- 1. Individual screens for the README gallery ----
const BIG = { "big-lobby.jpg": "screen-lobby", "big-guessing.jpg": "screen-guessing", "big-reveal.jpg": "screen-reveal", "big-final.jpg": "screen-final" };
for (const [file, name] of Object.entries(BIG)) {
  const img = sharp(await raw(file));
  const { width, height } = await img.metadata();
  // Trim the scrollbar strip on the right edge.
  const buf = await img.extract({ left: 0, top: 0, width: width - 16, height }).resize({ width: 1400 }).toBuffer();
  await sharp(await rounded(buf, 18)).webp({ quality: 86 }).toFile(path.join(OUT, `${name}.webp`));
}

// Phone views: crop the centered controller column.
const PHONE = {
  "phone-lobby.jpg": { name: "phone-lobby", left: 486, width: 540, height: 807 },
  "phone-dial.jpg": { name: "phone-dial", left: 470, width: 560, height: 757 },
  "phone-reveal.jpg": { name: "phone-reveal", left: 462, width: 560, height: 688 },
};
const phones = {};
for (const [file, c] of Object.entries(PHONE)) {
  const buf = await sharp(await raw(file)).extract({ left: c.left, top: 0, width: c.width, height: c.height }).toBuffer();
  phones[c.name] = buf;
  await sharp(await rounded(await sharp(buf).resize({ width: 520 }).toBuffer(), 28)).webp({ quality: 86 }).toFile(path.join(OUT, `${c.name}.webp`));
}

// ---- 2. Cover banner ----
const W = 1600;
const H = 840;
const background = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="red" cx="85%" cy="-10%" r="70%"><stop offset="0" stop-color="#e0402f" stop-opacity="0.45"/><stop offset="1" stop-color="#e0402f" stop-opacity="0"/></radialGradient>
    <radialGradient id="amber" cx="0%" cy="110%" r="60%"><stop offset="0" stop-color="#f0a73a" stop-opacity="0.22"/><stop offset="1" stop-color="#f0a73a" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 0 0 0.07 0"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="#120d0b"/>
  <rect width="100%" height="100%" fill="url(#red)"/>
  <rect width="100%" height="100%" fill="url(#amber)"/>
  <rect width="100%" height="100%" filter="url(#grain)"/>
  <rect width="100%" height="100%" fill="url(#vig)"/>
</svg>`);

// Logo + tagline straight from the home screen (keeps the real webfonts).
const logo = await sharp(await raw("home.jpg")).extract({ left: 498, top: 92, width: 540, height: 140 }).resize({ width: 520 }).png().toBuffer();

// Hero: the big-screen reveal.
const revealSrc = await sharp(await raw("big-reveal.jpg")).extract({ left: 0, top: 0, width: 1484, height: 757 }).resize({ width: 1000 }).toBuffer();
const reveal = await tilt(await rounded(revealSrc, 16), -1.5);
const revealMeta = await sharp(reveal).metadata();
const revealShadow = await shadow(revealMeta.width - 30, revealMeta.height - 30);

// Two phones in front.
async function phoneCard(buf, height, deg) {
  const scaled = await sharp(buf).resize({ height }).toBuffer();
  const framed = await rounded(scaled, 26);
  const m = await sharp(framed).metadata();
  // Thin bezel: a slightly larger dark rounded rect behind the screen.
  const bezel = Buffer.from(`<svg width="${m.width + 16}" height="${m.height + 16}"><rect width="${m.width + 16}" height="${m.height + 16}" rx="34" fill="#2a201b" stroke="#3b2e27" stroke-width="2"/></svg>`);
  const card = await sharp(bezel).composite([{ input: framed, left: 8, top: 8 }]).png().toBuffer();
  return tilt(card, deg);
}
const phoneA = await phoneCard(phones["phone-dial"], 470, -5);
const phoneB = await phoneCard(phones["phone-reveal"], 470, 4);
const pa = await sharp(phoneA).metadata();
const pb = await sharp(phoneB).metadata();
const phoneShadowA = await shadow(pa.width - 40, pa.height - 40, 24, 0.7);
const phoneShadowB = await shadow(pb.width - 40, pb.height - 40, 24, 0.7);

const revealX = 560;
const revealY = 170;
const phoneAX = 40;
const phoneAY = 290;
const phoneBX = 330;
const phoneBY = 320;

await sharp(background)
  .composite([
    // "lighten" drops the screenshot's dark backdrop so only the logo shows.
    { input: logo, left: 60, top: 54, blend: "lighten" },
    { input: revealShadow.buf, left: revealX - revealShadow.pad + 15, top: revealY - revealShadow.pad + 15 },
    { input: reveal, left: revealX, top: revealY },
    { input: phoneShadowA.buf, left: phoneAX - phoneShadowA.pad + 20, top: phoneAY - phoneShadowA.pad + 20 },
    { input: phoneA, left: phoneAX, top: phoneAY },
    { input: phoneShadowB.buf, left: phoneBX - phoneShadowB.pad + 20, top: phoneBY - phoneShadowB.pad + 20 },
    { input: phoneB, left: phoneBX, top: phoneBY },
  ])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(path.join(OUT, "cover.jpg"));

console.log("Wrote docs/images/{cover.jpg, screen-*.webp, phone-*.webp}");

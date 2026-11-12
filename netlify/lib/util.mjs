import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

export const CATEGORIES = ["Bridal Gowns","Changing Dresses","Maids Dresses","Party Dresses","Bridal Gomesi","Men's Suits","Kanzus","Mishananas"];
export const AVAILABILITY = ["Available","Reserved","Unavailable"];
export const BOOKING_STATUS = ["New","Contacted","Confirmed","Closed"];

export const catalog = () => getStore({ name: "catalog", consistency: "strong" });
export const bookings = () => getStore({ name: "bookings", consistency: "strong" });
export const images = () => getStore({ name: "images", consistency: "strong" });
export const media = () => getStore({ name: "media", consistency: "strong" });

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }
  });

export const fail = (message, status = 400) => json({ error: message }, status);

export const clean = (v, max = 500) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString("hex");

/* ---------- Admin auth: signed, expiring token (no database needed) ---------- */
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

export function makeToken(hours = 12) {
  const payload = b64(JSON.stringify({ exp: Date.now() + hours * 3600 * 1000 }));
  return `${payload}.${sign(payload)}`;
}

export function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    if (!safeEqual(sig, sign(payload))) return false;
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch { return false; }
}

export const requireAdmin = (req) => (isAdmin(req) ? null : fail("Please sign in again.", 401));

export async function readList(store, key) {
  return (await store.get(key, { type: "json" })) || [];
}

/* Media items used by occasions and stories: {kind, src, poster?, caption?} */
const IMG = /^\/api\/images\/[A-Za-z0-9._-]+$/, VID = /^\/api\/media\/[A-Za-z0-9._-]+$/;
export function cleanMedia(arr, max, captions = false) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, max).map((m) => {
    const kind = m?.kind === "video" ? "video" : "image";
    const src = String(m?.src || "");
    if (!(kind === "video" ? VID : IMG).test(src)) return null;
    const poster = IMG.test(String(m?.poster || "")) ? m.poster : "";
    const item = { kind, src, poster };
    if (captions) item.caption = clean(m?.caption, 140);
    return item;
  }).filter(Boolean);
}

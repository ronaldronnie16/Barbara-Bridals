import { json, fail, safeEqual, makeToken, isAdmin } from "../lib/util.mjs";

export const config = { path: "/api/auth" };

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD) {
    return fail("Admin password is not set. Add ADMIN_PASSWORD in Netlify site settings, then redeploy.", 500);
  }
  if (req.method === "GET") return json({ ok: isAdmin(req) });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let body = {};
  try { body = await req.json(); } catch {}
  await new Promise((r) => setTimeout(r, 400)); // slows down password guessing
  if (!body.password || !safeEqual(body.password, process.env.ADMIN_PASSWORD)) {
    return fail("That password is not correct.", 401);
  }
  return json({ token: makeToken(12) });
};

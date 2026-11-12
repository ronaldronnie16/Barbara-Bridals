import { catalog, readList, json, fail, clean, newId, requireAdmin, isAdmin, cleanMedia } from "../lib/util.mjs";

export const config = { path: ["/api/stories", "/api/stories/:id"] };

const KEEP = { "24h": 24 * 3600e3, "7d": 7 * 24 * 3600e3 };
const live = (s) => !s.expires || new Date(s.expires).getTime() > Date.now();

export default async (req, context) => {
  const store = catalog();
  const id = context.params?.id;
  const list = await readList(store, "stories");

  if (req.method === "GET") {
    const all = new URL(req.url).searchParams.get("all") === "1" && isAdmin(req);
    return json(all ? list : list.filter(live));
  }

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "DELETE" && id) {
    await store.setJSON("stories", list.filter((s) => s.id !== id));
    return json({ deleted: id });
  }
  if (req.method !== "POST" && req.method !== "PUT") return fail("Method not allowed", 405);

  let b = {}; try { b = await req.json(); } catch { return fail("Invalid request."); }
  const title = clean(b.title, 40);
  if (!title) return fail("Story title is required.");
  const slides = cleanMedia(b.slides, 15, true);
  if (!slides.length) return fail("Add at least one photo or video.");
  const now = new Date();
  const base = { title, slides, updated: now.toISOString() };
  if (b.keep in KEEP) base.expires = new Date(now.getTime() + KEEP[b.keep]).toISOString();
  else if (b.keep === "never") base.expires = null;

  if (req.method === "POST") {
    const item = { id: newId(), created: now.toISOString(), expires: null, ...base };
    await store.setJSON("stories", [item, ...list]);
    return json(item, 201);
  }
  const old = list.find((s) => s.id === id);
  if (!old) return fail("Story not found.", 404);
  const item = { ...old, ...base };
  await store.setJSON("stories", list.map((s) => (s.id === id ? item : s)));
  return json(item);
};

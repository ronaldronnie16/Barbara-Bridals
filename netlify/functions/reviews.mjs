import { catalog, readList, json, fail, clean, newId, requireAdmin } from "../lib/util.mjs";

export const config = { path: ["/api/reviews", "/api/reviews/:id"] };

export default async (req, context) => {
  const store = catalog();
  const id = context.params?.id;
  const list = await readList(store, "reviews");

  if (req.method === "GET") return json(list, 200, { "Cache-Control": "public, max-age=0, must-revalidate" });

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "POST") {
    let b = {}; try { b = await req.json(); } catch { return fail("Invalid request."); }
    const name = clean(b.name, 50), text = clean(b.text, 500);
    if (!name || !text) return fail("Name and testimonial are required.");
    const rating = Math.min(5, Math.max(1, Number(b.rating) || 5));
    const item = { id: newId(), name, text, rating, created: new Date().toISOString() };
    await store.setJSON("reviews", [item, ...list]);
    return json(item, 201);
  }
  if (req.method === "DELETE" && id) {
    await store.setJSON("reviews", list.filter((r) => r.id !== id));
    return json({ deleted: id });
  }
  return fail("Method not allowed", 405);
};

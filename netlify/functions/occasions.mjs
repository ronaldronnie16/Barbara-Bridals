import { catalog, readList, json, fail, clean, newId, requireAdmin, cleanMedia } from "../lib/util.mjs";

export const config = { path: ["/api/occasions", "/api/occasions/:id"] };

const sortList = (l) => l.sort((a, b) => String(b.date || b.created).localeCompare(String(a.date || a.created)));

export default async (req, context) => {
  const store = catalog();
  const id = context.params?.id;
  const list = await readList(store, "occasions");

  if (req.method === "GET") return json(sortList(list), 200, { "Cache-Control": "public, max-age=0, must-revalidate" });

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "DELETE" && id) {
    await store.setJSON("occasions", list.filter((o) => o.id !== id));
    return json({ deleted: id });
  }
  if (req.method !== "POST" && req.method !== "PUT") return fail("Method not allowed", 405);

  let b = {}; try { b = await req.json(); } catch { return fail("Invalid request."); }
  const title = clean(b.title, 90);
  if (!title) return fail("Occasion title is required.");
  const items = cleanMedia(b.media, 40);
  if (!items.length) return fail("Add at least one photo or video.");
  const base = {
    title, type: clean(b.type, 40) || "Other",
    date: /^\d{4}-\d{2}(-\d{2})?$/.test(b.date || "") ? b.date : "",
    description: clean(b.description, 500), media: items, updated: new Date().toISOString()
  };
  if (req.method === "POST") {
    const item = { id: newId(), created: new Date().toISOString(), ...base };
    await store.setJSON("occasions", [item, ...list]);
    return json(item, 201);
  }
  const old = list.find((o) => o.id === id);
  if (!old) return fail("Occasion not found.", 404);
  const item = { ...old, ...base };
  await store.setJSON("occasions", list.map((o) => (o.id === id ? item : o)));
  return json(item);
};

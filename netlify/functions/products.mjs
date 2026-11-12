import { catalog, readList, json, fail, clean, newId, requireAdmin, CATEGORIES, AVAILABILITY } from "../lib/util.mjs";

export const config = { path: ["/api/products", "/api/products/:id"] };

function shape(input, old = {}) {
  const category = clean(input.category, 40);
  if (!CATEGORIES.includes(category)) throw new Error("Choose a valid category.");
  const name = clean(input.name, 90);
  if (!name) throw new Error("Outfit name is required.");
  const availability = AVAILABILITY.includes(input.availability) ? input.availability : "Available";
  const price = input.price === "" || input.price == null ? "" : Math.max(0, Math.round(Number(input.price)) || 0);
  const imgs = Array.isArray(input.images) ? input.images.map((x) => clean(x, 80)).filter(Boolean).slice(0, 6) : old.images || [];
  return {
    ...old,
    name, category, availability, price,
    sizes: clean(input.sizes, 80),
    description: clean(input.description, 600),
    featured: Boolean(input.featured),
    images: imgs,
    updated: new Date().toISOString()
  };
}

export default async (req, context) => {
  const store = catalog();
  const id = context.params?.id;
  const list = await readList(store, "products");

  if (req.method === "GET") return json(list, 200, { "Cache-Control": "public, max-age=0, must-revalidate" });

  const denied = requireAdmin(req);
  if (denied) return denied;

  let body = {};
  if (req.method !== "DELETE") { try { body = await req.json(); } catch { return fail("Invalid request."); } }

  try {
    if (req.method === "POST") {
      const item = shape(body, { id: newId(), created: new Date().toISOString() });
      await store.setJSON("products", [item, ...list]);
      return json(item, 201);
    }
    if (!id) return fail("Missing outfit id.");
    const old = list.find((p) => p.id === id);
    if (!old) return fail("Outfit not found.", 404);

    if (req.method === "PUT") {
      const item = shape(body, old);
      await store.setJSON("products", list.map((p) => (p.id === id ? item : p)));
      return json(item);
    }
    if (req.method === "PATCH") { // quick status change from the dashboard
      const item = { ...old, updated: new Date().toISOString() };
      if (AVAILABILITY.includes(body.availability)) item.availability = body.availability;
      if (typeof body.featured === "boolean") item.featured = body.featured;
      await store.setJSON("products", list.map((p) => (p.id === id ? item : p)));
      return json(item);
    }
    if (req.method === "DELETE") {
      await store.setJSON("products", list.filter((p) => p.id !== id));
      return json({ deleted: id });
    }
  } catch (e) { return fail(e.message || "Could not save."); }
  return fail("Method not allowed", 405);
};

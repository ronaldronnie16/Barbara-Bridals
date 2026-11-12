import { bookings, json, fail, clean, newId, requireAdmin, BOOKING_STATUS } from "../lib/util.mjs";

export const config = { path: ["/api/bookings", "/api/bookings/:id"] };

export default async (req, context) => {
  const store = bookings();
  const id = context.params?.id;

  // Public: customers submit booking requests
  if (req.method === "POST") {
    let b = {}; try { b = await req.json(); } catch { return fail("Invalid request."); }
    if (b.website) return json({ ok: true }); // honeypot for bots
    const name = clean(b.name, 60), phone = clean(b.phone, 25);
    if (!name || phone.replace(/\D/g, "").length < 9) return fail("Please enter your name and a valid phone number.");
    const item = {
      id: newId(), name, phone,
      category: clean(b.category, 40),
      outfit: clean(b.outfit, 90),
      date: clean(b.date, 12),
      details: clean(b.details, 600),
      status: "New",
      created: new Date().toISOString()
    };
    await store.setJSON(item.id, item);
    return json({ ok: true, id: item.id }, 201);
  }

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const items = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    items.sort((a, b) => b.created.localeCompare(a.created));
    return json(items);
  }
  if (req.method === "PATCH" && id) {
    const old = await store.get(id, { type: "json" });
    if (!old) return fail("Request not found.", 404);
    let b = {}; try { b = await req.json(); } catch {}
    if (!BOOKING_STATUS.includes(b.status)) return fail("Invalid status.");
    const item = { ...old, status: b.status };
    await store.setJSON(id, item);
    return json(item);
  }
  if (req.method === "DELETE" && id) {
    await store.delete(id);
    return json({ deleted: id });
  }
  return fail("Method not allowed", 405);
};

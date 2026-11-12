import { images, json, fail, newId, requireAdmin } from "../lib/util.mjs";

export const config = { path: ["/api/images", "/api/images/:id"] };

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX = 3 * 1024 * 1024;

export default async (req, context) => {
  const store = images();
  const id = context.params?.id;

  if (req.method === "GET" && id) {
    const res = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (!res) return new Response("Not found", { status: 404 });
    return new Response(res.data, {
      headers: {
        "Content-Type": res.metadata?.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  }

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0];
    if (!TYPES[type]) return fail("Upload a JPG, PNG, WebP or GIF image.");
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX) return fail("Image must be under 3 MB.");
    const key = `${newId()}.${TYPES[type]}`;
    await store.set(key, buf, { metadata: { contentType: type } });
    return json({ id: key, url: `/api/images/${key}` }, 201);
  }
  if (req.method === "DELETE" && id) {
    await store.delete(id);
    return json({ deleted: id });
  }
  return fail("Method not allowed", 405);
};

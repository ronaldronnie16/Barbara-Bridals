import { media, json, fail, newId, requireAdmin } from "../lib/util.mjs";

export const config = { path: ["/api/media", "/api/media/:id"] };

// Netlify functions cap request/response bodies at ~6 MB, so videos are stored
// in 3 MB chunks and served back with HTTP Range support (206 partial content).
const CHUNK = 3 * 1024 * 1024;
const MAX = 60 * 1024 * 1024;
const TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export default async (req, context) => {
  const store = media();
  const id = context.params?.id;

  if (req.method === "GET" && id) {
    const meta = await store.get(`${id}.meta`, { type: "json" });
    if (!meta) return new Response("Not found", { status: 404 });
    let start = 0, end = meta.size - 1, partial = false;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
    if (m) {
      partial = true;
      if (m[1] === "") start = Math.max(0, meta.size - Number(m[2] || 0));
      else { start = Number(m[1]); if (m[2] !== "") end = Math.min(end, Number(m[2])); }
    }
    if (start > end || start >= meta.size) return new Response("", { status: 416, headers: { "Content-Range": `bytes */${meta.size}` } });
    const idx = Math.floor(start / CHUNK);
    end = Math.min(end, (idx + 1) * CHUNK - 1);
    if (end < meta.size - 1) partial = true;
    const buf = await store.get(`${id}.${idx}`, { type: "arrayBuffer" });
    if (!buf) return new Response("Not found", { status: 404 });
    const slice = buf.slice(start - idx * CHUNK, end - idx * CHUNK + 1);
    const headers = {
      "Content-Type": meta.contentType, "Accept-Ranges": "bytes",
      "Content-Length": String(slice.byteLength), "Cache-Control": "public, max-age=86400"
    };
    if (partial) headers["Content-Range"] = `bytes ${start}-${end}/${meta.size}`;
    return new Response(slice, { status: partial ? 206 : 200, headers });
  }

  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method === "POST") { // start an upload
    let b = {}; try { b = await req.json(); } catch { return fail("Invalid request."); }
    const size = Number(b.size);
    if (!TYPES.includes(b.contentType)) return fail("Upload an MP4, WebM or MOV video.");
    if (!size || size > MAX) return fail("Video must be under 60 MB. Trim it or lower its quality first.");
    const nid = newId();
    const chunks = Math.ceil(size / CHUNK);
    await store.setJSON(`${nid}.meta`, { contentType: b.contentType, size, chunks, created: new Date().toISOString() });
    return json({ id: nid, url: `/api/media/${nid}`, chunkSize: CHUNK, chunks }, 201);
  }

  if (req.method === "PUT" && id) { // upload one chunk
    const meta = await store.get(`${id}.meta`, { type: "json" });
    const i = Number(new URL(req.url).searchParams.get("i"));
    if (!meta || !Number.isInteger(i) || i < 0 || i >= meta.chunks) return fail("Invalid upload.");
    const buf = await req.arrayBuffer();
    const expected = i === meta.chunks - 1 ? meta.size - i * CHUNK : CHUNK;
    if (buf.byteLength !== expected) return fail("Chunk size mismatch. Please retry the upload.");
    await store.set(`${id}.${i}`, buf);
    return json({ ok: true, i });
  }

  if (req.method === "DELETE" && id) {
    const meta = await store.get(`${id}.meta`, { type: "json" });
    if (meta) for (let i = 0; i < meta.chunks; i++) await store.delete(`${id}.${i}`);
    await store.delete(`${id}.meta`);
    return json({ deleted: id });
  }
  return fail("Method not allowed", 405);
};

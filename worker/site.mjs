const folioCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function serveFolioAsset(request, path) {
  const headers = {
    "Content-Security-Policy": folioCsp,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...headers, Allow: "GET, HEAD" },
    });
  }

  const key = path === "/" ? "/index.html" : path;
  const asset = Object.hasOwn(folioAssets, key) ? folioAssets[key] : null;
  if (!asset) return new Response("Page not found", { status: 404, headers });
  headers["Content-Type"] = asset.type;
  const body = request.method === "HEAD" ? null : Uint8Array.from(atob(asset.data), character => character.charCodeAt(0));
  return new Response(body, { headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/api/ledger") return ledgerResponse(request, env);
    return serveFolioAsset(request, path);
  },
};

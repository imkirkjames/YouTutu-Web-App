// YouTutu CORS Proxy — Cloudflare Worker
// Stateless proxy that adds CORS headers for YouTube API/image requests.
//
// Deploy: wrangler deploy
// Or paste into Cloudflare Dashboard > Workers > Quick Edit
//
// Free tier: 100,000 requests/day (more than sufficient).

const ALLOWED_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'i.ytimg.com',
  'i9.ytimg.com',
]);

function isAllowedHost(hostname) {
  return ALLOWED_HOSTNAMES.has(hostname);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Extract target URL from path (everything after the first /)
    const url = new URL(request.url);
    const targetPath = url.pathname.slice(1) + url.search;

    if (!targetPath) {
      return new Response(
        JSON.stringify({ error: 'No target URL provided. Usage: /<target-url>' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetPath);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid target URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Whitelist check
    if (!isAllowedHost(targetUrl.hostname)) {
      return new Response(
        JSON.stringify({ error: `Host not allowed: ${targetUrl.hostname}` }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Forward the request
    const headers = new Headers();
    const ua = request.headers.get('User-Agent');
    if (ua) headers.set('User-Agent', ua);

    // Forward Content-Type for POST requests
    if (request.method === 'POST') {
      const ct = request.headers.get('Content-Type');
      if (ct) headers.set('Content-Type', ct);
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.method === 'POST' ? request.body : undefined,
        redirect: 'follow',
      });

      // Create new response with CORS headers
      const newHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders())) {
        newHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Fetch failed: ${err.message}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }
  },
};

# YouTutu

Progressive Web App that converts YouTube videos into self-contained HTML reference documents.

Runs entirely in-browser. No build step. JavaScript ES modules only.

## What It Does

Paste a YouTube URL and get a single HTML file containing:

- Video metadata (title, channel, date, duration, description, chapters)
- AI-generated summary via on-device Gemma 4 E2B (optional)
- Curated keyframe screenshots inline (highest available storyboard resolution)
- Full timestamped transcript as a collapsible appendix

All images are base64-encoded. The output opens in any browser with no dependencies.

## Running Locally

Serve the root directory with any static HTTP server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Open `http://localhost:8000` (or whatever port).

## CORS Proxy Setup

The app needs a CORS proxy to access YouTube's API. A Cloudflare Worker source is in `proxy/worker.js`.

### Deploy to Cloudflare Workers

1. Install Wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. Create `proxy/wrangler.toml`:
   ```toml
   name = "yoututu-proxy"
   main = "worker.js"
   compatibility_date = "2024-01-01"
   ```
4. Deploy: `cd proxy && wrangler deploy`
5. Update `PROXY_URL` in `js/constants.js` with your worker URL

### Proxy Security

- Only whitelisted YouTube domains are proxied
- No data is stored — the worker is fully stateless
- Free tier: 100,000 requests/day

## Hosting

Deploy to GitHub Pages or any static hosting with HTTPS.

## Architecture

```
index.html          → PWA app shell
sw.js               → service worker (offline + share target)
manifest.json       → PWA manifest with share target
css/app.css         → responsive styles (dark/light mode)
js/
  app.js            → pipeline orchestration + UI
  constants.js      → all hardcoded config
  url-parser.js     → YouTube URL extraction
  youtube-api.js    → innertube API + fallback scraping
  storyboard.js     → sprite sheet fetch + Canvas slicing
  transcript.js     → caption fetch + cleaning
  keyframes.js      → pixel-diff keyframe detection
  summarizer.js     → AI summary manager
  renderer.js       → self-contained HTML output
workers/
  ai-worker.js      → Transformers.js inference (WebGPU/WASM)
proxy/
  worker.js         → Cloudflare Worker CORS proxy
```

## License

MIT

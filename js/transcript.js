// YouTutu PWA — Transcript Fetcher
// Fetches and cleans YouTube captions/subtitles.

import { PROXY_URL, PREFERRED_LANGUAGE, MIN_SEGMENT_DURATION } from './constants.js';

const NOISE_PATTERNS = [
  /^\[.*?\]$/,           // [Music], [Applause], [Laughter], etc.
  /^\(.*?\)$/,           // (music), (applause)
  /^♪.*♪$/,              // ♪ music ♪
  /^\s*$/,               // empty/whitespace
];

/**
 * Fetch and clean transcript from the best available caption track.
 * @param {Array<{baseUrl: string, languageCode: string, kind: string, name: string}>} captionTracks
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{start: number, duration: number, text: string, formattedTime: string}>>}
 */
export async function fetchTranscript(captionTracks, signal) {
  if (!captionTracks?.length) return [];

  const track = selectBestTrack(captionTracks);
  if (!track) return [];

  const rawSegments = await fetchCaptionTrack(track.baseUrl, signal);
  return cleanTranscript(rawSegments);
}

function selectBestTrack(tracks) {
  const lang = PREFERRED_LANGUAGE.toLowerCase();

  // Priority 1: Manual track in preferred language
  const manualPreferred = tracks.find(
    (t) => t.kind !== 'asr' && t.languageCode.toLowerCase().startsWith(lang)
  );
  if (manualPreferred) return manualPreferred;

  // Priority 2: Manual track in any language
  const manualAny = tracks.find((t) => t.kind !== 'asr');
  if (manualAny) return manualAny;

  // Priority 3: Auto-generated in preferred language
  const autoPreferred = tracks.find(
    (t) => t.kind === 'asr' && t.languageCode.toLowerCase().startsWith(lang)
  );
  if (autoPreferred) return autoPreferred;

  // Priority 4: Auto-generated in any language
  return tracks.find((t) => t.kind === 'asr') || tracks[0];
}

async function fetchCaptionTrack(baseUrl, signal) {
  const url = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';

  // Try direct fetch first (caption URLs often work cross-origin)
  try {
    const resp = await fetch(url, { signal });
    if (resp.ok) return parseJson3(await resp.json());
  } catch {
    // CORS blocked — fall through to proxy
  }

  // Retry via proxy
  const resp = await fetch(`${PROXY_URL}/${url}`, { signal });
  if (!resp.ok) throw new Error(`Caption fetch failed: ${resp.status}`);
  return parseJson3(await resp.json());
}

function parseJson3(data) {
  if (!data.events) return [];

  const segments = [];

  for (const event of data.events) {
    if (!event.segs) continue;

    const text = event.segs.map((s) => s.utf8 || '').join('');
    if (!text.trim()) continue;

    segments.push({
      start: (event.tStartMs || 0) / 1000,
      duration: (event.dDurationMs || 0) / 1000,
      text: text.trim(),
    });
  }

  return segments;
}

function cleanTranscript(segments) {
  // Step 1: Decode HTML entities and strip tags
  let cleaned = segments.map((seg) => ({
    ...seg,
    text: decodeEntities(stripTags(seg.text)),
  }));

  // Step 2: Remove noise segments
  cleaned = cleaned.filter(
    (seg) => !NOISE_PATTERNS.some((pattern) => pattern.test(seg.text))
  );

  // Step 3: Merge short segments
  cleaned = mergeShortSegments(cleaned);

  // Step 4: Add formatted timestamps
  return cleaned.map((seg) => ({
    ...seg,
    formattedTime: formatTimestamp(seg.start),
  }));
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, (match) => {
      const code = parseInt(match.slice(2, -1), 10);
      return String.fromCharCode(code);
    });
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, '');
}

function mergeShortSegments(segments) {
  if (segments.length === 0) return [];

  const merged = [{ ...segments[0] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (prev.duration < MIN_SEGMENT_DURATION) {
      // Merge into previous
      prev.text += ' ' + curr.text;
      prev.duration = (curr.start + curr.duration) - prev.start;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

function formatTimestamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// YouTutu PWA — YouTube Data Fetcher
// Fetches video metadata, storyboard spec, caption tracks, and chapters
// via the Innertube API through a CORS proxy.

import {
  PROXY_URL,
  INNERTUBE_API_KEY,
  INNERTUBE_CLIENT_VERSION,
} from './constants.js';

const INNERTUBE_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

/**
 * Fetch all video data needed for document generation.
 * @param {string} videoId
 * @param {AbortSignal} [signal]
 * @returns {Promise<Object>} Structured video data
 */
export async function fetchVideoData(videoId, signal) {
  let playerResponse;

  try {
    playerResponse = await fetchViaInnertube(videoId, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    playerResponse = await fetchViaPageScrape(videoId, signal);
  }

  return parsePlayerResponse(playerResponse, videoId);
}

async function fetchViaInnertube(videoId, signal) {
  const body = {
    videoId,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: INNERTUBE_CLIENT_VERSION,
        hl: 'en',
      },
    },
  };

  const resp = await fetch(`${PROXY_URL}/${INNERTUBE_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) throw new Error(`Innertube API returned ${resp.status}`);
  return resp.json();
}

async function fetchViaPageScrape(videoId, signal) {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const resp = await fetch(`${PROXY_URL}/${pageUrl}`, { signal });

  if (!resp.ok) throw new Error(`Page fetch returned ${resp.status}`);
  const html = await resp.text();

  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) throw new Error('Could not extract player response from page HTML');

  return JSON.parse(match[1]);
}

function parsePlayerResponse(data, videoId) {
  const details = data.videoDetails || {};
  const microformat = data.microformat?.playerMicroformatRenderer || {};

  if (details.isPrivate) {
    throw new Error('This video is private');
  }
  if (details.isLiveContent && details.isLive) {
    throw new Error('Live streams are not supported');
  }

  return {
    id: details.videoId || videoId,
    title: details.title || 'Untitled',
    author: details.author || 'Unknown',
    channelId: details.channelId || '',
    lengthSeconds: parseInt(details.lengthSeconds, 10) || 0,
    description: details.shortDescription || '',
    publishDate: microformat.publishDate || '',
    thumbnailUrl: getBestThumbnail(details.thumbnail?.thumbnails),
    storyboardSpec: extractStoryboardSpec(data),
    captionTracks: extractCaptionTracks(data),
    chapters: extractChapters(data, details.shortDescription),
  };
}

function getBestThumbnail(thumbnails) {
  if (!thumbnails?.length) return '';
  return thumbnails.reduce((best, t) => (t.width > best.width ? t : best)).url;
}

function extractStoryboardSpec(data) {
  return (
    data.storyboards?.playerStoryboardSpecRenderer?.spec ||
    data.storyboards?.playerLiveStoryboardSpecRenderer?.spec ||
    ''
  );
}

function extractCaptionTracks(data) {
  const tracks =
    data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return tracks.map((t) => ({
    baseUrl: t.baseUrl,
    languageCode: t.languageCode,
    kind: t.kind || '',
    name: t.name?.simpleText || t.languageCode,
  }));
}

function extractChapters(data, description) {
  // Try structured chapters from player overlays
  const chapters = extractStructuredChapters(data);
  if (chapters.length > 0) return chapters;

  // Fallback: parse timestamps from description
  return parseDescriptionChapters(description);
}

function extractStructuredChapters(data) {
  try {
    const markers =
      data.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer
        ?.decoratedPlayerBarRenderer?.playerBar?.multiMarkersPlayerBarRenderer
        ?.markersMap;

    if (!markers) return [];

    for (const entry of markers) {
      if (entry.key === 'DESCRIPTION_CHAPTERS' || entry.key === 'AUTO_CHAPTERS') {
        const chapterMarkers = entry.value?.chapters || [];
        return chapterMarkers.map((c) => ({
          startTime: parseInt(c.chapterRenderer?.timeRangeStartMillis, 10) / 1000 || 0,
          title: c.chapterRenderer?.title?.simpleText || '',
        }));
      }
    }
  } catch {
    // Fall through to description parsing
  }
  return [];
}

function parseDescriptionChapters(description) {
  if (!description) return [];

  const lines = description.split('\n');
  const chapters = [];
  const timestampRegex = /(?:^|\s)(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\s+[-–—]?\s*(.+))?/;

  for (const line of lines) {
    const match = line.match(timestampRegex);
    if (!match) continue;

    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const title = (match[4] || line.replace(timestampRegex, '')).trim();

    chapters.push({
      startTime: hours * 3600 + minutes * 60 + seconds,
      title,
    });
  }

  // Only return if we found at least 3 timestamps (likely intentional chapters)
  return chapters.length >= 3 ? chapters : [];
}

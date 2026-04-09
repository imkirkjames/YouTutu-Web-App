// YouTutu PWA — Storyboard Pipeline
// Parses YouTube storyboard spec, fetches sprite sheets, slices into individual frames.

import { PROXY_URL, STORYBOARD_JPEG_QUALITY, BLACK_FRAME_THRESHOLD } from './constants.js';

/**
 * Fetch and slice all storyboard frames from the highest resolution level.
 * @param {string} spec - Raw storyboard spec string from player response
 * @param {number} videoLengthSeconds
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{timestamp: number, dataUrl: string}>>}
 */
export async function fetchStoryboardFrames(spec, videoLengthSeconds, signal) {
  if (!spec) return [];

  const level = parseStoryboardSpec(spec);
  if (!level) return [];

  const sheetUrls = buildSheetUrls(level);
  const sheets = await fetchAllSheets(sheetUrls, signal);
  const frames = sliceAllFrames(sheets, level);

  return frames.filter((f) => !isBlackFrame(f.imageData));
}

/**
 * Parse the pipe-delimited storyboard spec and return the highest resolution level.
 *
 * Spec format:
 *   baseUrl|w1|h1|count1|cols1|rows1|interval1|...sigh1|w2|h2|count2|cols2|rows2|interval2|...sigh2|...
 *
 * The baseUrl contains placeholders:
 *   $L = level index, $N = sheet filename (e.g. "M0", "M1"), $M = sheet number
 */
function parseStoryboardSpec(spec) {
  const parts = spec.split('|');
  if (parts.length < 8) return null;

  const baseUrl = parts[0];

  // Each level is a group of 7 values after the base URL
  // Some specs use 8 values per level (extra sigh/name param)
  const levels = [];
  let i = 1;
  const FIELDS_PER_LEVEL = 7;

  while (i + FIELDS_PER_LEVEL - 1 < parts.length) {
    const width = parseInt(parts[i], 10);
    const height = parseInt(parts[i + 1], 10);
    const count = parseInt(parts[i + 2], 10);
    const columns = parseInt(parts[i + 3], 10);
    const rows = parseInt(parts[i + 4], 10);
    const intervalMs = parseInt(parts[i + 5], 10);
    const sigh = parts[i + 6];

    if (width > 0 && height > 0 && count > 0) {
      levels.push({
        index: levels.length,
        baseUrl,
        width,
        height,
        count,
        columns,
        rows,
        intervalMs,
        sigh,
      });
    }

    // Try to detect if there's an 8th field (some specs have variable-length levels)
    // by checking if the next group starts with a reasonable width value
    const nextStart = i + FIELDS_PER_LEVEL;
    if (nextStart < parts.length) {
      const nextVal = parseInt(parts[nextStart], 10);
      // If next value looks like a width (> 10 pixels), it's the next level
      // Otherwise, skip one extra field
      if (isNaN(nextVal) || nextVal < 10) {
        i = nextStart + 1;
        continue;
      }
    }

    i = nextStart;
  }

  // Return the highest resolution level (last one)
  return levels.length > 0 ? levels[levels.length - 1] : null;
}

function buildSheetUrls(level) {
  const framesPerSheet = level.columns * level.rows;
  const sheetCount = Math.ceil(level.count / framesPerSheet);
  const urls = [];

  for (let i = 0; i < sheetCount; i++) {
    let url = level.baseUrl
      .replace('$L', String(level.index))
      .replace('$N', `M${i}`)
      .replace('$M', String(i));

    // Append sigh parameter if present
    if (level.sigh) {
      url += (url.includes('?') ? '&' : '?') + `sigh=${level.sigh}`;
    }

    urls.push(url);
  }

  return urls;
}

async function fetchAllSheets(urls, signal) {
  const promises = urls.map(async (url, index) => {
    const proxyUrl = `${PROXY_URL}/${url}`;
    const resp = await fetch(proxyUrl, { signal });
    if (!resp.ok) throw new Error(`Storyboard sheet ${index} fetch failed: ${resp.status}`);

    const blob = await resp.blob();
    const img = await createImageBitmap(blob);
    return { img, index };
  });

  const results = await Promise.all(promises);
  return results.sort((a, b) => a.index - b.index);
}

function sliceAllFrames(sheets, level) {
  const canvas = new OffscreenCanvas(level.width, level.height);
  const ctx = canvas.getContext('2d');
  const frames = [];
  let globalFrameIndex = 0;

  for (const { img } of sheets) {
    const framesInSheet = Math.min(
      level.columns * level.rows,
      level.count - globalFrameIndex
    );

    for (let f = 0; f < framesInSheet; f++) {
      const col = f % level.columns;
      const row = Math.floor(f / level.columns);
      const sx = col * level.width;
      const sy = row * level.height;

      ctx.clearRect(0, 0, level.width, level.height);
      ctx.drawImage(img, sx, sy, level.width, level.height, 0, 0, level.width, level.height);

      const imageData = ctx.getImageData(0, 0, level.width, level.height);
      const timestamp = globalFrameIndex * (level.intervalMs / 1000);

      frames.push({
        timestamp,
        imageData,
        dataUrl: null, // lazily converted to save memory
      });

      globalFrameIndex++;
    }

    img.close();
  }

  return frames;
}

function isBlackFrame(imageData) {
  const data = imageData.data;
  let sum = 0;
  let count = 0;

  // Sample every 16th pixel for speed
  for (let i = 0; i < data.length; i += 64) {
    sum += data[i] + data[i + 1] + data[i + 2]; // R + G + B
    count += 3;
  }

  const mean = sum / count;
  return mean < BLACK_FRAME_THRESHOLD;
}

/**
 * Convert selected frames to data URLs using a visible canvas (must be called from main thread).
 * @param {Array} frames - Frames with imageData
 * @returns {Array<{timestamp: number, dataUrl: string}>}
 */
export function framesToDataUrls(frames) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  return frames.map((frame) => {
    canvas.width = frame.imageData.width;
    canvas.height = frame.imageData.height;
    ctx.putImageData(frame.imageData, 0, 0);

    return {
      timestamp: frame.timestamp,
      dataUrl: canvas.toDataURL('image/jpeg', STORYBOARD_JPEG_QUALITY),
      chapterTitle: frame.chapterTitle || null,
    };
  });
}

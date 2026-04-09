// YouTutu PWA — Keyframe Detection
// Selects visually distinct frames using pixel differencing.

import {
  KEYFRAME_THRESHOLD,
  KEYFRAME_MIN_INTERVAL,
  KEYFRAME_CHAPTER_TOLERANCE,
  KEYFRAME_SAMPLE_WIDTH,
  KEYFRAME_SAMPLE_HEIGHT,
} from './constants.js';

/**
 * Detect keyframes from a sequence of storyboard frames.
 * @param {Array<{timestamp: number, imageData: ImageData}>} frames
 * @param {Array<{startTime: number, title: string}>} chapters
 * @returns {Array<{timestamp: number, imageData: ImageData, chapterTitle: string|null}>}
 */
export function detectKeyframes(frames, chapters = []) {
  if (frames.length === 0) return [];

  const canvas = new OffscreenCanvas(KEYFRAME_SAMPLE_WIDTH, KEYFRAME_SAMPLE_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Downsample all frames for fast comparison
  const downsampled = frames.map((frame) => {
    ctx.clearRect(0, 0, KEYFRAME_SAMPLE_WIDTH, KEYFRAME_SAMPLE_HEIGHT);
    ctx.putImageData(frame.imageData, 0, 0, 0, 0, KEYFRAME_SAMPLE_WIDTH, KEYFRAME_SAMPLE_HEIGHT);
    // putImageData doesn't scale — we need drawImage with an ImageBitmap or temporary canvas
    return null;
  });

  // Use a different approach: compare frames directly at their native resolution
  // by sampling pixels from the original ImageData
  const candidates = findCandidateKeyframes(frames);
  const chapterFrames = findChapterFrames(frames, chapters);

  // Merge candidates with chapter frames
  const merged = mergeCandidates(candidates, chapterFrames, frames);

  // Deduplicate: remove keyframes too close together
  return deduplicateKeyframes(merged);
}

function findCandidateKeyframes(frames) {
  const candidates = [{ index: 0, diff: Infinity }]; // Always include first frame

  for (let i = 1; i < frames.length; i++) {
    const diff = computeFrameDiff(frames[i - 1].imageData, frames[i].imageData);
    if (diff > KEYFRAME_THRESHOLD) {
      candidates.push({ index: i, diff });
    }
  }

  return candidates;
}

function computeFrameDiff(imageDataA, imageDataB) {
  const a = imageDataA.data;
  const b = imageDataB.data;
  const len = Math.min(a.length, b.length);

  let totalDiff = 0;
  let sampleCount = 0;

  // Sample every 16th pixel, R channel only (every 64th byte = 16 pixels * 4 channels)
  for (let i = 0; i < len; i += 64) {
    totalDiff += Math.abs(a[i] - b[i]);
    sampleCount++;
  }

  return sampleCount > 0 ? totalDiff / sampleCount : 0;
}

function findChapterFrames(frames, chapters) {
  if (!chapters.length || !frames.length) return [];

  const chapterFrames = [];

  for (const chapter of chapters) {
    let bestIndex = -1;
    let bestDist = Infinity;

    for (let i = 0; i < frames.length; i++) {
      const dist = Math.abs(frames[i].timestamp - chapter.startTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestDist <= KEYFRAME_CHAPTER_TOLERANCE) {
      chapterFrames.push({
        index: bestIndex,
        diff: Infinity, // Force-include
        chapterTitle: chapter.title,
      });
    }
  }

  return chapterFrames;
}

function mergeCandidates(candidates, chapterFrames, frames) {
  // Build a set of all selected indices
  const indexMap = new Map();

  for (const c of candidates) {
    indexMap.set(c.index, {
      index: c.index,
      diff: c.diff,
      chapterTitle: null,
    });
  }

  for (const cf of chapterFrames) {
    const existing = indexMap.get(cf.index);
    if (existing) {
      existing.chapterTitle = cf.chapterTitle;
    } else {
      indexMap.set(cf.index, cf);
    }
  }

  // Sort by frame index (chronological order)
  return Array.from(indexMap.values())
    .sort((a, b) => a.index - b.index)
    .map((entry) => ({
      timestamp: frames[entry.index].timestamp,
      imageData: frames[entry.index].imageData,
      chapterTitle: entry.chapterTitle,
      diff: entry.diff,
    }));
}

function deduplicateKeyframes(keyframes) {
  if (keyframes.length <= 1) return keyframes;

  const result = [keyframes[0]];

  for (let i = 1; i < keyframes.length; i++) {
    const prev = result[result.length - 1];
    const curr = keyframes[i];

    if (curr.timestamp - prev.timestamp < KEYFRAME_MIN_INTERVAL) {
      // Keep the one with higher diff (more distinct), but chapter frames always win
      if (curr.chapterTitle && !prev.chapterTitle) {
        result[result.length - 1] = curr;
      } else if (!prev.chapterTitle && curr.diff > prev.diff) {
        result[result.length - 1] = curr;
      }
      // Otherwise keep previous
    } else {
      result.push(curr);
    }
  }

  return result;
}

// YouTutu PWA — AI Summarizer
// Manages Gemma 4 E2B inference via Web Worker + Transformers.js.
// Never blocks the main pipeline — summary is optional.

import { AI_MIN_STORAGE_GB } from './constants.js';

let worker = null;
let pendingResolve = null;
let pendingReject = null;

/**
 * Check if on-device summarization is available.
 * Returns true if the browser supports Web Workers and has enough storage.
 */
export function isSummarizerAvailable() {
  return typeof Worker !== 'undefined';
}

/**
 * Generate an AI summary of the transcript.
 * @param {Array<{text: string}>} transcript
 * @param {{title: string, author: string, chapters: Array<{startTime: number, title: string}>}} metadata
 * @returns {Promise<string|null>} Summary text or null
 */
export async function generateSummary(transcript, metadata) {
  if (!isSummarizerAvailable()) return null;
  if (!transcript?.length) return null;

  // Check available storage
  const hasStorage = await checkStorage();
  if (!hasStorage) {
    console.warn('Insufficient storage for AI model (~1.5GB needed)');
    return null;
  }

  return runInWorker(transcript, metadata);
}

async function checkStorage() {
  if (!navigator.storage?.estimate) return true; // Can't check, try anyway

  try {
    const estimate = await navigator.storage.estimate();
    const availableGB = (estimate.quota - estimate.usage) / (1024 ** 3);
    return availableGB >= AI_MIN_STORAGE_GB;
  } catch {
    return true; // Can't check, try anyway
  }
}

function runInWorker(transcript, metadata) {
  return new Promise((resolve, reject) => {
    // Clean up any previous worker
    if (worker) {
      worker.terminate();
    }

    pendingResolve = resolve;
    pendingReject = reject;

    try {
      worker = new Worker('/workers/ai-worker.js', { type: 'module' });
    } catch {
      resolve(null);
      return;
    }

    worker.onmessage = (e) => {
      const { type, data } = e.data;

      switch (type) {
        case 'progress':
          // Could update UI progress here
          console.log(`AI: ${data.stage} ${data.percent ? data.percent + '%' : ''}`);
          break;
        case 'result':
          cleanup();
          pendingResolve?.(data.summary);
          break;
        case 'error':
          cleanup();
          console.warn('AI worker error:', data.message);
          pendingResolve?.(null); // Don't reject — summary is optional
          break;
      }
    };

    worker.onerror = (err) => {
      cleanup();
      console.warn('AI worker crashed:', err.message);
      pendingResolve?.(null);
    };

    // Build transcript text
    const transcriptText = transcript.map((seg) => seg.text).join(' ');
    const chaptersText = metadata.chapters?.length
      ? metadata.chapters.map((ch) => ch.title).join(', ')
      : 'None';

    worker.postMessage({
      type: 'generate',
      data: {
        transcriptText,
        title: metadata.title,
        author: metadata.author,
        chapters: chaptersText,
      },
    });
  });
}

function cleanup() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pendingResolve = null;
  pendingReject = null;
}

// YouTutu PWA — App Logic
// Orchestrates the processing pipeline and manages UI views.

import { extractVideoId } from './url-parser.js';
import { fetchVideoData } from './youtube-api.js';
import { fetchStoryboardFrames, framesToDataUrls } from './storyboard.js';
import { fetchTranscript } from './transcript.js';
import { detectKeyframes } from './keyframes.js';
import { renderHTML } from './renderer.js';
import { generateSummary, isSummarizerAvailable } from './summarizer.js';

// --- DOM Elements ---
const inputView = document.getElementById('input-view');
const processingView = document.getElementById('processing-view');
const resultView = document.getElementById('result-view');

const urlForm = document.getElementById('url-form');
const urlInput = document.getElementById('url-input');
const generateBtn = document.getElementById('generate-btn');
const videoTitlePreview = document.getElementById('video-title-preview');
const progressSteps = document.getElementById('progress-steps');
const cancelBtn = document.getElementById('cancel-btn');

const saveBtn = document.getElementById('save-btn');
const shareBtn = document.getElementById('share-btn');
const openBtn = document.getElementById('open-btn');
const anotherBtn = document.getElementById('another-btn');
const resultIframe = document.getElementById('result-iframe');

// --- State ---
let abortController = null;
let currentBlobUrl = null;
let currentHtml = null;
let currentTitle = '';

// --- View Management ---
function showView(view) {
  inputView.classList.remove('active');
  processingView.classList.remove('active');
  resultView.classList.remove('active');
  view.classList.add('active');
}

function setStepStatus(step, status) {
  const el = progressSteps.querySelector(`[data-step="${step}"]`);
  if (!el) return;
  el.classList.remove('active', 'done', 'error');
  if (status !== 'pending') el.classList.add(status);
}

function resetAllSteps() {
  progressSteps.querySelectorAll('.step').forEach((el) => {
    el.classList.remove('active', 'done', 'error');
  });
}

function showError(message) {
  // Remove existing error
  const existing = inputView.querySelector('.error-message');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = message;
  urlForm.appendChild(div);
}

function clearError() {
  const existing = inputView.querySelector('.error-message');
  if (existing) existing.remove();
}

// --- Processing Pipeline ---
async function processVideo(videoId) {
  abortController = new AbortController();
  const { signal } = abortController;

  resetAllSteps();
  showView(processingView);
  videoTitlePreview.textContent = 'Loading...';

  try {
    // Step 1: Fetch video metadata
    setStepStatus('metadata', 'active');
    const videoData = await fetchVideoData(videoId, signal);
    setStepStatus('metadata', 'done');

    currentTitle = videoData.title;
    videoTitlePreview.textContent = videoData.title;

    // Step 2 & 3: Fetch storyboards and transcript in parallel
    setStepStatus('storyboards', 'active');
    setStepStatus('transcript', 'active');

    // Start AI summary in parallel (non-blocking)
    let summaryPromise = null;
    if (isSummarizerAvailable()) {
      setStepStatus('summary', 'active');
    }

    const [frames, transcript] = await Promise.all([
      fetchStoryboardFrames(videoData.storyboardSpec, videoData.lengthSeconds, signal)
        .then((result) => { setStepStatus('storyboards', 'done'); return result; })
        .catch((err) => {
          if (signal.aborted) throw err;
          setStepStatus('storyboards', 'error');
          console.warn('Storyboard fetch failed:', err);
          return [];
        }),
      fetchTranscript(videoData.captionTracks, signal)
        .then((result) => { setStepStatus('transcript', 'done'); return result; })
        .catch((err) => {
          if (signal.aborted) throw err;
          setStepStatus('transcript', 'error');
          console.warn('Transcript fetch failed:', err);
          return [];
        }),
    ]);

    // Start summary after transcript is available
    if (isSummarizerAvailable() && transcript.length > 0) {
      summaryPromise = generateSummary(transcript, videoData)
        .then((result) => { setStepStatus('summary', 'done'); return result; })
        .catch((err) => {
          console.warn('Summary generation failed:', err);
          setStepStatus('summary', 'error');
          return null;
        });
    } else {
      setStepStatus('summary', 'done');
    }

    // Step 4: Detect keyframes
    setStepStatus('keyframes', 'active');
    const keyframeSelection = frames.length > 0
      ? detectKeyframes(frames, videoData.chapters)
      : [];

    // Convert selected keyframes to data URLs
    const keyframes = framesToDataUrls(keyframeSelection);
    setStepStatus('keyframes', 'done');

    // Wait for summary (with timeout — don't block forever)
    let summary = null;
    if (summaryPromise) {
      summary = await Promise.race([
        summaryPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 60000)), // 60s timeout
      ]);
    }

    // Step 5: Render HTML document
    setStepStatus('rendering', 'active');
    currentHtml = renderHTML({
      ...videoData,
      keyframes,
      transcript,
      summary,
    });
    setStepStatus('rendering', 'done');

    // Show result
    displayResult(currentHtml);
  } catch (err) {
    if (signal.aborted) {
      showView(inputView);
      return;
    }
    console.error('Processing failed:', err);
    showView(inputView);
    showError(err.message || 'Processing failed. Please try again.');
  } finally {
    abortController = null;
  }
}

function displayResult(html) {
  // Clean up previous blob URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
  }

  const blob = new Blob([html], { type: 'text/html' });
  currentBlobUrl = URL.createObjectURL(blob);
  resultIframe.src = currentBlobUrl;

  // Show/hide share button based on Web Share API support
  shareBtn.style.display = navigator.share ? '' : 'none';

  showView(resultView);
}

// --- Event Handlers ---
urlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  const videoId = extractVideoId(urlInput.value);
  if (!videoId) {
    showError('Please enter a valid YouTube URL');
    return;
  }

  processVideo(videoId);
});

cancelBtn.addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
  }
});

saveBtn.addEventListener('click', () => {
  if (!currentHtml) return;

  const blob = new Blob([currentHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = currentTitle
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60)
    .toLowerCase();

  a.href = url;
  a.download = `yoututu-${safeName || 'notes'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

shareBtn.addEventListener('click', async () => {
  if (!currentHtml || !navigator.share) return;

  const file = new File(
    [currentHtml],
    `yoututu-${currentTitle.substring(0, 40)}.html`,
    { type: 'text/html' }
  );

  try {
    await navigator.share({
      title: `${currentTitle} — YouTutu Notes`,
      files: [file],
    });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Share failed:', err);
    }
  }
});

openBtn.addEventListener('click', () => {
  if (!currentBlobUrl) return;
  window.open(currentBlobUrl, '_blank');
});

anotherBtn.addEventListener('click', () => {
  showView(inputView);
  urlInput.value = '';
  urlInput.focus();
});

// --- Share Target / URL Param Handling ---
function checkForSharedUrl() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('url') || params.get('text') || '';

  if (shared) {
    const videoId = extractVideoId(shared);
    if (videoId) {
      urlInput.value = shared;
      // Clean URL without reloading
      history.replaceState(null, '', '/');
      processVideo(videoId);
    } else {
      urlInput.value = shared;
    }
  }
}

// Initialize
checkForSharedUrl();

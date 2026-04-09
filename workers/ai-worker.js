// YouTutu PWA — AI Worker
// Runs Gemma 4 E2B inference via Transformers.js in a Web Worker.
// Supports WebGPU (Chrome) with WASM fallback (Firefox).

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

// Configure Transformers.js for worker environment
env.allowLocalModels = false;

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const DTYPE = 'q4';

let generator = null;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'generate') {
    try {
      await generate(data);
    } catch (err) {
      self.postMessage({
        type: 'error',
        data: { message: err.message || 'Generation failed' },
      });
    }
  }
};

async function generate({ transcriptText, title, author, chapters }) {
  // Load model if not cached
  if (!generator) {
    self.postMessage({ type: 'progress', data: { stage: 'loading_model', percent: 0 } });

    // Detect device
    let device = 'wasm';
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) device = 'webgpu';
      } catch {
        // WebGPU not available
      }
    }

    generator = await pipeline('text-generation', MODEL_ID, {
      dtype: DTYPE,
      device,
      progress_callback: (progress) => {
        if (progress.status === 'progress') {
          self.postMessage({
            type: 'progress',
            data: { stage: 'downloading', percent: Math.round(progress.progress) },
          });
        }
      },
    });

    self.postMessage({ type: 'progress', data: { stage: 'model_ready' } });
  }

  self.postMessage({ type: 'progress', data: { stage: 'generating' } });

  // Truncate transcript if extremely long (keep first ~100K chars)
  const maxChars = 100000;
  const truncatedTranscript = transcriptText.length > maxChars
    ? transcriptText.substring(0, maxChars) + '\n\n[Transcript truncated]'
    : transcriptText;

  const prompt = buildPrompt(truncatedTranscript, title, author, chapters);

  const output = await generator(prompt, {
    max_new_tokens: 512,
    temperature: 0.3,
    do_sample: true,
    top_p: 0.9,
  });

  // Extract generated text (remove the prompt)
  let summary = output[0].generated_text;

  // If the model returns the full conversation, extract just the response
  const modelTurnMarker = '<start_of_turn>model\n';
  const modelIdx = summary.lastIndexOf(modelTurnMarker);
  if (modelIdx !== -1) {
    summary = summary.substring(modelIdx + modelTurnMarker.length);
  }

  // Clean up any trailing turn markers
  summary = summary.replace(/<end_of_turn>/g, '').trim();

  self.postMessage({
    type: 'result',
    data: { summary },
  });
}

function buildPrompt(transcriptText, title, author, chapters) {
  return `<start_of_turn>user
Summarize this video transcript at medium detail.

Title: ${title}
Channel: ${author}
Chapters: ${chapters}

Transcript:
${transcriptText}

Provide a 2-3 sentence overview of WHAT the video covers and WHY it matters, followed by key takeaway bullets. Use plain language.<end_of_turn>
<start_of_turn>model
`;
}

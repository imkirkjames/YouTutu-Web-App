// YouTutu PWA — All hardcoded configuration
// To change a value, edit this file. No settings panel.

export const PROXY_URL = 'https://yoututu-proxy.YOUR_WORKER.workers.dev';

// AI Model
export const AI_MODEL = 'onnx-community/gemma-4-E2B-it-ONNX';
export const AI_DTYPE = 'q4';
export const AI_MIN_STORAGE_GB = 2;

// Keyframe detection
export const KEYFRAME_THRESHOLD = 25;
export const BLACK_FRAME_THRESHOLD = 10;
export const KEYFRAME_MIN_INTERVAL = 3; // seconds between keyframes
export const KEYFRAME_CHAPTER_TOLERANCE = 2; // seconds tolerance for chapter boundary matching
export const KEYFRAME_SAMPLE_WIDTH = 64;
export const KEYFRAME_SAMPLE_HEIGHT = 36;

// Transcript
export const PREFERRED_LANGUAGE = 'en';
export const MIN_SEGMENT_DURATION = 2; // seconds, for merging short segments

// YouTube Innertube API
export const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
export const INNERTUBE_CLIENT_VERSION = '2.20240101.00.00';

// Storyboard
export const STORYBOARD_JPEG_QUALITY = 0.8;

// App
export const APP_NAME = 'YouTutu';
export const APP_VERSION = '1.0.0';

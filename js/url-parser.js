// YouTutu PWA — YouTube URL parser
// Extracts video IDs from all common YouTube URL formats and shared text.

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const URL_PATTERNS = [
  // youtube.com/watch?v=VIDEO_ID
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/,
  // youtu.be/VIDEO_ID
  /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})/,
  // youtube.com/shorts/VIDEO_ID
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  // youtube.com/embed/VIDEO_ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  // youtube.com/v/VIDEO_ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
  // youtube.com/live/VIDEO_ID
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
];

/**
 * Extract a YouTube video ID from a URL string or shared text.
 * @param {string} input - URL, video ID, or text containing a YouTube URL
 * @returns {string|null} 11-character video ID or null
 */
export function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Direct video ID
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Try each URL pattern
  for (const pattern of URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}

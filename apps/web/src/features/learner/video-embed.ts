/**
 * Video Embed URL Normalizer
 *
 * Converts standard user-provided video links (YouTube watch pages, shortlinks, Vimeo pages)
 * into legitimate embed URLs that can safely load in <iframe> elements without
 * X-Frame-Options or browser blockages. Raw video files fall back to HTML5 <video>.
 */

export interface NormalizedVideoResult {
  embedUrl: string | null;
  isEmbed: boolean;
}

export function normalizeVideoEmbedUrl(rawUrl: string | undefined | null): NormalizedVideoResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { embedUrl: null, isEmbed: false };
  }

  const trimmed = rawUrl.trim();

  // YouTube watch / share / embed patterns:
  // e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ
  //      https://youtu.be/dQw4w9WgXcQ
  //      https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ
  //      https://www.youtube.com/embed/dQw4w9WgXcQ
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      isEmbed: true,
    };
  }

  // Vimeo patterns:
  // e.g. https://vimeo.com/123456789
  //      https://player.vimeo.com/video/123456789
  const vimeoMatch = trimmed.match(
    /(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)([0-9]+)/,
  );
  if (vimeoMatch && vimeoMatch[1]) {
    const videoId = vimeoMatch[1];
    return {
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
      isEmbed: true,
    };
  }

  // Non-embed URLs (e.g. direct MP4, WebM, Ogg, HLS streams)
  return {
    embedUrl: null,
    isEmbed: false,
  };
}

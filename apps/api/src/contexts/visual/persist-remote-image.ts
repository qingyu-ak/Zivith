import type { StoragePort } from '../../ports/index.js';

export interface PersistedRemoteImage {
  url: string;
  storageKey: string;
  mimeType: string;
  persisted: boolean;
  sourceUrl?: string;
}

function guessMime(contentType: string | null, url: string): string {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (mime && mime.startsWith('image/')) return mime;
  if (/\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  return 'image/png';
}

/**
 * Download a remote (or data:) image and store it in object storage so Media.url
 * does not depend on SiliconFlow temporary CDN links that expire / break I2V.
 * Falls back to the original URL when storage is missing or download fails.
 */
export async function persistRemoteImage(input: {
  url: string;
  storageKey: string;
  storage?: StoragePort;
  fetchImpl?: typeof fetch;
}): Promise<PersistedRemoteImage> {
  const sourceUrl = input.url.trim();
  if (!sourceUrl) {
    return {
      url: sourceUrl,
      storageKey: input.storageKey,
      mimeType: 'image/png',
      persisted: false,
    };
  }
  if (!input.storage) {
    return {
      url: sourceUrl,
      storageKey: input.storageKey,
      mimeType: guessMime(null, sourceUrl),
      persisted: false,
      sourceUrl,
    };
  }
  if (sourceUrl.startsWith('data:')) {
    // Keep SVG/data placeholders as-is — no need to store them.
    return {
      url: sourceUrl,
      storageKey: input.storageKey,
      mimeType: sourceUrl.slice(5, sourceUrl.indexOf(';')) || 'image/png',
      persisted: false,
      sourceUrl,
    };
  }
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return {
      url: sourceUrl,
      storageKey: input.storageKey,
      mimeType: guessMime(null, sourceUrl),
      persisted: false,
      sourceUrl,
    };
  }

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await fetchImpl(sourceUrl);
    if (!response.ok) {
      return {
        url: sourceUrl,
        storageKey: input.storageKey,
        mimeType: guessMime(null, sourceUrl),
        persisted: false,
        sourceUrl,
      };
    }
    const mimeType = guessMime(response.headers.get('content-type'), sourceUrl);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      return {
        url: sourceUrl,
        storageKey: input.storageKey,
        mimeType,
        persisted: false,
        sourceUrl,
      };
    }
    const stored = await input.storage.put({
      key: input.storageKey,
      body: bytes,
      content_type: mimeType,
    });
    // Keep non-http object URLs in Media.url so API routes re-sign on read
    // (signed MinIO URLs expire; storing them would break covers later).
    return {
      url: stored.url,
      storageKey: stored.key,
      mimeType,
      persisted: true,
      sourceUrl,
    };
  } catch (error) {
    console.warn(
      '[persist-remote-image] failed, keeping provider URL',
      error instanceof Error ? error.message : error,
    );
    return {
      url: sourceUrl,
      storageKey: input.storageKey,
      mimeType: guessMime(null, sourceUrl),
      persisted: false,
      sourceUrl,
    };
  }
}

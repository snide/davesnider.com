import type { SelectFile } from '$db/schema';

type ImageDetails = {
  width: number;
  height: number;
  original: {
    width: number;
    height: number;
    file_size: number;
    format: string;
  };
};

export type BuildImageResult = {
  url: string;
  resizedUrl: string;
  details?: ImageDetails;
};

export type FileRecordWithThumb = SelectFile & { thumb?: BuildImageResult };

export const getImageDetails = async (url: string): Promise<ImageDetails | undefined> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return undefined;
    }

    // Check content-type - Cloudflare returns image data instead of JSON if resize fails
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return undefined;
    }

    const metadata = await response.json();
    return metadata;
  } catch {
    return undefined;
  }
};

export const buildImage = async (urlFragment: string, options: string): Promise<BuildImageResult> => {
  try {
    const url = `https://files.davesnider.com/${urlFragment}`;
    const resizedUrl = `https://files.davesnider.com/cdn-cgi/image/${options}/${urlFragment}`;
    const detailsUrl = `https://files.davesnider.com/cdn-cgi/image/format=json,${options}/${urlFragment}`;
    const details = await getImageDetails(detailsUrl);
    if (!details) {
      return { url, resizedUrl };
    } else {
      return { url, resizedUrl, details };
    }
  } catch {
    const url = `https://files.davesnider.com/${urlFragment}`;
    return { url, resizedUrl: url };
  }
};

// Client-safe Cloudflare Image Resizing URL builder for R2-hosted files.
// Anything not on files.davesnider.com (or already resized) passes through.
const FILES_HOST = 'https://files.davesnider.com/';

export type CfImageOptions = {
  w?: number;
  h?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop';
  quality?: number;
};

export const cfImage = (url: string, options: CfImageOptions): string => {
  if (!url.startsWith(FILES_HOST) || url.includes('/cdn-cgi/image/')) return url;
  const parts = ['format=auto'];
  if (options.w) parts.push(`w=${Math.round(options.w)}`);
  if (options.h) parts.push(`h=${Math.round(options.h)}`);
  parts.push(`fit=${options.fit ?? 'scale-down'}`);
  parts.push(`quality=${options.quality ?? 82}`);
  return `${FILES_HOST}cdn-cgi/image/${parts.join(',')}/${url.slice(FILES_HOST.length)}`;
};

// `srcset` over several widths; with `aspect` (width / height) every entry
// is cropped to that ratio so the browser never downloads a taller original.
export const cfImageSrcset = (
  url: string,
  widths: number[],
  options: Omit<CfImageOptions, 'w' | 'h'> & { aspect?: number } = {}
): string | undefined => {
  if (!url.startsWith(FILES_HOST) || url.includes('/cdn-cgi/image/')) return undefined;
  const { aspect, ...rest } = options;
  return widths.map((w) => `${cfImage(url, { ...rest, w, h: aspect ? w / aspect : undefined })} ${w}w`).join(', ');
};

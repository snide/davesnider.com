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

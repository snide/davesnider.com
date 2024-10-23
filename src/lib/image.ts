import type { SelectFile } from '@db/schema';

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
  details: ImageDetails;
};

export type FileRecordWithThumb = SelectFile & { thumb?: BuildImageResult };

export const getImageDetails = async (url: string): Promise<ImageDetails | undefined> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.error('Error fetching image:', error);
    return undefined;
  }
};

export const buildImage = async (urlFragment: string, options: string) => {
  try {
    const url = `https://files.davesnider.com/${urlFragment}`;
    const resizedUrl = `https://files.davesnider.com/cdn-cgi/image/${options}/${urlFragment}`;
    const detailsUrl = `https://files.davesnider.com/cdn-cgi/image/format=json,${options}/${urlFragment}`;
    const details = await getImageDetails(detailsUrl);
    return { url, resizedUrl, details };
  } catch (error) {
    console.error('Error building image:', error);
  }
};

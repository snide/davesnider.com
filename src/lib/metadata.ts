// Grabs the demensions and other info of a transformed image
interface OriginalImageInfo {
  file_size: number;
  width: number;
  height: number;
  format: string;
}

interface ImageMetadata {
  width: number;
  height: number;
  original: OriginalImageInfo;
}

// Grabs the dimensions and other info of a transformed image
export const fetchMetadata = async (metadataUrl: string): Promise<ImageMetadata | null> => {
  try {
    const response = await fetch(metadataUrl);
    const data: ImageMetadata = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return null;
  }
};

// utils/generateThumbnail.ts

import { fetchMetadata } from '@lib/metadata';
import { type FilesRecord } from './xata-codegen';
import { type FilesRecordWithThumbs } from '@localTypes/files';
import { type ImageTransformations } from '@xata.io/client';

export async function generateThumbnail(
  fileRecord: FilesRecord,
  fit: ImageTransformations['fit'] = 'contain',
  width: string | number = 600,
  height: string | number = 600
): Promise<FilesRecordWithThumbs | FilesRecord> {
  if (!fileRecord.file || fileRecord.isHidden || fileRecord.fileTypeCategory !== 'image') {
    return fileRecord;
  }

  // convert width and height to numbers
  width = Number(width);
  height = Number(height);

  const { url, metadataUrl } = fileRecord.file.transform({
    height: height,
    width: width,
    format: 'auto',
    fit: fit,
    gravity: 'top'
  });

  const metadata = await fetchMetadata(metadataUrl);
  if (!metadata) {
    return fileRecord;
  }

  const thumb = {
    url,
    attributes: {
      width: metadata.width,
      height: metadata.height
    }
  };

  return { ...fileRecord, file: { ...fileRecord.file, thumb } };
}

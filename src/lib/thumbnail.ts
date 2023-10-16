// utils/generateThumbnail.ts

import { fetchMetadata } from '@lib/metadata';
import { type FilesRecord } from './xata-codegen';
import { type FilesRecordWithThumbs } from '@localTypes/files';
import { type ImageTransformations } from '@xata.io/client';
import { xata } from '@lib/xata';

export async function generateThumbnail(
  fileRecord: FilesRecord,
  fit: ImageTransformations['fit'] = 'contain',
  width: string | number = 600,
  height: string | number = 600
): Promise<FilesRecordWithThumbs | FilesRecord> {
  let fullFileRecord: FilesRecord = fileRecord;

  if (!fileRecord.file || fileRecord.isHidden || fileRecord.fileTypeCategory !== 'image') {
    return fileRecord;
  }

  // convert width and height to numbers
  width = Number(width);
  height = Number(height);

  // The files coming in from search don't have the full file record so we need an extra fetch
  // This should likely be removed once Xata has a better way to solve this
  if (fileRecord.file.url === undefined || fileRecord.file.url === '') {
    fullFileRecord = (await xata.db.files.read(fileRecord.id)) as FilesRecord;
  }

  // @ts-ignore-next-line
  const { url, metadataUrl } = fullFileRecord.file.transform({
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

  // @ts-ignore-next-line
  return { ...fileRecord, file: { ...fileRecord.file, thumb } };
}

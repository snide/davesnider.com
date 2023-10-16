import { type FilesRecordWithThumbs } from '@localTypes/files';

export const isPublicFile = (record: FilesRecordWithThumbs): boolean => {
  return !record.isHidden && !record.isFavorite;
};

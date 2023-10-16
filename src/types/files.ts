import { type FilesRecord } from '@lib/xata-codegen';

export interface FilesRecordWithThumbs extends FilesRecord {
  file: FilesRecord['file'] & {
    thumb?: {
      url: string;
      attributes: {
        width: number;
        height: number;
      };
    };
  };
}

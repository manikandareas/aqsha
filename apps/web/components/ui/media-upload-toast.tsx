'use client';

import * as React from 'react';

import { PlaceholderPlugin, UploadErrorCode } from '@platejs/media/react';
import { usePluginOption } from 'platejs/react';
import { toast } from '@/lib/toast';

export function MediaUploadToast() {
  useUploadErrorToast();

  return null;
}

const useUploadErrorToast = () => {
  const uploadError = usePluginOption(PlaceholderPlugin, 'error');

  React.useEffect(() => {
    if (!uploadError) return;

    const { code, data } = uploadError;

    switch (code) {
      case UploadErrorCode.INVALID_FILE_SIZE: {
        toast.error({
          title: 'Invalid file size',
          description: `The size of ${data.files
            .map((f) => f.name)
            .join(', ')} is invalid.`,
        });

        break;
      }
      case UploadErrorCode.INVALID_FILE_TYPE: {
        toast.error({
          title: 'Invalid file type',
          description: `The type of ${data.files
            .map((f) => f.name)
            .join(', ')} is invalid.`,
        });

        break;
      }
      case UploadErrorCode.TOO_LARGE: {
        toast.error({
          title: 'Files too large',
          description: `The size of ${data.files
            .map((f) => f.name)
            .join(', ')} is larger than ${data.maxFileSize}.`,
        });

        break;
      }
      case UploadErrorCode.TOO_LESS_FILES: {
        toast.error({
          title: 'Not enough files',
          description: `The minimum number of files is ${data.minFileCount} for ${data.fileType}.`,
        });

        break;
      }
      case UploadErrorCode.TOO_MANY_FILES: {
        toast.error({
          title: 'Too many files',
          description: `The maximum number of files is ${data.maxFileCount}${
            data.fileType ? ` for ${data.fileType}` : ''
          }.`,
        });

        break;
      }
    }
  }, [uploadError]);
};

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconUpload, IconX } from '@tabler/icons-react';
import { ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

export type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error';

export interface ImageUploaderValue {
  id: string;
  preview: string;
  url?: string;
  key?: string;
  status: UploadStatus;
  size?: number;
}

interface ImageUploaderProps {
  allowMultiple?: boolean;
  maxImages?: number;
  maxSizeMB?: number;
  title?: string;
  emptyHint?: string;
  className?: string;
  defaultPreviews?: string[];
  onChange?: (items: ImageUploaderValue[]) => void;
  imageClassName?: string; // 自定义图片容器的 className
  aspectRatio?: string; // 宽高比，例如 "16/9"
}

interface UploadItem extends ImageUploaderValue {
  file?: File;
}

const formatBytes = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

const uploadImageFile = async (file: File) => {
  const formData = new FormData();
  formData.append('files', file);

  const response = await fetch('/api/storage/upload-image', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 0 || !result.data?.urls?.length) {
    throw new Error(result.message || 'Upload failed');
  }

  // return result.data.urls[0] as string;
  return result.data.results[0];
};

export function ImageUploader({
  allowMultiple = false,
  maxImages = 1,
  maxSizeMB = 10,
  title,
  emptyHint,
  className,
  defaultPreviews,
  onChange,
  imageClassName,
  aspectRatio,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isInitializedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const isInternalChangeRef = useRef(false);
  // console.log('IU--defaultPreviews--0-->', defaultPreviews)

  // 使用 defaultPreviews 初始化 items，只在组件挂载时执行一次
  const [items, setItems] = useState<UploadItem[]>(() => {
    if (!defaultPreviews?.length) {
      return [];
    }
    // console.log('IU--defaultPreviews--1-->', defaultPreviews)
    return defaultPreviews.map((url, index) => ({
      id: `preset-${url}-${index}`,
      preview: url,
      url,
      status: 'uploaded' as UploadStatus,
    }));
  });

  const maxCount = allowMultiple ? maxImages : 1;
  const maxBytes = maxSizeMB * 1024 * 1024;

  // 更新 onChange ref
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 同步 defaultPreviews 的变化（只在外部变化时同步，避免循环）
  useEffect(() => {
    // 跳过初始化
    if (!isInitializedRef.current) {
      return;
    }

    // 如果是内部变化触发的，跳过
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    const defaultUrls = defaultPreviews || [];

    // 使用函数式更新来访问最新的 items
    setItems((currentItems) => {
      // 如果有正在上传的项目，不要更新
      const hasUploading = currentItems.some(item => item.status === 'uploading');
      if (hasUploading) {
        return currentItems;
      }

      const currentUrls = currentItems
        .filter((item) => item.status === 'uploaded' && item.url)
        .map((item) => item.url as string);

      // 比较当前 items 和 defaultPreviews 是否一致
      const isSame =
        defaultUrls.length === currentUrls.length &&
        defaultUrls.every((url, index) => url === currentUrls[index]);

      // 只有当不一致时才返回新的 items
      if (!isSame) {
        return defaultUrls.map((url, index) => ({
          id: `preset-${url}-${index}`,
          preview: url,
          url,
          status: 'uploaded' as UploadStatus,
        }));
      }

      return currentItems;
    });
  }, [defaultPreviews]);

  // 清理 blob URLs
  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.preview.startsWith('blob:')) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, [items]);

  // 当 items 变化时触发 onChange，但跳过初始化时的调用
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }

    // 只在所有项目都不是 uploading 状态时才触发回调
    const hasUploading = items.some(item => item.status === 'uploading');
    if (hasUploading) {
      return;
    }

    // 标记这是内部变化
    isInternalChangeRef.current = true;

    // console.log('IU--回调了--->')

    onChangeRef.current?.(
      items.map(({ id, preview, url, key, status, size }) => ({
        id,
        preview,
        url,
        key,
        status,
        size,
      }))
    );
  }, [items]);

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) {
      return;
    }

    const availableSlots = maxCount - items.length;
    if (availableSlots <= 0) {
      toast.error('Maximum number of images reached');
      return;
    }

    const filesToAdd = selectedFiles.slice(0, availableSlots).filter((file) => {
      if (file.size > maxBytes) {
        toast.error(`"${file.name}" exceeds the ${maxSizeMB}MB limit`);
        return false;
      }
      return true;
    });

    if (!filesToAdd.length) {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    const newItems = filesToAdd.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      preview: URL.createObjectURL(file),
      file,
      size: file.size,
      status: 'uploading' as UploadStatus,
    }));

    setItems((prev) => [...prev, ...newItems]);

    // Upload in parallel
    Promise.all(
      newItems.map(async (item) => {
        try {
          const itemJO = await uploadImageFile(item.file as File);
          // console.log('IU--接口获取了--->', itemJO)

          setItems((prev) => {
            // console.log('IU--接口后setItems--->', itemJO)
            const next = prev.map((current) => {
              if (current.id === item.id) {
                // Revoke the blob URL since we have the uploaded URL now
                if (current.preview.startsWith('blob:')) {
                  URL.revokeObjectURL(current.preview);
                }
                return {
                  ...current,
                  preview: itemJO.url, // Replace preview with uploaded URL
                  url: itemJO.url,
                  key: itemJO.key,
                  status: 'uploaded' as UploadStatus,
                  file: undefined,
                };
              }
              return current;
            });
            return next;
          });
        } catch (error: any) {
          console.error('Upload failed:', error);
          toast.error(
            error?.message ? `Upload failed: ${error.message}` : 'Upload failed'
          );
          setItems((prev) => {
            const next = prev.map((current) =>
              current.id === item.id
                ? { ...current, status: 'error' as UploadStatus }
                : current
            );
            return next;
          });
        }
      })
    );

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleRemove = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed?.preview.startsWith('blob:')) {
        URL.revokeObjectURL(removed.preview);
      }
      return next;
    });
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const countLabel = useMemo(
    () => `${items.length}/${maxCount}`,
    [items.length, maxCount]
  );

  return (
    <div className={cn('space-y-4', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={allowMultiple}
        onChange={handleSelect}
        className="hidden"
      />

      {title && (
        <div className="text-foreground flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            <ImageIcon className="text-primary h-4 w-4" />
            <span>{title}</span>
            <span className="text-primary text-xs">({countLabel})</span>
          </div>
        </div>
      )}

      <div
        className={cn(
          'flex flex-wrap gap-4',
          allowMultiple ? 'flex-wrap' : 'flex-nowrap'
        )}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group border-border bg-muted/50 hover:border-border hover:bg-muted relative overflow-hidden rounded-xl border p-1 shadow-sm transition",
              imageClassName
            )}
          >
            <div
              className="relative overflow-hidden rounded-lg"
              style={aspectRatio ? { aspectRatio } : undefined}
            >
              <img
                src={item.preview}
                alt="Reference"
                className={cn(
                  "rounded-lg object-cover",
                  imageClassName ? "w-full h-full" : "h-32 w-32"
                )}
              />
              {item.size && (
                <span className="bg-background text-muted-foreground absolute bottom-2 left-2 rounded-md px-2 py-1 text-[10px] font-medium">
                  {formatBytes(item.size)}
                </span>
              )}
              {item.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-medium text-white">
                  Uploading...
                </div>
              )}
              {item.status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/70 text-xs font-medium text-white">
                  Failed
                </div>
              )}
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => handleRemove(item.id)}
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {items.length < maxCount && (
          <div className={cn(
            "group border-border bg-muted/50 hover:border-border hover:bg-muted relative overflow-hidden rounded-xl border border-dashed p-1 shadow-sm transition",
            imageClassName
          )}>
            <div
              className="relative overflow-hidden rounded-lg"
              style={aspectRatio ? { aspectRatio } : undefined}
            >
              <button
                type="button"
                className={cn(
                  "flex flex-col items-center justify-center gap-2",
                  imageClassName ? "w-full h-full" : "h-32 w-32"
                )}
                onClick={openFilePicker}
              >
                <div className="border-border flex h-10 w-10 items-center justify-center rounded-full border border-dashed">
                  <IconUpload className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium">Upload</span>
                <span className="text-primary text-xs">Max {maxSizeMB}MB</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {!title && (
        <div className="text-muted-foreground text-xs">{emptyHint}</div>
      )}
    </div>
  );
}

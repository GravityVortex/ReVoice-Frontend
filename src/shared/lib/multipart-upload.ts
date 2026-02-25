/**
 * S3-compatible Multipart Upload Utility
 * 
 * Features:
 * - Chunked upload with configurable chunk size (default: 16MB)
 * - Parallel uploads (default: 6 concurrent)
 * - Automatic retry with exponential backoff
 * - Progress tracking
 * - Abort capability
 */

export interface MultipartUploadConfig {
    /** Chunk size in bytes (default: 16MB) */
    chunkSize: number;
    /** Number of concurrent uploads (default: 6) */
    concurrency: number;
    /** Maximum retries per chunk (default: 3) */
    maxRetries: number;
    /** Base retry delay in ms (default: 1000) */
    retryDelayMs: number;
    /** Timeout per chunk in ms (default: 600000 = 10min) */
    timeoutMs: number;
    /** Progress callback */
    onProgress?: (progress: number, uploadedBytes: number, totalBytes: number) => void;
    /** Status callback for debugging */
    onStatus?: (status: string) => void;
}

export interface UploadResult {
    success: boolean;
    key: string;
    keyV: string;
    publicUrl: string;
    fileId: string;
    bucket: string;
}

interface PartInfo {
    partNumber: number;
    etag: string;
}

interface InitiateResponse {
    uploadId: string;
    key: string;
    keyV: string;
    fileId: string;
    bucket: string;
}

interface PresignPartResponse {
    presignedUrl: string;
    partNumber: number;
}

interface CompleteResponse {
    success: boolean;
    bucket: string;
    key: string;
    publicUrl: string;
    keyV: string;
    fileId: string;
}

const DEFAULT_CONFIG: MultipartUploadConfig = {
    chunkSize: 16 * 1024 * 1024, // 16MB
    concurrency: 6,
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 600000, // 10 minutes
};

type ApiResp<T> = { code: number; message?: string; data: T };

async function unwrapApiResp<T>(res: Response): Promise<T> {
    let json: ApiResp<T>;
    try {
        json = (await res.json()) as ApiResp<T>;
    } catch {
        throw new Error(`request failed (${res.status})`);
    }

    if (typeof json?.code !== 'number') {
        throw new Error('invalid response');
    }
    if (json.code !== 0) {
        throw new Error(json.message || 'request failed');
    }
    return json.data;
}

/**
 * Multipart Uploader Class
 * 
 * Usage:
 * ```typescript
 * const uploader = new MultipartUploader();
 * const result = await uploader.upload(file, {
 *   chunkSize: 32 * 1024 * 1024,
 *   concurrency: 6,
 *   onProgress: (progress, uploaded, total) => console.log(`${progress}%`)
 * });
 * ```
 */
export class MultipartUploader {
    private abortController: AbortController | null = null;
    private uploadId: string | null = null;
    private key: string | null = null;

    /**
     * Upload a file using multipart upload
     */
    async upload(
        file: File,
        config?: Partial<MultipartUploadConfig>
    ): Promise<UploadResult> {
        const cfg: MultipartUploadConfig = { ...DEFAULT_CONFIG, ...config };
        this.abortController = new AbortController();

        const totalSize = file.size;
        const totalParts = Math.ceil(totalSize / cfg.chunkSize);

        const startTime = performance.now();
        cfg.onStatus?.(`Starting multipart upload: ${totalParts} parts, ${cfg.chunkSize / 1024 / 1024}MB each, file size: ${(totalSize / 1024 / 1024).toFixed(2)}MB, concurrency: ${cfg.concurrency}`);

        // Step 1: Initiate multipart upload
        const initResponse = await this.initiateUpload(file.name, file.type);
        this.uploadId = initResponse.uploadId;
        this.key = initResponse.key;

        cfg.onStatus?.(`Upload initiated: ${initResponse.uploadId}`);

        try {
            // Step 2: Upload all parts with concurrency control
            const uploadStartTime = performance.now();
            const parts = await this.uploadAllParts(file, cfg, totalParts);
            const uploadEndTime = performance.now();

            const uploadDuration = (uploadEndTime - uploadStartTime) / 1000;
            const uploadSpeed = (totalSize / 1024 / 1024) / uploadDuration;
            cfg.onStatus?.(`All ${parts.length} parts uploaded in ${uploadDuration.toFixed(1)}s (${uploadSpeed.toFixed(2)} MB/s), completing...`);

            // Step 3: Complete multipart upload
            const completeResponse = await this.completeUpload(
                initResponse.uploadId,
                initResponse.key,
                parts
            );

            const totalDuration = (performance.now() - startTime) / 1000;
            cfg.onStatus?.(`Upload completed successfully in ${totalDuration.toFixed(1)}s`);
            cfg.onProgress?.(100, totalSize, totalSize);

            return {
                success: true,
                key: initResponse.key,
                keyV: initResponse.keyV,
                publicUrl: completeResponse.publicUrl,
                fileId: initResponse.fileId,
                bucket: initResponse.bucket,
            };
        } catch (error) {
            cfg.onStatus?.(`Upload failed: ${error}`);

            // Abort on failure to cleanup
            if (this.uploadId && this.key) {
                try {
                    await this.abortUpload(this.uploadId, this.key);
                    cfg.onStatus?.('Upload aborted and cleaned up');
                } catch (abortError) {
                    console.error('Failed to abort upload:', abortError);
                }
            }

            throw error;
        }
    }

    /**
     * Abort the current upload
     */
    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        if (this.uploadId && this.key) {
            this.abortUpload(this.uploadId, this.key).catch(console.error);
        }
    }

    /**
     * Initiate multipart upload
     */
    private async initiateUpload(
        filename: string,
        contentType: string
    ): Promise<InitiateResponse> {
        const response = await fetch('/api/storage/multipart/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, contentType }),
            signal: this.abortController?.signal,
        });

        return unwrapApiResp<InitiateResponse>(response);
    }

    /**
     * Upload all parts with concurrency control
     */
    private async uploadAllParts(
        file: File,
        cfg: MultipartUploadConfig,
        totalParts: number
    ): Promise<PartInfo[]> {
        // Track progress in a monotonic way: retries should not make overall progress go backwards.
        const uploadedBytes: number[] = new Array(totalParts).fill(0); // per-part max loaded
        let totalLoaded = 0;
        let completedParts = 0;

        // Create upload tasks
        const uploadTasks: (() => Promise<PartInfo>)[] = [];

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
            const start = (partNumber - 1) * cfg.chunkSize;
            const end = Math.min(start + cfg.chunkSize, file.size);
            const chunk = file.slice(start, end);

            uploadTasks.push(async () => {
                const part = await this.uploadPartWithRetry(
                    partNumber,
                    chunk,
                    cfg,
                    (loaded) => {
                        const idx = partNumber - 1;
                        const prev = uploadedBytes[idx] || 0;
                        const next = Math.max(prev, loaded);
                        if (next !== prev) {
                            uploadedBytes[idx] = next;
                            totalLoaded += next - prev;
                        }
                        // Keep UI from reaching 100% before the server-side complete() succeeds.
                        const progress = Math.min(99, Math.round((totalLoaded / file.size) * 100));
                        cfg.onProgress?.(progress, totalLoaded, file.size);
                    }
                );
                completedParts++;
                cfg.onStatus?.(`Part ${completedParts}/${totalParts} completed`);
                return part;
            });
        }

        // Execute with concurrency limit
        const results = await this.executeWithConcurrency(uploadTasks, cfg.concurrency);

        return results;
    }

    /**
     * Execute tasks with concurrency limit (pool-based approach)
     */
    private async executeWithConcurrency<T>(
        tasks: (() => Promise<T>)[],
        concurrency: number
    ): Promise<T[]> {
        const results: T[] = new Array(tasks.length);
        let taskIndex = 0;

        // Create worker function that processes tasks from the queue
        const worker = async (): Promise<void> => {
            while (taskIndex < tasks.length) {
                const currentIndex = taskIndex++;
                const task = tasks[currentIndex];
                const result = await task();
                results[currentIndex] = result; // Maintain order
            }
        };

        // Start N workers in parallel
        const workers: Promise<void>[] = [];
        for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
            workers.push(worker());
        }

        // Wait for all workers to complete
        await Promise.all(workers);

        return results;
    }


    /**
     * Upload a single part with retry logic
     */
    private async uploadPartWithRetry(
        partNumber: number,
        chunk: Blob,
        cfg: MultipartUploadConfig,
        onPartProgress: (loaded: number) => void
    ): Promise<PartInfo> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = cfg.retryDelayMs * Math.pow(2, attempt - 1);
                    cfg.onStatus?.(`Retrying part ${partNumber}, attempt ${attempt + 1}/${cfg.maxRetries + 1}, delay ${delay}ms`);
                    await this.sleep(delay);
                }

                return await this.uploadPart(partNumber, chunk, cfg.timeoutMs, onPartProgress);
            } catch (error) {
                lastError = error as Error;
                cfg.onStatus?.(`Part ${partNumber} failed: ${error}`);

                if (this.abortController?.signal.aborted) {
                    throw new Error('Upload aborted');
                }
            }
        }

        throw lastError || new Error(`Failed to upload part ${partNumber} after ${cfg.maxRetries} retries`);
    }

    /**
     * Upload a single part
     */
    private async uploadPart(
        partNumber: number,
        chunk: Blob,
        timeoutMs: number,
        onProgress: (loaded: number) => void
    ): Promise<PartInfo> {
        if (!this.uploadId || !this.key) {
            throw new Error('Upload not initialized');
        }

        // Get presigned URL for this part
        const presignResponse = await fetch('/api/storage/multipart/presign-part', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uploadId: this.uploadId,
                key: this.key,
                partNumber,
            }),
            signal: this.abortController?.signal,
        });

        const { presignedUrl } = await unwrapApiResp<PresignPartResponse>(presignResponse);

        // Upload the chunk using XMLHttpRequest for progress tracking
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Timeout
            xhr.timeout = timeoutMs;

            // Progress tracking
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    onProgress(e.loaded);
                }
            });

            // Completion
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    // Ensure part progress reaches the chunk size (some browsers may not emit a final progress event).
                    onProgress(chunk.size);
                    const etag = xhr.getResponseHeader('ETag');
                    resolve({
                        partNumber,
                        // ETag is required to complete a multipart upload, but browsers can be
                        // blocked from reading it unless the bucket CORS exposes "ETag".
                        // If it's not available here, the server will list parts on completion.
                        etag: etag ? etag.replace(/"/g, '') : '',
                    });
                } else {
                    reject(new Error(`Upload failed for part ${partNumber}: ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error(`Network error uploading part ${partNumber}`));
            xhr.ontimeout = () => reject(new Error(`Timeout uploading part ${partNumber}`));

            // Abort handling
            if (this.abortController) {
                this.abortController.signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new Error('Upload aborted'));
                });
            }

            xhr.open('PUT', presignedUrl);
            xhr.send(chunk);
        });
    }

    /**
     * Complete multipart upload
     */
    private async completeUpload(
        uploadId: string,
        key: string,
        parts: PartInfo[]
    ): Promise<CompleteResponse> {
        const response = await fetch('/api/storage/multipart/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, key, parts }),
            signal: this.abortController?.signal,
        });

        return unwrapApiResp<CompleteResponse>(response);
    }

    /**
     * Abort multipart upload
     */
    private async abortUpload(uploadId: string, key: string): Promise<void> {
        await fetch('/api/storage/multipart/abort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, key }),
        });
    }

    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

/**
 * Simple function wrapper for quick use
 */
export async function multipartUpload(
    file: File,
    config?: Partial<MultipartUploadConfig>
): Promise<UploadResult> {
    const uploader = new MultipartUploader();
    return uploader.upload(file, config);
}

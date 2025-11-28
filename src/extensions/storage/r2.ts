import type {
  StorageConfigs,
  StorageDownloadUploadOptions,
  StorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
} from '.';

/**
 * R2 storage provider configs
 * @docs https://developers.cloudflare.com/r2/
 */
export interface R2Configs extends StorageConfigs {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
  endpoint?: string;
  publicDomain?: string;
}

/**
 * R2 storage provider implementation
 * @website https://www.cloudflare.com/products/r2/
 */
export class R2Provider implements StorageProvider {
  readonly name = 'r2';
  configs: R2Configs;

  constructor(configs: R2Configs) {
    this.configs = configs;
  }

  async uploadFile(
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    try {
      const uploadBucket = options.bucket || this.configs.bucket;
      if (!uploadBucket) {
        return {
          success: false,
          error: 'Bucket is required',
          provider: this.name,
        };
      }

      const bodyArray =
        options.body instanceof Buffer
          ? new Uint8Array(options.body)
          : options.body;

      // R2 endpoint format: https://<accountId>.r2.cloudflarestorage.com
      // Use custom endpoint if provided, otherwise use default
      const endpoint =
        this.configs.endpoint ||
        `https://${this.configs.accountId}.r2.cloudflarestorage.com`;
      const url = `${endpoint}/${uploadBucket}/${options.key}`;

      const { AwsClient } = await import('aws4fetch');

      // R2 uses "auto" as region for S3 API compatibility
      const client = new AwsClient({
        accessKeyId: this.configs.accessKeyId,
        secretAccessKey: this.configs.secretAccessKey,
        region: this.configs.region || 'auto',
      });

      const headers: Record<string, string> = {
        'Content-Type': options.contentType || 'application/octet-stream',
        'Content-Disposition': options.disposition || 'inline',
        'Content-Length': bodyArray.length.toString(),
      };

      const request = new Request(url, {
        method: 'PUT',
        headers,
        body: bodyArray as any,
      });

      const response = await client.fetch(request);

      if (!response.ok) {
        return {
          success: false,
          error: `Upload failed: ${response.statusText}`,
          provider: this.name,
        };
      }

      const publicUrl = this.configs.publicDomain
        ? `${this.configs.publicDomain}/${options.key}`
        : url;

      return {
        success: true,
        location: url,
        bucket: uploadBucket,
        key: options.key,
        filename: options.key.split('/').pop(),
        url: publicUrl,
        provider: this.name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.name,
      };
    }
  }

  async downloadAndUpload(
    options: StorageDownloadUploadOptions
  ): Promise<StorageUploadResult> {
    try {
      const response = await fetch(options.url);
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP error! status: ${response.status}`,
          provider: this.name,
        };
      }

      if (!response.body) {
        return {
          success: false,
          error: 'No body in response',
          provider: this.name,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      return this.uploadFile({
        body,
        key: options.key,
        bucket: options.bucket,
        contentType: options.contentType,
        disposition: options.disposition,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.name,
      };
    }
  }

  /**
   * 生成一个签名的下载 URL
   * Generate presigned download URL for R2
   * @param key - File key in the bucket
   * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
   * @param bucket - Optional bucket name (uses default if not provided)
   * @returns Presigned URL string
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
    bucket?: string
  ): Promise<string> {
    const downloadBucket = bucket || this.configs.bucket;
    
    // If public domain is configured, return public URL directly
    // if (this.configs.publicDomain) {
    //   return `${this.configs.publicDomain}/${key}`;
    // }

    // Use AWS SDK v3 for proper presigned URL generation
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const endpoint =
      this.configs.endpoint ||
      `https://${this.configs.accountId}.r2.cloudflarestorage.com`;

    // Create S3 client for R2
    const s3Client = new S3Client({
      region: this.configs.region || 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: this.configs.accessKeyId,
        secretAccessKey: this.configs.secretAccessKey,
      },
      // Force path style for R2 compatibility
      forcePathStyle: false,
    });

    // Create GetObject command
    const command = new GetObjectCommand({
      Bucket: downloadBucket,
      Key: key,
      ResponseContentDisposition: 'attachment',
    });

    // Generate presigned URL with explicit expiration
    // Note: expiresIn must be between 1 and 604800 (7 days)
    const validExpiresIn = Math.max(1, Math.min(expiresIn, 604800));
    
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: validExpiresIn,
      // Ensure the signature includes the expiration
      signableHeaders: new Set(['host']),
    });

    // Verify the URL contains the expiration parameter
    const urlObj = new URL(signedUrl);
    const amzExpires = urlObj.searchParams.get('X-Amz-Expires');
    
    console.log('[R2Provider] 生成预签名 URL:', {
      key,
      requestedExpires: expiresIn,
      validExpires: validExpiresIn,
      urlExpires: amzExpires,
      hasExpiration: !!amzExpires,
    });

    return signedUrl;
  }
}

/**
 * Create R2 provider with configs
 */
export function createR2Provider(configs: R2Configs): R2Provider {
  return new R2Provider(configs);
}

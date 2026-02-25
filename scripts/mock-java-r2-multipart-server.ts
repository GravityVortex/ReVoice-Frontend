import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

// Load .env for scripts
import '../src/config';

import EncryptionUtil from '../src/shared/lib/EncryptionUtil';
import {
  MULTIPART_KEY_V,
  validateMultipartKeyForUser,
} from '../src/shared/lib/multipart-upload-contract';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  ListPartsCommand,
  type ListPartsCommandOutput,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type JavaResp<T> =
  | { code: 200; message: 'Success'; data: T }
  | { code: number; message: string; data: null; timestamp?: string };

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = val;
      i++;
    }
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function json(res: http.ServerResponse, status: number, body: JavaResp<any>) {
  const payload =
    status >= 400
      ? { ...body, timestamp: (body as any).timestamp || nowIso() }
      : body;
  const data = Buffer.from(JSON.stringify(payload));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(data.length));
  res.end(data);
}

async function readText(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  await once(req, 'end');
  return Buffer.concat(chunks).toString('utf8');
}

function normalizePrefix(p: string) {
  if (!p) return '';
  let s = p.trim();
  if (!s) return '';
  if (!s.startsWith('/')) s = `/${s}`;
  if (s.endsWith('/')) s = s.slice(0, -1);
  if (s === '/') return '';
  return s;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function getS3Client() {
  const endpoint = requireEnv('R2_ENDPOINT');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

function resolveEnvPrefix(args: Record<string, string>) {
  const envPrefix = (args.envPrefix || process.env.MOCK_JAVA_ENV_PREFIX || process.env.ENV || 'dev').trim();
  if (!envPrefix) throw new Error('envPrefix is required');
  if (envPrefix.includes('/')) throw new Error('envPrefix must be a single segment (no "/")');
  return envPrefix;
}

function joinFullKey(envPrefix: string, key: string) {
  return `${envPrefix}/${key}`;
}

function toCompleteEtag(etag: string) {
  const t = (etag || '').trim();
  if (!t) return t;
  if (t.startsWith('"') && t.endsWith('"')) return t;
  return `"${t.replace(/"/g, '')}"`;
}

async function listAllParts(client: S3Client, bucket: string, fullKey: string, uploadId: string) {
  const out: Array<{ partNumber: number; etagRaw: string }> = [];
  let marker: string | undefined = undefined;
  for (;;) {
    const outRes: ListPartsCommandOutput = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: fullKey,
        UploadId: uploadId,
        MaxParts: 1000,
        ...(marker ? { PartNumberMarker: marker } : {}),
      })
    );

    for (const p of outRes.Parts || []) {
      if (!p?.PartNumber || !p?.ETag) continue;
      out.push({ partNumber: p.PartNumber, etagRaw: String(p.ETag) });
    }

    if (!outRes.IsTruncated) break;
    if (!outRes.NextPartNumberMarker) break;
    marker = outRes.NextPartNumberMarker;
  }

  out.sort((a, b) => a.partNumber - b.partNumber);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.port ? Number.parseInt(args.port, 10) : 18080;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('invalid --port');
  }

  // Context path compatibility (Render uses "/video" in this project).
  const prefix = normalizePrefix(args.prefix || process.env.MOCK_JAVA_PREFIX || '');
  const envPrefix = resolveEnvPrefix(args);
  const proxyBase = (args.proxyBaseUrl || process.env.MOCK_JAVA_PROXY_BASE_URL || '').trim();

  const bucket = requireEnv('R2_BUCKET_NAME');
  const client = getS3Client();

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        return json(res, 404, { code: 404, message: 'Not Found', data: null });
      }
      if (req.method !== 'POST') {
        return json(res, 405, { code: 405, message: 'Method Not Allowed', data: null });
      }

      const url = new URL(req.url, 'http://localhost');
      const rawPath = url.pathname;
      const effectivePath =
        prefix && (rawPath === prefix || rawPath.startsWith(`${prefix}/`))
          ? rawPath.slice(prefix.length) || '/'
          : rawPath;

      // Only intercept multipart endpoints; optionally proxy everything else.
      const isMultipart = effectivePath.startsWith('/api/nextjs/r2/multipart/');
      if (!isMultipart) {
        if (!proxyBase) {
          return json(res, 404, { code: 404, message: 'Not Found', data: null });
        }

        const upstreamUrl = `${proxyBase.replace(/\/$/, '')}${effectivePath}${url.search}`;
        const text = await readText(req);
        const upstream = await fetch(upstreamUrl, {
          method: 'POST',
          headers: { 'Content-Type': String(req.headers['content-type'] || 'text/plain') },
          body: text,
        });
        const upstreamBody = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.end(upstreamBody);
        return;
      }

      const ct = String(req.headers['content-type'] || '');
      if (ct !== 'text/plain') {
        return json(res, 400, { code: 400, message: 'Content-Type must be text/plain', data: null });
      }

      const enc = await readText(req);
      let payload: any;
      try {
        payload = EncryptionUtil.decryptRequest(enc);
      } catch (e: any) {
        return json(res, 400, { code: 400, message: e?.message || 'decrypt failed', data: null });
      }

      const userId = String(payload.userId || '').trim();
      if (!userId) {
        return json(res, 400, { code: 400, message: 'userId is required', data: null });
      }

      // Mimic Java filter: controllers do not receive `time`.
      delete payload.time;

      if (effectivePath === '/api/nextjs/r2/multipart/initiate') {
        const filename = String(payload.filename || '').trim();
        const contentType = String(payload.contentType || 'video/mp4').trim() || 'video/mp4';
        if (!filename) {
          return json(res, 400, { code: 400, message: 'filename is required', data: null });
        }

        const fileId = crypto.randomUUID();
        const key = `${userId}/${fileId}/${MULTIPART_KEY_V}`;
        const fullKey = joinFullKey(envPrefix, key);

        const out = await client.send(
          new CreateMultipartUploadCommand({
            Bucket: bucket,
            Key: fullKey,
            ContentType: contentType,
          })
        );

        if (!out.UploadId) {
          return json(res, 500, { code: 500, message: 'Internal server error', data: null });
        }

        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: {
            uploadId: out.UploadId,
            fileId,
            bucket,
            keyV: MULTIPART_KEY_V,
            key,
          },
        });
      }

      if (effectivePath === '/api/nextjs/r2/multipart/presign-part') {
        const uploadId = String(payload.uploadId || '').trim();
        const key = String(payload.key || '').trim();
        const partNumber = Number(payload.partNumber);
        const expiresInSeconds = payload.expiresInSeconds ? Number(payload.expiresInSeconds) : 3600;

        if (!uploadId || !key || !Number.isInteger(partNumber)) {
          return json(res, 400, { code: 400, message: 'invalid params', data: null });
        }

        const keyCheck = validateMultipartKeyForUser(key, userId);
        if (!keyCheck.ok) {
          return json(res, 403, { code: 403, message: keyCheck.error, data: null });
        }

        const fullKey = joinFullKey(envPrefix, key);
        const url = await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: bucket,
            Key: fullKey,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: Math.max(60, Math.min(86400, Math.trunc(expiresInSeconds))) }
        );

        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: { partNumber, url },
        });
      }

      if (effectivePath === '/api/nextjs/r2/multipart/list-parts') {
        const uploadId = String(payload.uploadId || '').trim();
        const key = String(payload.key || '').trim();
        if (!uploadId || !key) {
          return json(res, 400, { code: 400, message: 'invalid params', data: null });
        }

        const keyCheck = validateMultipartKeyForUser(key, userId);
        if (!keyCheck.ok) {
          return json(res, 403, { code: 403, message: keyCheck.error, data: null });
        }

        const fullKey = joinFullKey(envPrefix, key);
        const parts = await listAllParts(client, bucket, fullKey, uploadId);
        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: {
            parts: parts.map((p) => ({
              partNumber: p.partNumber,
              etag: p.etagRaw.replace(/"/g, ''),
            })),
          },
        });
      }

      if (effectivePath === '/api/nextjs/r2/multipart/complete') {
        const uploadId = String(payload.uploadId || '').trim();
        const key = String(payload.key || '').trim();
        if (!uploadId || !key) {
          return json(res, 400, { code: 400, message: 'invalid params', data: null });
        }

        const keyCheck = validateMultipartKeyForUser(key, userId);
        if (!keyCheck.ok) {
          return json(res, 403, { code: 403, message: keyCheck.error, data: null });
        }

        const fullKey = joinFullKey(envPrefix, key);
        const parts = await listAllParts(client, bucket, fullKey, uploadId);
        if (!parts.length) {
          return json(res, 400, {
            code: 400,
            message: 'No parts uploaded for this uploadId',
            data: null,
          });
        }

        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: fullKey,
            UploadId: uploadId,
            MultipartUpload: {
              Parts: parts.map((p) => ({
                PartNumber: p.partNumber,
                ETag: toCompleteEtag(p.etagRaw),
              })),
            },
          })
        );

        const downloadUrl = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucket, Key: fullKey }),
          { expiresIn: 3600 * 4 }
        );

        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: {
            success: true,
            bucket,
            key,
            keyV: MULTIPART_KEY_V,
            fileId: keyCheck.fileId,
            downloadUrl,
          },
        });
      }

      if (effectivePath === '/api/nextjs/r2/multipart/abort') {
        const uploadId = String(payload.uploadId || '').trim();
        const key = String(payload.key || '').trim();
        if (!uploadId || !key) {
          return json(res, 400, { code: 400, message: 'invalid params', data: null });
        }

        const keyCheck = validateMultipartKeyForUser(key, userId);
        if (!keyCheck.ok) {
          return json(res, 403, { code: 403, message: keyCheck.error, data: null });
        }

        const fullKey = joinFullKey(envPrefix, key);
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: fullKey,
            UploadId: uploadId,
          })
        );

        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: { success: true },
        });
      }

      return json(res, 404, { code: 404, message: 'Not Found', data: null });
    } catch (e: any) {
      return json(res, 500, {
        code: 500,
        message: e?.message || 'Internal server error',
        data: null,
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  console.log(
    `mock-java multipart server: http://127.0.0.1:${addr.port}${prefix || ''} (envPrefix=${envPrefix})`
  );
  if (proxyBase) {
    console.log(`proxy fallback: ${proxyBase}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

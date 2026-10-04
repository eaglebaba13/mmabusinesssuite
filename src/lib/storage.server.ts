/** Node-only S3 adapter. Imported exclusively by API handlers and admin export. */
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { StorageError, storageBucket, storagePath, type StorageBucket } from "./storage-policy.ts";

export type StoredFile = {
  body: ReadableStream<Uint8Array>;
  size?: number;
  contentType?: string;
  contentRange?: string;
};
export interface StorageBackend {
  get(bucket: StorageBucket, path: string, range?: string): Promise<StoredFile>;
  exists(bucket: StorageBucket, path: string): Promise<boolean>;
  bucketExists(bucket: StorageBucket): Promise<boolean>;
  upload(
    bucket: StorageBucket,
    path: string,
    bytes: Uint8Array,
    contentType: string,
    upsert: boolean,
  ): Promise<void>;
  delete(bucket: StorageBucket, path: string): Promise<void>;
  listFiles(bucket: StorageBucket, prefix?: string): Promise<string[]>;
}
function status(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}
export function createMinioBackend(env: NodeJS.ProcessEnv = process.env): StorageBackend {
  if (typeof window !== "undefined") throw new Error("Storage credentials are server-only");
  const endpoint = env.MINIO_ENDPOINT;
  const accessKeyId = env.MINIO_ACCESS_KEY;
  const secretAccessKey = env.MINIO_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey)
    throw new StorageError(503, "Private storage is not configured");
  const parsed = new URL(endpoint);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new StorageError(503, "Invalid private storage endpoint");
  }
  const client = new S3Client({
    endpoint,
    region: env.MINIO_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const checked = (bucket: StorageBucket, path: string) => {
    storageBucket(bucket);
    storagePath(path);
  };
  return {
    async get(bucket, path, range) {
      checked(bucket, path);
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: path, Range: range }),
        );
        if (!result.Body) throw new StorageError(404, "File not found");
        return {
          body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          size: result.ContentLength,
          contentType: result.ContentType,
          contentRange: result.ContentRange,
        };
      } catch (error) {
        if (status(error) === 404) throw new StorageError(404, "File not found");
        if (status(error) === 416) throw new StorageError(416, "Invalid file range");
        throw error;
      }
    },
    async exists(bucket, path) {
      checked(bucket, path);
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
        return true;
      } catch (error) {
        if (status(error) === 404) return false;
        throw error;
      }
    },
    async bucketExists(bucket) {
      storageBucket(bucket);
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
      } catch (error) {
        if (status(error) === 404) return false;
        throw error;
      }
    },
    async upload(bucket, path, bytes, contentType, upsert) {
      checked(bucket, path);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: path,
            Body: bytes,
            ContentType: contentType,
            IfNoneMatch: upsert ? undefined : "*",
          }),
        );
      } catch (error) {
        if (status(error) === 412 || status(error) === 409)
          throw new StorageError(409, "A file already exists at this path");
        throw error;
      }
    },
    async delete(bucket, path) {
      checked(bucket, path);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
    },
    async listFiles(bucket, prefix = "") {
      storageBucket(bucket);
      storagePath(prefix, true);
      const files: string[] = [];
      let token: string | undefined;
      do {
        const result = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const row of result.Contents ?? []) if (row.Key) files.push(row.Key);
        token = result.IsTruncated ? result.NextContinuationToken : undefined;
        if (result.IsTruncated && !token) throw new StorageError(502, "Incomplete storage listing");
      } while (token);
      return files;
    },
  };
}

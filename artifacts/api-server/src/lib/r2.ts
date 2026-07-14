import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

const accountId = process.env.CF_R2_ACCOUNT_ID!;
const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY!;
const bucketName = process.env.CF_R2_BUCKET_NAME!;
// Derive endpoint from account ID; falls back to explicit CF_R2_ENDPOINT if set
const endpoint = process.env.CF_R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;

export const r2Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

export { bucketName };

export async function r2ListFiles(prefix: string): Promise<{ name: string; path: string; type: "file" | "directory"; size?: number; lastModified?: string }[]> {
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix.endsWith("/") ? prefix : prefix + "/",
    Delimiter: "/",
  });
  const response = await r2Client.send(command);

  const files: { name: string; path: string; type: "file" | "directory"; size?: number; lastModified?: string }[] = [];

  for (const dir of response.CommonPrefixes || []) {
    if (dir.Prefix) {
      const name = dir.Prefix.replace(prefix.endsWith("/") ? prefix : prefix + "/", "").replace(/\/$/, "");
      if (name) {
        files.push({ name, path: dir.Prefix, type: "directory" });
      }
    }
  }

  for (const obj of response.Contents || []) {
    if (obj.Key) {
      const name = obj.Key.replace(prefix.endsWith("/") ? prefix : prefix + "/", "");
      if (name && !name.includes("/")) {
        files.push({
          name,
          path: obj.Key,
          type: "file",
          size: obj.Size,
          lastModified: obj.LastModified?.toISOString(),
        });
      }
    }
  }

  return files;
}

export async function r2ReadFile(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await r2Client.send(command);
  const body = response.Body;
  if (!body) throw new Error("Empty file body");
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function r2ReadFileBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await r2Client.send(command);
  const body = response.Body;
  if (!body) throw new Error("Empty file body");
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function r2WriteFile(key: string, content: string, contentType = "text/plain"): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: content,
    ContentType: contentType,
  });
  await r2Client.send(command);
}

export async function r2WriteBuffer(key: string, content: Buffer, contentType = "application/octet-stream"): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: content,
    ContentType: contentType,
  });
  await r2Client.send(command);
}

export async function r2DeleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
  await r2Client.send(command);
}

export async function r2DeletePrefix(prefix: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const list = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await r2Client.send(list);
    for (const obj of response.Contents || []) {
      if (obj.Key) await r2DeleteFile(obj.Key);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
}

export async function r2RenameFile(oldKey: string, newKey: string): Promise<void> {
  const copy = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${oldKey}`,
    Key: newKey,
  });
  await r2Client.send(copy);
  await r2DeleteFile(oldKey);
}

/**
 * Lists ALL files under a prefix recursively (no Delimiter — returns the full tree).
 * Useful for AI context where we need to know about files in all subdirectories.
 */
export async function r2ListAllFiles(prefix: string, maxFiles = 200): Promise<{ name: string; path: string; type: "file"; size?: number }[]> {
  const normalizedPrefix = prefix.endsWith("/") ? prefix : prefix + "/";
  const files: { name: string; path: string; type: "file"; size?: number }[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: normalizedPrefix,
      ContinuationToken: continuationToken,
    });
    const response = await r2Client.send(command);
    for (const obj of response.Contents || []) {
      if (obj.Key) {
        const relativeName = obj.Key.replace(normalizedPrefix, "");
        // skip empty keys, platform files, and gitkeep markers
        if (relativeName && !relativeName.endsWith("/") && !relativeName.endsWith(".gitkeep")) {
          files.push({ name: relativeName, path: obj.Key, type: "file", size: obj.Size });
        }
      }
      if (files.length >= maxFiles) break;
    }
    continuationToken = files.length < maxFiles ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return files;
}

export async function r2GetPrefixSize(prefix: string): Promise<{ size: number; count: number }> {
  const list = new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix });
  const response = await r2Client.send(list);
  let size = 0;
  let count = 0;
  for (const obj of response.Contents || []) {
    size += obj.Size || 0;
    count++;
  }
  return { size, count };
}

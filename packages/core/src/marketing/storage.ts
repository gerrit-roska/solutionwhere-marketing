import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageEnv } from "./config";

// Project object storage (S3-compatible). No ListObjects — keys are tracked
// in Postgres (verification_batches.storage_key). Presigned GET URLs are
// short-lived inputs for tools like million-verifier:bulk, never durable
// asset URLs.

let cachedClient: S3Client | null = null;
let cachedBucket = "";

function s3(): { client: S3Client; bucket: string } {
  if (!cachedClient) {
    const env = storageEnv();
    cachedBucket = env.GRAPHED_STORAGE_BUCKET;
    cachedClient = new S3Client({
      region: "us-west-2",
      endpoint: env.GRAPHED_STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.GRAPHED_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.GRAPHED_STORAGE_SECRET_ACCESS_KEY,
      },
    });
  }
  return { client: cachedClient, bucket: cachedBucket };
}

export async function putText(
  key: string,
  body: string,
  contentType = "text/csv",
): Promise<void> {
  const { client, bucket } = s3();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function presignGet(
  key: string,
  seconds = 3600,
): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: seconds },
  );
}

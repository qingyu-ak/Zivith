import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StoragePort, StoragePutRequest } from '../ports/index.js';

export class S3StorageAdapter implements StoragePort {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl?: string,
  ) {}

  async put(request: StoragePutRequest): Promise<{ key: string; url: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: request.key,
        Body: request.body,
        ContentType: request.content_type,
        Metadata: request.metadata,
      }),
    );
    return {
      key: request.key,
      url: this.publicBaseUrl
        ? `${this.publicBaseUrl.replace(/\/$/, '')}/${request.key}`
        : `s3://${this.bucket}/${request.key}`,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  signedReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}

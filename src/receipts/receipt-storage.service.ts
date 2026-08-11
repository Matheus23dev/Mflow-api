import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class ReceiptStorageService {
  private readonly bucket = process.env.R2_BUCKET_NAME?.trim();
  private readonly client: S3Client | null;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const endpoint =
      process.env.R2_ENDPOINT?.trim() ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    this.client =
      endpoint && accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({
            region: 'auto',
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  isConfigured() {
    return Boolean(this.client && this.bucket);
  }

  async put(key: string, body: Buffer, contentType: string, checksum: string) {
    const client = this.ensureConfigured();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket!,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
        Metadata: { checksum },
      }),
    );
  }

  async get(key: string) {
    const client = this.ensureConfigured();
    const result = await client.send(
      new GetObjectCommand({ Bucket: this.bucket!, Key: key }),
    );
    if (!result.Body) {
      throw new ServiceUnavailableException(
        'O comprovante não pôde ser lido no armazenamento.',
      );
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async removeMany(keys: string[]) {
    if (!keys.length) return;
    const client = this.ensureConfigured();
    for (let index = 0; index < keys.length; index += 1000) {
      const chunk = keys.slice(index, index + 1000);
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket!,
          Delete: {
            Quiet: true,
            Objects: chunk.map((Key) => ({ Key })),
          },
        }),
      );
      if (result.Errors?.length) {
        throw new ServiceUnavailableException(
          'Alguns comprovantes não puderam ser apagados do armazenamento.',
        );
      }
    }
  }

  private ensureConfigured() {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'O armazenamento de comprovantes ainda não foi configurado.',
      );
    }
    return this.client;
  }
}

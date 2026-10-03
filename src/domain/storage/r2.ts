import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

export function r2Client() {
  const accountId = required('R2_ACCOUNT_ID')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
  })
}

export function publicUrl(key: string): string {
  const base = required('R2_PUBLIC_URL').replace(/\/$/, '')
  return `${base}/${key}`
}

export async function uploadObject(args: {
  key: string
  body: Buffer | Uint8Array
  contentType: string
}): Promise<string> {
  const client = r2Client()
  await client.send(
    new PutObjectCommand({
      Bucket: required('R2_BUCKET'),
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    })
  )
  return publicUrl(args.key)
}

export async function deleteObject(key: string): Promise<void> {
  const client = r2Client()
  await client.send(
    new DeleteObjectCommand({
      Bucket: required('R2_BUCKET'),
      Key: key,
    })
  )
}

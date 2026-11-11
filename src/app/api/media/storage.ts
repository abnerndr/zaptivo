import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client } from '@/domain/storage/r2'

function privateBucket(): string {
  const bucket = process.env.R2_PRIVATE_BUCKET
  if (!bucket || bucket === process.env.R2_BUCKET) throw new Error('R2_PRIVATE_BUCKET must be a separate private bucket')
  return bucket
}

function key(accountId: string, id: string): string {
  return `audio/account-${accountId}/${id}.ogg`
}

export async function putAudio(accountId: string, id: string, bytes: Buffer): Promise<void> {
  await r2Client().send(new PutObjectCommand({ Bucket: privateBucket(), Key: key(accountId, id), Body: bytes, ContentType: 'audio/ogg' }))
}

export async function getAudio(accountId: string, id: string): Promise<Uint8Array | null> {
  try {
    const result = await r2Client().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key(accountId, id) }))
    return result.Body ? await result.Body.transformToByteArray() : null
  } catch (error) {
    if (error && typeof error === 'object' && ('name' in error && (error.name === 'NoSuchKey' || error.name === 'NotFound'))) return null
    throw error
  }
}

// Reuse the handler directly so the original method, headers and body are
// preserved. In particular, this is not an HTTP redirect.
export { POST } from '@/app/api/whatsapp/webhook/route'

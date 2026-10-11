export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWahaEventConsumer } = await import(
      '@/domain/whatsapp/waha-event-consumer'
    )
    void startWahaEventConsumer()
  }
}

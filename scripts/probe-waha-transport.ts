/**
 * Sonda do transporte WAHA: a instância expõe SSE ou só WebSocket?
 *
 * Uso: pnpm exec tsx scripts/probe-waha-transport.ts
 *
 * Sai com código 1 e escreve a nota "não rodou" quando faltar env ou sessão.
 * Nunca imprime a API key.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  classifyWahaTransport,
  wahaEventsUrl,
} from '../src/domain/whatsapp/waha-transport'

const DATE = '2026-10-10'
const NOTE_PATH = resolve(
  process.cwd(),
  `docs/superpowers/notes/${DATE}-waha-transport.md`,
)

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file)
    } catch {
      // arquivo ausente: segue com o ambiente do processo
    }
  }
}

function writeNote(lines: string[]): void {
  mkdirSync(dirname(NOTE_PATH), { recursive: true })
  writeFileSync(NOTE_PATH, `${lines.join('\n')}\n`, 'utf8')
}

function failNotRan(missing: string[]): never {
  const message = `Sonda não rodou: faltou ${missing.join(', ')}.`
  console.error(message)
  writeNote([
    '# Transporte WAHA',
    '',
    `Data: ${DATE}`,
    '',
    message,
    '',
    'Transporte: indeterminado (a sonda não rodou; nenhuma resposta da instância foi observada).',
    '',
    'Não assumir SSE. Plano 7 parado até o humano apontar a instância (WAHA_BASE_URL, WAHA_API_KEY e uma WhatsappConfig com wahaSession).',
  ])
  process.exit(1)
}

async function firstSession(): Promise<string | null> {
  try {
    const { prisma } = await import('../src/domain/db/prisma')
    try {
      const row = await prisma.whatsappConfig.findFirst({
        select: { wahaSession: true },
        orderBy: { createdAt: 'asc' },
      })
      return row?.wahaSession ?? null
    } finally {
      await prisma.$disconnect()
      const { getPgPool } = await import('../src/domain/db/prisma')
      await getPgPool().end()
    }
  } catch (error) {
    console.error(
      'Falha ao ler WhatsappConfig:',
      error instanceof Error ? error.message : 'erro desconhecido',
    )
    return null
  }
}

async function main(): Promise<void> {
  loadEnvFiles()

  const baseUrl = process.env.WAHA_BASE_URL?.trim()
  const apiKey = process.env.WAHA_API_KEY?.trim()
  const missing: string[] = []
  if (!baseUrl) missing.push('WAHA_BASE_URL')
  if (!apiKey) missing.push('WAHA_API_KEY')
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (missing.length > 0) failNotRan(missing)

  const session = await firstSession()
  if (!session) failNotRan(['WhatsappConfig.wahaSession (sem sessão no banco ou banco inacessível)'])

  const url = wahaEventsUrl(baseUrl as string, session as string)
  let status = 0
  let contentType: string | null = null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey as string,
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    })
    status = res.status
    contentType = res.headers.get('content-type')
    // Não deixa o stream aberto
    controller.abort()
    await res.body?.cancel().catch(() => {})
  } catch {
    // erro de rede ou timeout: status 0, content-type null
  } finally {
    clearTimeout(timeout)
  }

  const transport = classifyWahaTransport({
    eventsStatus: status,
    eventsContentType: contentType,
  })

  writeNote([
    '# Transporte WAHA',
    '',
    `Data: ${DATE}`,
    `Session: ${session}`,
    `Status HTTP: ${status}`,
    `Content-Type: ${contentType ?? 'null'}`,
    '',
    `Transporte: ${transport}`,
  ])
  console.log(`Status ${status}; content-type ${contentType ?? 'null'}; transporte: ${transport}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'erro desconhecido')
  process.exit(1)
})

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Loader2, UsersRound } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Peek = {
  valid: boolean
  orgName?: string
  roleLabel?: string
  email?: string | null
  expiresAt?: string
  error?: string
  expired?: boolean
  accepted?: boolean
}

export default function JoinPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params.token === 'string' ? params.token : ''
  const router = useRouter()
  const { status } = useSession()

  const [peek, setPeek] = useState<Peek | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/peek`)
        const data = (await res.json()) as Peek
        if (!cancelled) setPeek(data)
      } catch {
        if (!cancelled) setPeek({ valid: false, error: 'Falha ao carregar convite' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const redeem = useCallback(async () => {
    if (!token || redeeming) return
    setRedeeming(true)
    setError(null)
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/redeem`, {
        method: 'POST',
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível aceitar o convite')
        return
      }
      setDone(true)
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Erro de rede ao aceitar o convite')
    } finally {
      setRedeeming(false)
    }
  }, [token, redeeming, router])

  useEffect(() => {
    if (status !== 'authenticated' || !peek?.valid || done || redeeming) return
    void redeem()
  }, [status, peek?.valid, done, redeeming, redeem])

  const inviteQs = `?invite=${encodeURIComponent(token)}`

  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <UsersRound className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl text-foreground">
          {peek?.valid ? `Entrar em ${peek.orgName}` : 'Convite'}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {!peek && 'Carregando convite…'}
          {peek && !peek.valid && (peek.error || 'Este convite não é mais válido.')}
          {peek?.valid && (
            <>
              Você foi convidado como <strong>{peek.roleLabel}</strong>
              {peek.email ? <> ({peek.email})</> : null}.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {(status === 'loading' ||
          !peek ||
          (status === 'authenticated' && peek.valid && !error)) && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {status === 'authenticated' ? 'Aceitando convite…' : 'Carregando…'}
          </div>
        )}

        {peek?.valid && status === 'unauthenticated' && (
          <div className="flex flex-col gap-3">
            <Link
              href={`/signup${inviteQs}`}
              className={cn(buttonVariants({ className: 'w-full' }))}
            >
              Criar conta
            </Link>
            <Link
              href={`/login${inviteQs}`}
              className={cn(
                buttonVariants({ variant: 'outline', className: 'w-full' }),
              )}
            >
              Já tenho conta — Entrar
            </Link>
          </div>
        )}

        {peek && !peek.valid && (
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: 'outline', className: 'w-full' }),
            )}
          >
            Ir para login
          </Link>
        )}

        {status === 'authenticated' && peek?.valid && error && (
          <Button
            onClick={() => void redeem()}
            disabled={redeeming}
            className="w-full"
          >
            {redeeming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Tentando…
              </>
            ) : (
              'Tentar novamente'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

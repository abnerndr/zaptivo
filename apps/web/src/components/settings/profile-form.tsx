'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Shield, User } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { ROLE_META } from './role-meta'
import { SettingsPanelHead } from './settings-panel-head'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function ProfileForm() {
  const t = useTranslations('Settings.profile')
  const tRoles = useTranslations('Settings.roles')
  const { user, profile, profileLoading, refreshProfile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [cpf, setCpf] = useState<string | null>(null)
  const [orgRoleName, setOrgRoleName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setEmail(profile.email ?? '')
    setAvatarUrl(profile.avatar_url)
  }, [profile])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok) return
        const data = (await res.json()) as {
          user?: { cpf?: string }
          profile?: { org_role_name?: string | null }
        }
        if (cancelled) return
        setCpf(data.user?.cpf ?? null)
        setOrgRoleName(data.profile?.org_role_name ?? null)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.id])

  if (profileLoading && !profile) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  if (!profile || !user) {
    return (
      <p className="text-sm text-muted-foreground">{t('loading')}</p>
    )
  }

  const roleMeta = profile.account_role
    ? ROLE_META[profile.account_role]
    : null

  async function uploadAvatar(file: File) {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error(t('unsupportedImage'), { description: t('unsupportedImageDesc') })
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t('imageTooLarge'), { description: t('imageTooLargeDesc') })
      return
    }

    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('kind', 'avatars')
      const res = await fetch('/api/storage/upload', {
        method: 'POST',
        body: form,
      })
      const data = (await res.json().catch(() => ({}))) as {
        publicUrl?: string
        error?: string
      }
      if (!res.ok || !data.publicUrl) {
        toast.error(t('uploadFailed', { message: data.error ?? res.statusText }))
        return
      }
      setAvatarUrl(data.publicUrl)
      const saveRes = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: data.publicUrl }),
      })
      if (!saveRes.ok) {
        const err = (await saveRes.json().catch(() => ({}))) as { error?: string }
        toast.error(t('saveFailed', { message: err.error ?? saveRes.statusText }))
        return
      }
      await refreshProfile()
      toast.success(t('profileSaved'))
    } catch (err) {
      toast.error(
        t('uploadFailed', {
          message: err instanceof Error ? err.message : 'error',
        }),
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const name = fullName.trim()
    if (!name) {
      toast.error(t('nameRequired'))
      return
    }
    const emailTrim = email.trim()
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      toast.error(t('invalidEmail'))
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name,
          email: emailTrim || null,
          avatar_url: avatarUrl,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(t('saveFailed', { message: data.error ?? res.statusText }))
        return
      }
      await refreshProfile()
      toast.success(t('profileSaved'))
    } catch (err) {
      toast.error(
        t('saveFailed', {
          message: err instanceof Error ? err.message : 'error',
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'U'

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold text-foreground">{t('sectionIdentity')}</h3>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3">
                <Avatar className="size-20">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={fullName} />
                  ) : null}
                  <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadAvatar(file)
                    e.target.value = ''
                  }}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <User className="size-4" />
                    )}
                    {avatarUrl ? t('changePhoto') : t('uploadPhoto')}
                  </Button>
                  {avatarUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAvatarUrl(null)}
                    >
                      {t('remove')}
                    </Button>
                  ) : null}
                </div>
                <p className="max-w-[20ch] text-center text-xs text-muted-foreground">
                  {t('photoHint')}
                </p>
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">{t('displayName')}</Label>
                  <Input
                    id="displayName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">{t('cpf')}</Label>
                  <Input
                    id="cpf"
                    value={cpf ? formatCpf(cpf) : '—'}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">{t('cpfHint')}</p>
                </div>
                {roleMeta || orgRoleName ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t('role')}</span>
                    <Badge variant="secondary" className="gap-1">
                      {roleMeta ? (
                        (() => {
                          const Icon = roleMeta.icon
                          return <Icon className="size-3" />
                        })()
                      ) : null}
                      {orgRoleName ??
                        (profile.account_role
                          ? tRoles(profile.account_role)
                          : '—')}
                    </Badge>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-sm font-semibold text-foreground">{t('sectionContact')}</h3>
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="voce@exemplo.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="text-sm font-semibold text-foreground">{t('sectionAccount')}</h3>
            <p className="text-sm text-muted-foreground">{t('accountHint')}</p>
            <Link
              href="/settings?tab=security"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <Shield className="size-4" />
              {t('goSecurity')}
            </Link>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || uploading}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('saveChanges')
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}

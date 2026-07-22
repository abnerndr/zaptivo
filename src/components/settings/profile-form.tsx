'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, User } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { ROLE_META } from './role-meta'
import { SettingsPanelHead } from './settings-panel-head'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export function ProfileForm() {
  const t = useTranslations('Settings.profile')
  const tRoles = useTranslations('Settings.roles')
  const { user, profile, profileLoading, refreshProfile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setEmail(profile.email ?? '')
    setAvatarUrl(profile.avatar_url)
  }, [profile])

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
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="text-sm font-medium text-foreground">
              {t('accountDetails')}
            </h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('role')}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {roleMeta
                    ? tRoles(profile.account_role!)
                    : profile.account_role ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('userId')}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                  {user.id}
                </dd>
              </div>
            </dl>
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

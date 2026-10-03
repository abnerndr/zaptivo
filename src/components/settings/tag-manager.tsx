'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PRESET_COLORS = [
  { key: 'red', value: '#ef4444' },
  { key: 'orange', value: '#f97316' },
  { key: 'amber', value: '#f59e0b' },
  { key: 'emerald', value: '#10b981' },
  { key: 'cyan', value: '#06b6d4' },
  { key: 'blue', value: '#3b82f6' },
  { key: 'violet', value: '#8b5cf6' },
  { key: 'pink', value: '#ec4899' },
] as const

type TagRow = { id: string; name: string; color: string }

export function TagManager() {
  const t = useTranslations('Settings.tagsAndFields')
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(PRESET_COLORS[5].value)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/tags', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? t('failedToLoadTags'))
      }
      setTags((data.tags as TagRow[]) ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToLoadTags'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error(t('nameRequired'))
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? t('failedToCreateTag'))
      }
      toast.success(t('tagCreated'))
      setName('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToCreateTag'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await apiFetch(`/api/tags/${deleteId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? t('failedToDeleteTag'))
      }
      toast.success(t('tagDeleted'))
      setDeleteId(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToDeleteTag'))
    } finally {
      setDeleting(false)
    }
  }

  const pending = tags.find((x) => x.id === deleteId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Tags className="size-4 text-primary" />
          {t('tagsTitle')}
        </CardTitle>
        <CardDescription>{t('tagsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noTags')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-2.5 pr-1 text-sm"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span>{tag.name}</span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={t('deleteAria', { name: tag.name })}
                  onClick={() => setDeleteId(tag.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Nome
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create()
              }}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Cor
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={t(`colors.${c.key}` as 'colors.blue')}
                  aria-label={t('useColor', { color: c.key })}
                  onClick={() => setColor(c.value)}
                  className={`size-7 rounded-full border-2 transition ${
                    color === c.value
                      ? 'border-foreground scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
          <Button type="button" onClick={() => void create()} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t('addTag')}
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTag')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('deleteConfirm', { name: pending?.name ?? '' })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? t('deleting') : t('deleteTag')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

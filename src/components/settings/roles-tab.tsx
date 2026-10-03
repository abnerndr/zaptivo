'use client'
import { apiFetch } from '@/lib/api/client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Shield, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RequireRole } from '@/components/auth/require-role'
import { SettingsPanelHead } from './settings-panel-head'

type Permission = {
  key: string
  label: string
  description: string | null
  group_key: string
}

type OrgRoleRow = {
  id: string
  name: string
  description: string | null
  is_system: boolean
  system_key: string | null
  member_count: number
  permissions: string[]
}

export function RolesTab() {
  const t = useTranslations('Settings.rolesPage')
  const [roles, setRoles] = useState<OrgRoleRow[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<OrgRoleRow | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/account/roles')
      const data = (await res.json()) as {
        roles?: OrgRoleRow[]
        permissions?: Permission[]
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error ?? t('loadFailed'))
        return
      }
      setRoles(data.roles ?? [])
      setPermissions(data.permissions ?? [])
    } catch {
      toast.error(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) {
      const list = map.get(p.group_key) ?? []
      list.push(p)
      map.set(p.group_key, list)
    }
    return [...map.entries()]
  }, [permissions])

  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setSelected(new Set())
    setEditorOpen(true)
  }

  function openEdit(role: OrgRoleRow) {
    setEditing(role)
    setName(role.name)
    setDescription(role.description ?? '')
    setSelected(new Set(role.permissions))
    setEditorOpen(true)
  }

  function togglePerm(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t('nameRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        permissions: [...selected],
      }
      const res = editing
        ? await apiFetch(`/api/account/roles/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await apiFetch('/api/account/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? t('saveFailed'))
        return
      }
      toast.success(editing ? t('updated') : t('created'))
      setEditorOpen(false)
      await load()
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/account/roles/${deleteId}`, {
        method: 'DELETE',
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? t('deleteFailed'))
        return
      }
      toast.success(t('deleted'))
      setDeleteId(null)
      await load()
    } catch {
      toast.error(t('deleteFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <RequireRole min="admin">
            <Button onClick={openCreate} size="sm">
              <Plus className="size-4" />
              {t('create')}
            </Button>
          </RequireRole>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          {t('loading')}
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <Card key={role.id} className="border-border">
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Shield className="size-4 text-primary" />
                    <span className="font-medium text-foreground">{role.name}</span>
                    {role.is_system ? (
                      <Badge variant="secondary">{t('systemBadge')}</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {t('memberCount', { count: role.member_count })}
                    </span>
                  </div>
                  {role.description ? (
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t('permCount', { count: role.permissions.length })}
                  </p>
                </div>
                <RequireRole min="admin">
                  <div className="flex gap-2">
                    {!role.is_system || role.system_key !== 'owner' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={role.is_system}
                        onClick={() => openEdit(role)}
                        title={
                          role.is_system
                            ? t('systemLocked')
                            : t('edit')
                        }
                      >
                        <Pencil className="size-4" />
                        {t('edit')}
                      </Button>
                    ) : null}
                    {!role.is_system ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteId(role.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </RequireRole>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editTitle') : t('createTitle')}
            </DialogTitle>
            <DialogDescription>{t('editorDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('nameLabel')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!editing?.is_system}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('descriptionLabel')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!!editing?.is_system}
                rows={2}
              />
            </div>
            <div className="space-y-3">
              <Label>{t('permissionsLabel')}</Label>
              {grouped.map(([group, items]) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`groups.${group}` as 'groups.equipe')}
                  </p>
                  {items.map((p) => (
                    <label
                      key={p.key}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <Checkbox
                        checked={selected.has(p.key)}
                        onCheckedChange={() => togglePerm(p.key)}
                        disabled={!!editing?.is_system}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{p.label}</span>
                        {p.description ? (
                          <span className="block text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !!editing?.is_system}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>{t('deleteDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

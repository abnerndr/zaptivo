'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronRight,
  FileText,
  Loader2,
  Palette,
  PlugZap,
  Tags,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useTheme } from '@/hooks/use-theme'
import { THEMES } from '@/lib/themes'
import { cn } from '@/lib/utils'
import type { SettingsSection } from '@/components/settings/settings-sections'
import { SettingsChip, StatusDot } from '@/components/settings/settings-chip'
import { ROLE_META } from '@/components/settings/role-meta'
import type { AccountRole } from '@/lib/auth/roles'

type OverviewData = {
  whatsapp: {
    configured: boolean
    status: string | null
    display_name: string | null
  }
  members: { count: number; pending_invites: number }
  templates: { count: number; pending_review: number }
  tags: { count: number }
  fields: { count: number }
  profile: {
    full_name: string
    email: string | null
    avatar_url: string | null
    role: AccountRole
  } | null
  account: { id: string; name: string }
}

function OverviewTile({
  icon: Icon,
  title,
  description,
  chip,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  chip?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors',
        'hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {chip}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

export function SettingsOverview(props: {
  onSelect?: (next: SettingsSection) => void
}) {
  const t = useTranslations('Settings')
  const to = useTranslations('Settings.overview')
  const tr = useTranslations('Settings.roles')
  const { mode, theme } = useTheme()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/account/overview')
        if (!res.ok) throw new Error('failed')
        const json = (await res.json()) as OverviewData
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const themeName = THEMES.find((item) => item.id === theme)?.name ?? theme
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1)

  const waChip = (() => {
    if (!data) return null
    if (!data.whatsapp.configured) {
      return (
        <SettingsChip variant="muted">
          <StatusDot tone="muted" />
          {to('notSetup')}
        </SettingsChip>
      )
    }
    if (data.whatsapp.status === 'WORKING') {
      return (
        <SettingsChip variant="ok">
          <StatusDot tone="ok" />
          {to('connected')}
        </SettingsChip>
      )
    }
    return (
      <SettingsChip variant="warn">
        <StatusDot tone="muted" />
        {to('needsReconnecting')}
      </SettingsChip>
    )
  })()

  const waDescription = (() => {
    if (!data) return to('loading')
    if (!data.whatsapp.configured) return to('notSetup')
    if (data.whatsapp.status === 'WORKING') {
      return data.whatsapp.display_name || to('connected')
    }
    return to('needsReconnecting')
  })()

  const profile = data?.profile
  const roleMeta = profile ? ROLE_META[profile.role] : null

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-1 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {to('loading')}
      </div>
    )
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <div className="grid gap-3 sm:grid-cols-2">
        <OverviewTile
          icon={PlugZap}
          title={t('sections.whatsapp')}
          description={waDescription}
          chip={waChip}
          onClick={() => props.onSelect?.('whatsapp')}
        />

        <OverviewTile
          icon={UsersRound}
          title={t('sections.members')}
          description={
            data
              ? [
                  to('membersCount', { count: data.members.count }),
                  data.members.pending_invites > 0
                    ? to('pendingInvites', {
                        count: data.members.pending_invites,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || to('viewTeamMembers')
              : to('viewTeamMembers')
          }
          onClick={() => props.onSelect?.('members')}
        />

        <OverviewTile
          icon={FileText}
          title={t('sections.templates')}
          description={
            data
              ? [
                  to('templatesCount', { count: data.templates.count }),
                  data.templates.pending_review > 0
                    ? to('pendingReview', {
                        count: data.templates.pending_review,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || to('manageTemplates')
              : to('manageTemplates')
          }
          onClick={() => props.onSelect?.('templates')}
        />

        <OverviewTile
          icon={Tags}
          title={t('sections.fields')}
          description={
            data
              ? [
                  to('tagsCount', { count: data.tags.count }),
                  to('fieldsCount', { count: data.fields.count }),
                ].join(' · ')
              : to('tagsAndFields')
          }
          onClick={() => props.onSelect?.('fields')}
        />

        <OverviewTile
          icon={Palette}
          title={t('sections.appearance')}
          description={to('appearance', {
            mode: modeLabel,
            theme: themeName,
          })}
          onClick={() => props.onSelect?.('appearance')}
        />

        <OverviewTile
          icon={User}
          title={t('sections.profile')}
          description={
            profile
              ? [profile.full_name, profile.email].filter(Boolean).join(' · ')
              : to('yourAccount')
          }
          chip={
            profile && roleMeta ? (
              <SettingsChip variant={roleMeta.variant}>
                {tr(profile.role)}
              </SettingsChip>
            ) : undefined
          }
          onClick={() => props.onSelect?.('profile')}
        />
      </div>
    </section>
  )
}

export default SettingsOverview

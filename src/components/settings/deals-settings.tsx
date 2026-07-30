'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Coins, Loader2, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { useCan } from '@/hooks/use-can'
import { CURRENCIES } from '@/lib/currency'
import { SettingsChip } from './settings-chip'
import { SettingsPanelHead } from './settings-panel-head'

export function DealsSettings() {
  const t = useTranslations('Settings.deals')
  const tRoles = useTranslations('Settings.roles')
  const { defaultCurrency, refreshProfile, profileLoading } = useAuth()
  const canEdit = useCan('edit-settings')

  const [currency, setCurrency] = useState(defaultCurrency)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCurrency(defaultCurrency)
  }, [defaultCurrency])

  const dirty = currency !== defaultCurrency

  async function onSave() {
    if (!canEdit || !dirty) return
    setSaving(true)
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_currency: currency }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(t('saveFailed'), {
          description: data.error,
        })
        return
      }
      await refreshProfile()
      toast.success(t('saveSuccess'))
    } catch {
      toast.error(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (profileLoading && !defaultCurrency) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            {t('defaultCurrency')}
            {!canEdit ? (
              <SettingsChip variant="admin" className="font-medium">
                <Shield />
                {tRoles('admin')}
              </SettingsChip>
            ) : null}
          </CardTitle>
          <CardDescription>{t('defaultCurrencyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="default-currency">{t('currencyLabel')}</Label>
            <Select
              value={currency}
              onValueChange={(value) => {
                if (value) setCurrency(value)
              }}
              disabled={!canEdit || saving}
            >
              <SelectTrigger id="default-currency" className="w-full max-w-sm">
                <SelectValue placeholder={currency} />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!canEdit ? (
            <p className="text-sm text-muted-foreground">{t('adminOnlyHint')}</p>
          ) : (
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={!dirty || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('save')
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export default DealsSettings

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'

export function SessionsCard() {
  const t = useTranslations('Settings.profile')
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOutEverywhere() {
    setSigningOut(true)
    try {
      const res = await fetch('/api/me/sessions', { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(
          t('signOutFailed', { message: data.error ?? res.statusText }),
        )
        return
      }
      setOpen(false)
      await signOut()
    } catch (err) {
      toast.error(
        t('signOutFailed', {
          message: err instanceof Error ? err.message : 'error',
        }),
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('sessionsTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('sessionsDesc')}</p>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300"
            onClick={() => setOpen(true)}
          >
            <LogOut className="size-4" />
            {t('signOutAll')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('signOutConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('signOutConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={signingOut}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={signingOut}
              onClick={() => void handleSignOutEverywhere()}
            >
              {signingOut ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('signingOut')}
                </>
              ) : (
                t('signOutEverywhere')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

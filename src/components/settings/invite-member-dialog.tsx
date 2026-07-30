'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, MessageCircle, Sparkles } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const EXPIRY_OPTIONS = [
  { value: '1', labelKey: 'days1' },
  { value: '7', labelKey: 'days7' },
  { value: '30', labelKey: 'days30' },
];

const MAX_LABEL_LEN = 80;

type OrgRoleOption = {
  id: string;
  name: string;
  system_key: string | null;
  is_system: boolean;
};

interface CreatedInvite {
  url: string;
  roleLabel: string;
  email: string;
  expiresInDays: number;
  accountName: string;
  emailSent: boolean;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: InviteMemberDialogProps) {
  const t = useTranslations('Settings.invite');
  const { account } = useAuth();
  const [roles, setRoles] = useState<OrgRoleOption[]>([]);
  const [orgRoleId, setOrgRoleId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [expiry, setExpiry] = useState<string>('7');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedInvite | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    ;(async () => {
      try {
        const res = await fetch('/api/account/roles');
        const data = (await res.json()) as { roles?: OrgRoleOption[] };
        if (cancelled || !res.ok) return;
        const opts = (data.roles ?? []).filter((r) => r.system_key !== 'owner');
        setRoles(opts);
        const agent = opts.find((r) => r.system_key === 'agent');
        setOrgRoleId((prev) => prev || agent?.id || opts[0]?.id || '');
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setEmail('');
    setExpiry('7');
    setLabel('');
    setResult(null);
    setSubmitting(false);
    const agent = roles.find((r) => r.system_key === 'agent');
    setOrgRoleId(agent?.id || roles[0]?.id || '');
  }

  async function handleCreate() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      toast.error(t('emailRequired'));
      return;
    }
    if (!orgRoleId) {
      toast.error(t('roleRequired'));
      return;
    }
    const trimmedLabel = label.trim();
    if (trimmedLabel.length > MAX_LABEL_LEN) {
      toast.error(t('labelTooLong', { max: MAX_LABEL_LEN }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgRoleId,
          email: trimmedEmail,
          expiresInDays: Number(expiry),
          label: trimmedLabel || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('createFailed'));
        return;
      }

      const data = (await res.json()) as {
        url: string;
        expiresInDays: number;
        emailSent?: boolean;
      };

      const roleLabel =
        roles.find((r) => r.id === orgRoleId)?.name ?? orgRoleId;

      setResult({
        url: data.url,
        roleLabel,
        email: trimmedEmail,
        expiresInDays: data.expiresInDays,
        accountName: account?.name ?? 'wacrm',
        emailSent: !!data.emailSent,
      });

      if (data.emailSent) {
        toast.success(t('emailSentToast'));
      } else {
        toast.message(t('emailNotSentToast'));
      }
      onCreated();
    } catch (err) {
      console.error('[InviteMemberDialog] create error:', err);
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToClipboard() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success(t('copied'));
    } catch {
      toast.error(t('clipboardBlocked'));
    }
  }

  function whatsappShareUrl(url: string): string {
    const accountName = result?.accountName ?? 'wacrm';
    const message = t('whatsappMessage', {
      accountName,
      expiresInDays: result?.expiresInDays ?? 0,
      url,
    });
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <Sparkles className="size-4 text-primary" />
                {t('inviteCreated')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t.rich('inviteCreatedDesc', {
                  role: result.roleLabel,
                  days: result.expiresInDays,
                  bold: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <Label className="text-muted-foreground">{t('inviteLink')}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={result.url}
                  className="bg-muted border-border text-foreground font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  onClick={copyToClipboard}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                >
                  <Copy className="size-4" />
                  {t('copy')}
                </Button>
              </div>

              <div className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                <strong className="font-semibold text-amber-100">
                  {t('saveLinkNow')}
                </strong>{' '}
                {t('saveLinkHint')}
              </div>

              <a
                href={whatsappShareUrl(result.url)}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({
                  variant: 'outline',
                  className:
                    'w-full border-border text-muted-foreground hover:bg-muted',
                })}
              >
                <MessageCircle className="size-4" />
                {t('sendViaWhatsApp')}
              </a>
            </div>

            <DialogFooter className="bg-popover border-border">
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {t('done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">
                {t('dialogTitle')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {t('dialogDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('emailLabel')}</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="bg-muted border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('roleLabel')}</Label>
                <Select
                  value={orgRoleId}
                  onValueChange={(v) => v && setOrgRoleId(v)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t('roleLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('validForLabel')}</Label>
                <Select
                  value={expiry}
                  onValueChange={(v) => v && setExpiry(v)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t('validForLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey as Parameters<typeof t>[0])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t('labelTitle')}{' '}
                  <span className="text-xs text-muted-foreground">
                    {t('optional')}
                  </span>
                </Label>
                <Input
                  placeholder={t('labelPlaceholder')}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={MAX_LABEL_LEN}
                  className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">{t('labelHint')}</p>
              </div>
            </div>

            <DialogFooter className="bg-popover border-border">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={submitting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('creating')}
                  </>
                ) : (
                  t('generateLink')
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

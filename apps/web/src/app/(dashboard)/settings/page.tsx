'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { RolesTab } from '@/components/settings/roles-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

function SettingsPanel({
  section,
  onSelect,
}: {
  section: SettingsSection;
  onSelect: (next: SettingsSection) => void;
}) {
  switch (section) {
    case 'overview':
      return <SettingsOverview onSelect={onSelect} />;
    case 'profile':
      return <ProfileForm />;
    case 'security':
      return <SecurityPanel />;
    case 'appearance':
      return <AppearancePanel />;
    case 'whatsapp':
      return <WhatsAppConfig />;
    case 'templates':
      return <TemplateManager />;
    case 'quick-replies':
      return <QuickRepliesManager />;
    case 'fields':
      return <FieldsAndTagsPanel />;
    case 'deals':
      return <DealsSettings />;
    case 'members':
      return <MembersTab />;
    case 'roles':
      return <RolesTab />;
    case 'api':
      return <ApiKeysSettings />;
    default:
      return <SettingsOverview onSelect={onSelect} />;
  }
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  const section = resolveSection(searchParams.get('tab'));

  const go = (next: SettingsSection) => {
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageDesc')}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} hints={hints} />
        <div className="min-w-0 rounded-xl border border-border/60 bg-card/30 p-4 sm:p-5">
          <SettingsPanel section={section} onSelect={go} />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

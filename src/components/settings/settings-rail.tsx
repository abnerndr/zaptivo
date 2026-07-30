'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import {
  RAIL_GROUPS,
  SECTION_META,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './settings-sections';

/** Map URL/section ids (kebab) → message keys (camelCase where needed). */
const SECTION_MESSAGE_KEY: Record<SettingsSection, string> = {
  overview: 'overview',
  profile: 'profile',
  security: 'security',
  appearance: 'appearance',
  whatsapp: 'whatsapp',
  templates: 'templates',
  'quick-replies': 'quickReplies',
  fields: 'fields',
  deals: 'deals',
  members: 'members',
  roles: 'roles',
  api: 'api',
};

const RAIL_DESKTOP_MIN_PX = 1024;

/**
 * Settings left rail — grouped, vertical on desktop and a horizontal
 * scroller on narrow screens. Uses <Link> so tab switches are real
 * navigations (more reliable than router.replace + searchParams alone).
 */
export function SettingsRail({
  active,
  hints,
}: {
  active: SettingsSection;
  hints?: Partial<Record<SettingsSection, ReactNode>>;
}) {
  const t = useTranslations('Settings');
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Keep the active chip in view on the horizontal (mobile) rail only.
  // Scroll the nav itself — never scrollIntoView (that walks ancestors
  // and jumps the dashboard main pane).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia(`(min-width: ${RAIL_DESKTOP_MIN_PX}px)`).matches) {
      return;
    }
    const nav = navRef.current;
    const item = activeRef.current;
    if (!nav || !item) return;
    const left =
      item.offsetLeft - nav.clientWidth / 2 + item.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Settings sections"
      className={cn(
        'flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'rounded-xl border border-border/60 bg-card/30 p-1.5',
        'lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:pb-1.5',
      )}
    >
      {RAIL_GROUPS.map(({ label, group }) => {
        const items = SETTINGS_SECTIONS.filter(
          (s) => SECTION_META[s].group === group,
        );
        return (
          <div
            key={group}
            className="flex shrink-0 gap-1 lg:w-full lg:flex-col lg:gap-0.5"
          >
            {label ? (
              <div className="hidden px-3 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase lg:block">
                {t(`groups.${group}`)}
              </div>
            ) : null}
            {items.map((s) => {
              const meta = SECTION_META[s];
              const Icon = meta.icon;
              const isActive = s === active;
              const msgKey = `sections.${SECTION_MESSAGE_KEY[s]}` as const;
              const sectionLabel = t.has(msgKey) ? t(msgKey) : meta.label;
              return (
                <Link
                  key={s}
                  href={`/settings?tab=${s}`}
                  scroll={false}
                  ref={isActive ? activeRef : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap transition-colors',
                    'lg:w-full',
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{sectionLabel}</span>
                  {hints?.[s] != null ? (
                    <span
                      className={cn(
                        'hidden items-center gap-1.5 text-xs lg:inline-flex',
                        isActive ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {hints[s]}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

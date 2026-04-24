// components/settings/SettingsTabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/team',          label: 'Team' },
  { href: '/settings/modules',       label: 'Modules' },
  { href: '/settings/organization',  label: 'Organization' },
  { href: '/settings/integrations',  label: 'Integrations' },
  { href: '/settings/audit',         label: 'Audit Log' },
  { href: '/settings/notifications', label: 'Notifications' },
];

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-black/10 mb-2">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              active
                ? 'border-b-2 border-azure text-azure bg-white'
                : 'text-black/50 hover:text-black/80 hover:bg-black/5'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

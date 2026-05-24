'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Mail, Inbox, Briefcase, Radar, FileText,
  Calendar, BarChart3, Sparkles, Settings, Brain,
} from 'lucide-react'

const nav = [
  { href: '/',             icon: LayoutDashboard, label: 'Daily briefing' },
  { href: '/queue',        icon: Mail,            label: 'Approval queue' },
  { href: '/inbox',        icon: Inbox,           label: 'Replies inbox' },
  { href: '/pipeline',     icon: Briefcase,       label: 'Pipeline' },
  { href: '/brands',       icon: Radar,           label: 'Brand library' },
  { href: '/signals',      icon: Sparkles,        label: 'Signal feed' },
  { href: '/social-brain', icon: Brain,           label: 'Social Brain' },
  { href: '/media-kit',    icon: FileText,        label: 'Media kit' },
  { href: '/calendar',     icon: Calendar,        label: 'Calendar' },
  { href: '/analytics',    icon: BarChart3,       label: 'Analytics' },
  { href: '/settings',     icon: Settings,        label: 'Settings' },
]

// Group nav items with a visual separator before utility pages
const NAV_GROUPS = [
  nav.slice(0, 7),  // core pipeline items
  nav.slice(7),     // reference / utility pages
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col border-r border-wire-subtle bg-surface-sidebar">

      {/* ── Logo / wordmark ──────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 border-b border-wire-subtle">
        <div className="font-display text-lg font-semibold text-ink tracking-tight leading-none">
          TaylorReach
        </div>
        <div className="mt-1 text-2xs text-ink-muted uppercase tracking-widest">
          Brand partnership engine
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.map((item) => {
              const active = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    group/link relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm
                    transition-all duration-fast
                    ${active
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
                    }
                  `}
                >
                  {/* Active: tangerine left indicator */}
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-accent" />
                  )}

                  <item.icon className={`
                    h-4 w-4 shrink-0
                    transition-all duration-fast
                    group-hover/link:scale-110
                    ${active ? 'text-accent' : 'text-ink-muted'}
                  `} />

                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-t border-wire-subtle">
        <div className="text-2xs text-ink-muted leading-relaxed">
          Taylor Humphrey
          <span className="mx-1.5 opacity-30">·</span>
          <span className="text-accent-soft">@whatsinababyname</span>
        </div>
      </div>
    </aside>
  )
}

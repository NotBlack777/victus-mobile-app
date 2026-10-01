import React from 'react';
import {
  ArrowRight,
  Server,
  CreditCard,
  HardDrive,
  LifeBuoy,
  Activity,
  ShoppingBag,
  Globe,
  Zap,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';

interface HomeViewProps {
  onNavigate: (url: string, title?: string, tabId?: string) => void;
}

interface PanelCardItem {
  id: string;
  title: string;
  tag: string;
  icon: React.ElementType;
  desc: string;
  url: string;
}

interface QuickActionItem {
  id: string;
  title: string;
  sub: string;
  url: string;
  icon: React.ElementType;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { isDark } = useTheme();

  const panels: PanelCardItem[] = [
    {
      id: 'website',
      title: 'Main Website',
      tag: 'PORTAL',
      icon: Globe,
      desc: 'Explore cloud hosting services, game plans, datacenter locations, and account flows.',
      url: 'https://victuscloud.com',
    },
    {
      id: 'control',
      title: 'Control Panel',
      tag: 'PRODUCTION',
      icon: Server,
      desc: 'Pterodactyl production panel for server power, terminal console, schedules, and file management.',
      url: 'https://control.victuscloud.com',
    },
    {
      id: 'billing',
      title: 'Billing Panel',
      tag: 'PAYMENTS',
      icon: CreditCard,
      desc: 'Paymenter engine for invoices, top-ups, cloud subscriptions, and automated renewal.',
      url: 'https://billing.victuscloud.com',
    },
    {
      id: 'drive',
      title: 'Victus Drive',
      tag: 'STORAGE',
      icon: HardDrive,
      desc: 'High-speed object storage, server backup archives, and file sharing repository.',
      url: 'https://drive.victuscloud.com',
    },
    {
      id: 'support',
      title: 'Support Hub',
      tag: '24/7 HELP',
      icon: LifeBuoy,
      desc: 'Ticket manager, documentation guides, knowledge base, and official Discord lounge.',
      url: 'https://victuscloud.com/support',
    },
    {
      id: 'status',
      title: 'System Status',
      tag: 'UPTIME 99.9%',
      icon: Activity,
      desc: 'Real-time telemetry, node cluster pings, incident logs, and network uptime status.',
      url: 'https://victuscloud.com/status',
    },
  ];

  const quickActions: QuickActionItem[] = [
    {
      id: 'marketplace',
      title: 'Marketplace',
      sub: 'Server plugins & themes',
      url: 'https://victuscloud.com/marketplace',
      icon: ShoppingBag,
    },
    {
      id: 'free',
      title: 'Free Hosting',
      sub: 'Community tier launch',
      url: 'https://victuscloud.com/free',
      icon: Zap,
    },
    {
      id: 'files',
      title: 'Storage Hub',
      sub: 'Drive repository',
      url: 'https://victuscloud.com/files',
      icon: HardDrive,
    },
    {
      id: 'community',
      title: 'Discord Lounge',
      sub: '5,000+ member chat',
      url: 'https://discord.gg/victuscloud',
      icon: Sparkles,
    },
  ];

  return (
    <div className="w-full flex-1 overflow-y-auto no-scrollbar px-3 pt-4 pb-28 space-y-4 animate-in fade-in duration-200">
      {/* Hero card matching admin panel elevation (#111117 / border-white/[0.08]) */}
      <section
        className="rounded-xl p-5 sm:p-6 border relative overflow-hidden shadow-sm transition-colors duration-200"
        style={{
          backgroundColor: 'var(--panel-soft)',
          borderColor: 'var(--line)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center p-2 flex-shrink-0">
              <img
                src="/victus-logo.png"
                alt="Victus Cloud"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
                  Victus Cloud Ecosystem
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h2
                className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5"
                style={{ color: 'var(--title-text)' }}
              >
                Control your cloud from one app.
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onNavigate('https://control.victuscloud.com', 'Control Panel', 'control')}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              Control Panel
            </button>
            <button
              onClick={() => onNavigate('https://billing.victuscloud.com', 'Billing', 'billing')}
              className="px-3.5 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer"
              style={{
                borderColor: 'var(--line)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                color: 'var(--text)',
              }}
            >
              Billing
            </button>
          </div>
        </div>

        <p
          className="mt-3 text-xs sm:text-sm leading-relaxed max-w-2xl"
          style={{ color: 'var(--muted)' }}
        >
          Servers, billing, object drive, support, and cluster status unified in a native mobile management shell for Victus Cloud infrastructure.
        </p>

        {/* Status Metric Strip */}
        <div
          className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t"
          style={{ borderColor: 'var(--divider)' }}
        >
          <div
            className="p-2.5 rounded-lg border"
            style={{
              backgroundColor: 'var(--panel-strong-soft)',
              borderColor: 'var(--line-soft)',
            }}
          >
            <strong
              className="block text-xs sm:text-sm font-bold"
              style={{ color: 'var(--title-text)' }}
            >
              .com Live
            </strong>
            <span
              className="block text-[10px] font-medium uppercase mt-0.5"
              style={{ color: 'var(--faint)' }}
            >
              Production Gateway
            </span>
          </div>

          <div
            className="p-2.5 rounded-lg border"
            style={{
              backgroundColor: 'var(--panel-strong-soft)',
              borderColor: 'var(--line-soft)',
            }}
          >
            <strong
              className="block text-xs sm:text-sm font-bold"
              style={{ color: 'var(--title-text)' }}
            >
              Cloud Fleet
            </strong>
            <span
              className="block text-[10px] font-medium uppercase mt-0.5"
              style={{ color: 'var(--faint)' }}
            >
              High-Performance Nodes
            </span>
          </div>

          <div
            className="p-2.5 rounded-lg border"
            style={{
              backgroundColor: 'var(--panel-strong-soft)',
              borderColor: 'var(--line-soft)',
            }}
          >
            <strong
              className="block text-xs sm:text-sm font-bold"
              style={{ color: 'var(--title-text)' }}
            >
              Protected
            </strong>
            <span
              className="block text-[10px] font-medium uppercase mt-0.5"
              style={{ color: 'var(--faint)' }}
            >
              Active Network Shield
            </span>
          </div>
        </div>
      </section>

      {/* Core Panels Section */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h3
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}
          >
            Ecosystem Portals
          </h3>
          <span className="text-[11px]" style={{ color: 'var(--faint)' }}>
            Tap to load
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {panels.map((panel) => {
            const Icon = panel.icon;
            return (
              <div
                key={panel.id}
                onClick={() => onNavigate(panel.url, panel.title, panel.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(panel.url, panel.title, panel.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className="p-4 rounded-xl border hover:border-violet-500/30 transition-all cursor-pointer group flex flex-col justify-between"
                style={{
                  backgroundColor: 'var(--panel-soft)',
                  borderColor: 'var(--line)',
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/25 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: 'var(--chip-bg)',
                        borderColor: 'var(--chip-stroke)',
                        color: 'var(--chip-text)',
                      }}
                    >
                      {panel.tag}
                    </span>
                  </div>

                  <h4
                    className="text-sm font-bold group-hover:text-violet-400 transition-colors"
                    style={{ color: 'var(--title-text)' }}
                  >
                    {panel.title}
                  </h4>
                  <p
                    className="text-xs mt-1 leading-relaxed"
                    style={{ color: 'var(--muted)' }}
                  >
                    {panel.desc}
                  </p>
                </div>

                <div
                  className="mt-4 pt-2.5 border-t flex items-center justify-between text-xs text-violet-400 font-semibold"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  <span>Open portal</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Services Section */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <h3
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}
          >
            Quick Actions &amp; Community
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onNavigate(action.url, action.title, action.id)}
                className="p-3 rounded-xl border transition-all cursor-pointer text-left group hover:border-violet-500/40"
                style={{
                  backgroundColor: 'var(--panel-soft)',
                  borderColor: 'var(--line)',
                }}
              >
                <Icon className="w-4 h-4 text-violet-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <span
                  className="block text-xs font-bold truncate"
                  style={{ color: 'var(--title-text)' }}
                >
                  {action.title}
                </span>
                <span
                  className="block text-[10px] truncate mt-0.5"
                  style={{ color: 'var(--faint)' }}
                >
                  {action.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

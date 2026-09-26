import React from 'react';
import { ArrowRight } from 'lucide-react';

interface HomeViewProps {
  onNavigate: (url: string, title?: string, tabId?: string) => void;
}

interface PanelCardItem {
  id: string;
  title: string;
  tag: string;
  glyph: string;
  desc: string;
  url: string;
}

interface QuickActionItem {
  id: string;
  title: string;
  sub: string;
  url: string;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const panels: PanelCardItem[] = [
    {
      id: 'website',
      title: 'Main Website',
      tag: 'Main',
      glyph: 'W',
      desc: 'Dashboard, marketplace, storage, community, support, free hosting, and account flows.',
      url: 'https://victuscloud.com',
    },
    {
      id: 'billing',
      title: 'Billing Panel',
      tag: 'Paymenter',
      glyph: 'B',
      desc: 'Invoices, orders, credits, payment methods, top-ups, and service billing.',
      url: 'https://billing.victuscloud.com',
    },
    {
      id: 'control',
      title: 'Control Panel',
      tag: 'Live',
      glyph: 'C',
      desc: 'The current production panel for server power, files, console, schedules, and databases.',
      url: 'https://control.victuscloud.com',
    },
    {
      id: 'testpanel',
      title: 'Victus Panel',
      tag: 'Beta',
      glyph: 'P',
      desc: 'The new panel being developed for the next-generation Victus experience.',
      url: 'https://testpanel.victuscloud.com',
    },
    {
      id: 'drive',
      title: 'Victus Drive',
      tag: 'Storage',
      glyph: 'D',
      desc: 'Upload, download, preview, and manage cloud files directly from the app.',
      url: 'https://drive.victuscloud.com',
    },
    {
      id: 'support',
      title: 'Support',
      tag: 'Chat',
      glyph: 'S',
      desc: 'Open website support, public lounge, tickets, documentation, and Discord links.',
      url: 'https://victuscloud.com/support',
    },
  ];

  const quickActions: QuickActionItem[] = [
    {
      id: 'marketplace',
      title: 'Marketplace',
      sub: 'Buy and sell resources',
      url: 'https://victuscloud.com/marketplace',
    },
    {
      id: 'free',
      title: 'Free hosting',
      sub: 'Launch page and countdown',
      url: 'https://victuscloud.com/free',
    },
    {
      id: 'files',
      title: 'Storage hub',
      sub: 'Files and image hosting',
      url: 'https://victuscloud.com/files',
    },
    {
      id: 'status',
      title: 'System status',
      sub: 'Service health',
      url: 'https://victuscloud.com/status',
    },
    {
      id: 'community',
      title: 'Community',
      sub: 'Posts, forums, gallery',
      url: 'https://victuscloud.com/community',
    },
    {
      id: 'settings',
      title: 'Account settings',
      sub: 'Profile and links',
      url: 'https://victuscloud.com/settings',
    },
  ];

  return (
    <div className="w-full max-w-[61.25rem] mx-auto px-3 sm:px-6 pt-5 pb-28 animate-in fade-in duration-300">
      {/* Hero card with glassmorphism */}
      <section
        className="rounded-[1.75rem] p-5 sm:p-7 border backdrop-blur-xl relative overflow-hidden transition-all"
        style={{
          background: 'linear-gradient(145deg, var(--panel-strong), var(--panel))',
          borderColor: 'var(--line)',
          boxShadow: 'var(--shadow-hero), inset 0 1px 1.375rem rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-4">
          <img
            src="/victus-logo.png"
            alt="Victus Cloud"
            className="w-13 h-13 sm:w-14 sm:h-14 rounded-[1.125rem] object-contain p-2 flex-shrink-0"
            style={{
              background: 'linear-gradient(145deg, var(--accent-1), var(--accent-2) 52%, var(--accent-3))',
              boxShadow: 'var(--shadow-logo)',
            }}
          />
          <div>
            <p
              className="text-[11px] font-extrabold uppercase tracking-[0.22em] mb-1.5"
              style={{ color: 'var(--eyebrow)' }}
            >
              Victus Cloud Mobile
            </p>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[0.98]">
              Control your cloud from one app.
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
          Billing, servers, storage, marketplace, support, and the new Victus panel live in one secure app shell with native upload, download, share, copy, and session tools.
        </p>

        {/* Hero actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          <button
            onClick={() => onNavigate('https://victuscloud.com/login', 'Sign In', 'website')}
            className="min-h-[48px] px-5 rounded-[1.125rem] font-extrabold text-sm text-white flex items-center justify-center transition-all cursor-pointer hover:brightness-105 active:scale-98"
            style={{
              background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2), var(--accent-3))',
              boxShadow: 'var(--shadow-primary)',
            }}
          >
            Sign in to Victus
          </button>
          <button
            onClick={() => onNavigate('https://control.victuscloud.com', 'Control Panel', 'control')}
            className="min-h-[48px] px-5 rounded-[1.125rem] font-extrabold text-sm flex items-center justify-center border transition-all cursor-pointer hover:brightness-105 active:scale-98"
            style={{
              borderColor: 'var(--line-soft)',
              backgroundColor: 'var(--panel)',
              color: 'var(--text)',
            }}
          >
            Open Control Panel
          </button>
        </div>

        {/* Status Strip */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mt-4">
          <div
            className="border rounded-[1.125rem] p-3 text-center sm:text-left"
            style={{
              borderColor: 'var(--line-soft)',
              backgroundColor: 'var(--metric-bg)',
            }}
          >
            <strong className="block text-base sm:text-lg font-bold">.com</strong>
            <span
              className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mt-0.5"
              style={{ color: 'var(--faint)' }}
            >
              Live domain
            </span>
          </div>

          <div
            className="border rounded-[1.125rem] p-3 text-center sm:text-left"
            style={{
              borderColor: 'var(--line-soft)',
              backgroundColor: 'var(--metric-bg)',
            }}
          >
            <strong className="block text-base sm:text-lg font-bold">SSO</strong>
            <span
              className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mt-0.5"
              style={{ color: 'var(--faint)' }}
            >
              Panel flow
            </span>
          </div>

          <div
            className="border rounded-[1.125rem] p-3 text-center sm:text-left"
            style={{
              borderColor: 'var(--line-soft)',
              backgroundColor: 'var(--metric-bg)',
            }}
          >
            <strong className="block text-base sm:text-lg font-bold">24/7</strong>
            <span
              className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mt-0.5"
              style={{ color: 'var(--faint)' }}
            >
              Support hub
            </span>
          </div>
        </div>
      </section>

      {/* Core panels section */}
      <div className="flex items-baseline justify-between gap-3 mt-7 mb-3 px-1">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Core panels</h3>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Native dock mirrors these routes
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Victus Cloud panels">
        {panels.map((panel) => (
          <div
            key={panel.id}
            onClick={() => onNavigate(panel.url, panel.title, panel.id)}
            role="button"
            tabIndex={0}
            className="min-h-[9.625rem] p-4 rounded-[1.375rem] border transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
            style={{
              borderColor: 'var(--line-soft)',
              background: 'linear-gradient(145deg, var(--panel-strong), var(--panel))',
              boxShadow: 'inset 0 1px 1.25rem rgba(255,255,255,0.035), var(--shadow-card)',
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-[0.9375rem] flex items-center justify-center font-black text-lg text-white"
                style={{
                  background: 'linear-gradient(145deg, rgba(var(--accent-1-rgb),0.92), rgba(var(--accent-3-rgb),0.78))',
                  boxShadow: 'var(--shadow-glyph)',
                }}
              >
                {panel.glyph}
              </div>
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border"
                style={{
                  backgroundColor: 'rgba(110,231,183,0.11)',
                  borderColor: 'rgba(110,231,183,0.28)',
                  color: 'var(--tag-text)',
                }}
              >
                {panel.tag}
              </span>
            </div>
            <strong className="block text-base font-bold mb-1.5">{panel.title}</strong>
            <span className="block text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              {panel.desc}
            </span>
          </div>
        ))}
      </section>

      {/* Quick actions section */}
      <div className="flex items-baseline justify-between gap-3 mt-7 mb-3 px-1">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Quick actions</h3>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Common routes, one tap
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Victus quick actions">
        {quickActions.map((action) => (
          <div
            key={action.id}
            onClick={() => onNavigate(action.url, action.title)}
            role="button"
            tabIndex={0}
            className="min-h-[48px] px-4 py-3 rounded-[1.125rem] border flex items-center justify-between gap-3 transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
            style={{
              borderColor: 'var(--line-soft)',
              backgroundColor: 'var(--quick-bg)',
            }}
          >
            <div>
              <span className="block text-sm font-extrabold">{action.title}</span>
              <small className="block text-[11px] font-medium" style={{ color: 'var(--faint)' }}>
                {action.sub}
              </small>
            </div>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'var(--arrow-bg)',
                color: 'var(--arrow-text)',
              }}
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        ))}
      </section>

      <footer className="mt-7 px-1 text-xs leading-relaxed opacity-60">
        The top Tools menu adds browser open, copy link, share link, test panel, support, status, marketplace, and clear app session. Back navigation traverses recent ecosystem routes before returning home.
      </footer>
    </div>
  );
};

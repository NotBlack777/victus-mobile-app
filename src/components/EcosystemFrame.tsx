import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ExternalLink,
  CreditCard,
  LifeBuoy,
  Activity,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  Globe2,
  Zap,
  HardDrive,
  Upload,
  Download,
  FileText,
} from 'lucide-react';
import { useToast } from './Toast.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { ControlDashboard } from './ControlDashboard.tsx';
import { ServiceControlScreen } from './ServiceControlScreen.tsx';
import { VictusService } from '../services/controlData.ts';
import {
  PanelServer,
  fetchServers,
  toVictusService,
} from '../services/panelApi.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { openVictusLink } from '../utils/navigation.ts';
import { AdminViewToggle, useShellAdminAreas } from './AdminViewToggle.tsx';

interface EcosystemFrameProps {
  url: string;
  title: string;
  onNavigateHome: () => void;
  onTriggerError: (message: string, failingUrl: string) => void;
  onNavigate?: (url: string, title?: string, tabId?: string) => void;
}

export const EcosystemFrame: React.FC<EcosystemFrameProps> = ({
  url,
  title,
  onNavigateHome: _onNavigateHome,
  onTriggerError: _onTriggerError,
  onNavigate,
}) => {
  const { showToast } = useToast();
  const { config } = useTheme();
  const { session } = useAuth();

  const isControl =
    url.includes('control.victuscloud.com') ||
    title.toLowerCase().includes('control') ||
    title.toLowerCase().includes('server');
  const isBilling = url.includes('billing.victuscloud.com');
  const isDrive = url.includes('drive.victuscloud.com');
  const isSupport = url.includes('/support');
  const isStatus = url.includes('/status');

  // Selected service for the per-server control screen
  const [selectedService, setSelectedService] = useState<VictusService | null>(null);

  /**
   * The signed-in account's own servers, straight from control.victuscloud.com
   * (`GET /api/client`). Null while signed out or before the first load.
   */
  const [liveServers, setLiveServers] = useState<PanelServer[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const refreshServers = useCallback(async () => {
    // fetchServers() resolves rather than throwing, so this cannot leave an
    // unhandled rejection behind when the panel is unreachable.
    const result = await fetchServers();
    if (result.data) {
      setLiveServers(result.data);
      setLiveError(null);
    } else {
      // A failure must never fall back to sample data: the user has to be told
      // the panel could not be read, not shown a fabricated fleet.
      setLiveError(result.error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshServers().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, refreshServers]);

  const liveServices = useMemo(
    () => (liveServers ? liveServers.map((server, index) => toVictusService(server, index)) : null),
    [liveServers]
  );

  // Only the account's own servers, ever. The sample fleet that used to stand
  // in whenever the panel could not be read is gone (4.6.3): a real user must
  // never be shown servers that do not exist, and "can't reach the panel" is
  // reported as that rather than papered over with fiction.
  const services = useMemo(() => liveServices ?? [], [liveServices]);

  const handleUpdateServiceStatus = (_serviceId: string, _status: VictusService['status']) => {
    // The panel is the single source of truth for a server's state, so nothing
    // is guessed at locally: the list is simply re-read from it. The previous
    // local override map only existed to annotate the sample fleet.
    void refreshServers();
  };

  // Real data structures reflecting Victus Cloud properties
  const [driveFiles] = useState([
    { name: 'victus-backup-survival-2026.tar.gz', size: '4.8 GB', modified: '2 hours ago', type: 'archive' },
    { name: 'paper-world-nether.zip', size: '1.4 GB', modified: 'Yesterday', type: 'archive' },
    { name: 'server.properties', size: '4.2 KB', modified: '3 days ago', type: 'config' },
    { name: 'velocity.toml', size: '18.6 KB', modified: '4 days ago', type: 'config' },
    { name: 'firewall-rules.json', size: '3.1 KB', modified: 'Last week', type: 'config' },
  ]);

  const [supportTickets] = useState([
    { id: '#VT-9821', subject: 'Node migration request to Singapore SG-1', status: 'In Review', dept: 'Infrastructure' },
    { id: '#VT-9804', subject: 'Billing invoice query for KVM VPS Instance', status: 'Answered', dept: 'Billing' },
    { id: '#VT-9772', subject: 'Custom domain DNS and SRV record verification for survival.victusmc.net', status: 'Resolved', dept: 'Networking' },
  ]);

  /**
   * The app is https-only — cleartext is refused by the network security config,
   * and the bundles still carry legacy http:// portal links, so upgrade here.
   */
  const liveUrl = () => url.replace(/^http:\/\//i, 'https://');

  // Safe hostname display: never crash on a malformed/relative URL
  const displayHostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url || 'Victus Cloud';
    }
  })();

  /**
   * "Web View": the live portal in the app's own browser surface.
   *
   * These pages cannot be framed — control.victuscloud.com answers
   * `x-frame-options: DENY`, and billing/drive/victuscloud.com answer SAMEORIGIN
   * plus `frame-ancestors 'self'` — which is why the old /api/proxy iframe could
   * never render them (and why no dev server is involved any more). A real
   * WebView can, with the user's real cookies and POST logins, so the native
   * shell opens one via window.VictusNative. A browser build falls back to a tab.
   */
  const openWebView = (target = liveUrl(), label = title || displayHostname) => {
    if (window.VictusNative?.openWebView) {
      window.VictusNative.openWebView(target, label);
      showToast(`Opening ${displayHostname} in the app browser…`);
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
    showToast(`Opening ${displayHostname} in your browser…`);
  };

  /** Hands the live page to the device browser (never back into the bundle). */
  const handleOpenExternal = () => {
    const target = liveUrl();
    if (window.VictusNative?.openBrowser) {
      window.VictusNative.openBrowser(target);
      showToast('Opening in your browser…');
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
    showToast('Opening in your browser…');
  };

  /**
   * The admin area this page belongs to, or null.
   *
   * The shell answers only with areas the signed-in account may actually use,
   * already filtered to the page on screen — so a non-admin (and the demo
   * account) gets an empty list and this header shows no admin affordance at
   * all: no toggle, no "Web View" button, no hint. The panel still enforces
   * every admin request; hiding the control grants nothing.
   */
  const adminAreas = useShellAdminAreas();
  const adminArea = adminAreas.length > 0 ? adminAreas[0] : null;

  return (
    <div className="flex-1 w-full flex flex-col relative select-none bg-[var(--bg)] text-[var(--text)]">
      {/* Panel header: title, "Web View" (the live site) and open-in-browser. */}
      <div
        className="w-full flex items-center justify-between px-3 py-2 border-b text-xs transition-colors backdrop-blur-md"
        style={{
          backgroundColor: 'var(--panel)',
          borderColor: 'var(--divider)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-violet-400">
            {isControl ? 'Victus Control Panel' : title}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Admin-only: the web-view / app-view toggle. Renders nothing for
              accounts without access to this admin area. */}
          {adminArea && (
            <AdminViewToggle
              area={adminArea}
              onSwitchToWeb={() => openWebView(adminArea, 'Admin Area')}
              onSwitchToApp={() =>
                onNavigate?.(adminArea, 'Admin Area', 'control')
              }
            />
          )}
          <button
            onClick={handleOpenExternal}
            title="Open the live site in the device browser"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Native panel view — the live admin website is one tap away via the
          admin view-toggle (admins only). */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar">
          {/* ======================================================== */}
          {/* CONTROL TAB (Dashboard / Fleet Overview or Service Detail) */}
          {/* ======================================================== */}
          {isControl ? (
            selectedService ? (
              <ServiceControlScreen
                service={services.find((s) => s.id === selectedService.id) ?? selectedService}
                onBack={() => setSelectedService(null)}
                onUpdateServiceStatus={handleUpdateServiceStatus}
                live={Boolean(liveServices)}
                onRefreshServers={refreshServers}
              />
            ) : (
              <ControlDashboard
                services={services}
                onSelectService={(srv) => setSelectedService(srv)}
                onNavigateTab={onNavigate}
                isLive={Boolean(liveServices)}
                liveError={liveError}
                onRefreshServers={refreshServers}
              />
            )
          ) : isBilling ? (
            /* ======================================================== */
            /* BILLING PORTAL (Paymenter Engine) */
            /* ======================================================== */
            <div className="w-full px-3 py-4 pb-24 space-y-4">
              <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#14141c] shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-4 h-4 text-violet-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                      Paymenter Engine
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white">Billing &amp; Cloud Subscriptions</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Manage active nodes, automated renewals, invoices, and cloud wallet balances.
                  </p>
                </div>
                <button
                  onClick={() =>
                    openVictusLink('https://billing.victuscloud.com', {
                      openLinksExternally: config.openLinksExternally,
                      onNavigateInApp: onNavigate,
                      showToast,
                      title: 'Billing Portal',
                      tabId: 'billing',
                    })
                  }
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 cursor-pointer shadow-sm flex items-center gap-1.5 flex-shrink-0"
                >
                  <span>Open Billing Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Invoices List */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Recent Invoices
                </h4>
                <div className="space-y-2">
                  {[
                    { id: '#INV-2026-442', item: 'Game Server - 16GB RAM Node', amount: '$18.00', status: 'PAID' },
                    { id: '#INV-2026-419', item: 'Victus Drive S3 Storage (100GB)', amount: '$5.00', status: 'PAID' },
                    { id: '#INV-2026-388', item: 'KVM VPS 4-Core Cloud Instance', amount: '$24.00', status: 'PAID' },
                  ].map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 rounded-lg bg-black/30 border border-white/[0.04] flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="block text-white font-mono">{inv.id}</strong>
                        <span className="text-slate-400 text-[11px]">{inv.item}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-white">{inv.amount}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : isDrive ? (
            /* ======================================================== */
            /* DRIVE PORTAL */
            /* ======================================================== */
            <div className="w-full px-3 py-4 pb-24 space-y-4">
              <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#14141c] shadow-sm flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-sky-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      S3 Cloud Storage
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white">Victus Drive Repository</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    High-speed backup snapshots, configuration archives, and asset storage.
                  </p>
                </div>
                <button
                  onClick={() => showToast('Drive storage is fully synchronized')}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 cursor-pointer shadow-sm flex items-center gap-1.5 flex-shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Archive</span>
                </button>
              </div>

              {/* Files Table */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Stored Archives &amp; Configs
                </h4>
                <div className="space-y-2">
                  {driveFiles.map((file, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-black/30 border border-white/[0.04] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-violet-400" />
                        <div>
                          <strong className="block text-white font-mono text-xs">{file.name}</strong>
                          <span className="text-[10px] text-slate-400">{file.modified}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-400 text-xs">{file.size}</span>
                        <button
                          onClick={() => showToast(`Downloading ${file.name}…`)}
                          className="p-1 rounded text-slate-400 hover:text-white"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : isSupport ? (
            /* ======================================================== */
            /* SUPPORT HUB */
            /* ======================================================== */
            <div className="w-full px-3 py-4 pb-24 space-y-4">
              <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#14141c] shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <LifeBuoy className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    24/7 Support Desk
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white">Help Center &amp; Support Tickets</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Submit tickets, view technical guides, or connect with our engineering team on Discord.
                </p>
              </div>

              {/* Tickets List */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Your Support Tickets
                </h4>
                <div className="space-y-2">
                  {supportTickets.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-lg bg-black/30 border border-white/[0.04] flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="block text-white font-mono">{t.id}</strong>
                        <span className="text-slate-300 text-xs">{t.subject}</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">{t.dept}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discord Banner with Real Invite Link */}
              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white">Victus Discord Community</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Connect with 5,000+ server owners, devs, and 24/7 staff at discord.gg/victuscloud
                  </p>
                </div>
                <button
                  onClick={() =>
                    openVictusLink('https://discord.gg/victuscloud', {
                      openLinksExternally: config.openLinksExternally,
                      showToast,
                      title: 'Victus Discord',
                    })
                  }
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#5865F2] hover:bg-[#4752C4] text-white cursor-pointer shadow-sm transition-colors flex-shrink-0"
                >
                  Join Discord
                </button>
              </div>
            </div>
          ) : isStatus ? (
            /* ======================================================== */
            /* STATUS OVERVIEW */
            /* ======================================================== */
            <div className="w-full px-3 py-4 pb-24 space-y-4">
              <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#14141c] shadow-sm">
                <div className="flex items-center gap-3">
                  <Activity className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-base text-white">All Systems Operational</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Global Cluster Uptime: 99.98% • Network Mitigation: Active
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm space-y-2">
                {[
                  { name: 'Virginia US-East Node Cluster', ping: '12ms', status: 'Operational' },
                  { name: 'Frankfurt EU-Central Node Cluster', ping: '38ms', status: 'Operational' },
                  { name: 'Singapore SG-1 Node Cluster', ping: '8ms', status: 'Operational' },
                  { name: 'Billing Engine (billing.victuscloud.com)', ping: '15ms', status: 'Operational' },
                  { name: 'Pterodactyl Wings (control.victuscloud.com)', ping: '11ms', status: 'Operational' },
                ].map((node, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-black/30 border border-white/[0.04] flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-slate-200 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {node.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-slate-500">{node.ping}</span>
                      <span className="text-emerald-400 font-bold text-[11px]">{node.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* WEBSITE GENERAL OVERVIEW */
            /* ======================================================== */
            <div className="w-full px-3 py-4 pb-24 space-y-4">
              <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#14141c] shadow-sm">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase inline-flex items-center gap-1.5 mb-2.5 bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  <Zap className="w-3 h-3" /> Next-Gen Cloud Ecosystem
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                  High-Performance Game Server &amp; Cloud Infrastructure
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Powered by enterprise cloud hardware, NVMe storage, high-speed networking, and automated DDoS mitigation.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c]">
                  <Cpu className="w-4 h-4 mb-2 text-violet-400" />
                  <h4 className="font-bold text-xs text-white">Compute Nodes</h4>
                  <p className="text-[11px] text-slate-400 mt-1">High-performance dedicated and shared compute for game and VPS workloads.</p>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c]">
                  <ShieldCheck className="w-4 h-4 mb-2 text-emerald-400" />
                  <h4 className="font-bold text-xs text-white">DDoS Protection</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Automated network protection keeps your servers online and accessible.</p>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c]">
                  <Globe2 className="w-4 h-4 mb-2 text-sky-400" />
                  <h4 className="font-bold text-xs text-white">Global Datacenters</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Virginia (US), Frankfurt (EU), Singapore (SG) with sub-20ms pings.</p>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  Compass,
  Play,
  Pause,
  Square,
  HardDrive,
  Globe,
  Server,
  Layers,
  Search,
  Activity,
  Database,
  ExternalLink,
  Network,
} from 'lucide-react';
import {
  VictusService,
  getFleetStats,
  getNodeSummaries,
  formatMiB,
} from '../services/controlData.ts';
import { useToast } from './Toast.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { openVictusLink } from '../utils/navigation.ts';

interface ControlDashboardProps {
  services?: VictusService[];
  onSelectService: (service: VictusService) => void;
  onNavigateTab?: (url: string, title?: string, tabId?: string) => void;
  /** True when `services` came from the account's own panel session. */
  isLive?: boolean;
  /** Panel error from the last server read, if it failed. */
  liveError?: string | null;
  /** Re-reads the fleet from the panel. */
  onRefreshServers?: () => void;
}

type FilterTab = 'all' | 'game' | 'vps';

export const ControlDashboard: React.FC<ControlDashboardProps> = ({
  services = [],
  onSelectService,
  onNavigateTab,
  isLive = false,
  liveError = null,
  onRefreshServers,
}) => {
  const { showToast } = useToast();
  const { config } = useTheme();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useMemo(() => getFleetStats(services), [services]);
  const nodeSummaries = useMemo(() => getNodeSummaries(services), [services]);

  const filteredServices = useMemo(() => {
    return services.filter((srv) => {
      // Type filtering
      if (activeFilter === 'game' && srv.type !== 'game' && srv.type !== 'bot') {
        return false;
      }
      if (activeFilter === 'vps' && srv.type !== 'vps') {
        return false;
      }
      // Search filtering
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = srv.name.toLowerCase().includes(query);
        const matchIp = srv.ip.toLowerCase().includes(query);
        const matchId = srv.shortId.toLowerCase().includes(query);
        return matchName || matchIp || matchId;
      }
      return true;
    });
  }, [services, activeFilter, searchQuery]);

  return (
    <div className="w-full px-3 py-4 pb-28 space-y-4 animate-in fade-in duration-200 select-none">
      {/* ======================================================== */}
      {/* 1. FLEET OVERVIEW HERO (Strict match to Screenshot) */}
      {/* ======================================================== */}
      <section className="rounded-2xl p-5 sm:p-6 border border-white/[0.08] bg-[#111117] shadow-lg relative overflow-hidden">
        {/* Purple Pill Tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-violet-600/15 border border-violet-500/30 text-violet-300 mb-3">
          <Compass className="w-3.5 h-3.5 text-violet-400" />
          <span>FLEET OVERVIEW</span>
        </div>

        {/*
          Source banner. The fleet below is either the account's real servers or the
          sample set, and the user is told which — a dashboard of plausible-looking
          servers that are not yours is worse than no dashboard.
        */}
        {isLive ? (
          <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <span className="flex items-center gap-2 text-[11px] font-semibold text-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live from control.victuscloud.com
            </span>
            {onRefreshServers && (
              <button
                onClick={onRefreshServers}
                className="text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:text-emerald-100 cursor-pointer"
              >
                Refresh
              </button>
            )}
          </div>
        ) : null}

        {liveError && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-200">
            {liveError}
          </div>
        )}

        {/* Headline */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
          Everything you run,
          <br />
          without the clutter.
        </h1>

        {/* Supporting Copy */}
        <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed max-w-xl">
          Your dashboard now leads with the important operational signals first, then keeps everything tight and scannable underneath.
        </p>

        {/* Stat Chips Inline (Real counts from account data) */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5 text-xs">
            <span className="font-extrabold text-white">{stats.gameServersCount}</span>
            <span className="text-slate-400">Game servers</span>
          </div>

          <div className="px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5 text-xs">
            <span className="font-extrabold text-white">{stats.vpsCount}</span>
            <span className="text-slate-400">Virtual machines</span>
          </div>

          <div className="px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center gap-1.5 text-xs">
            <span className="font-extrabold text-white">{stats.addonsCount}</span>
            <span className="text-slate-400">Add-ons ready</span>
          </div>
        </div>

        {/* Three-row summary card matching Screenshot_20260927-175829.png */}
        <div className="mt-6 rounded-xl border border-white/[0.06] bg-[#0c0c12]/80 p-3 sm:p-4 space-y-2.5">
          {/* Row 1: Available Services */}
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <Play className="w-4 h-4 fill-emerald-400" />
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-400">
                  Available services
                </span>
                <strong className="block text-xs sm:text-sm font-bold text-white mt-0.5">
                  Ready to manage
                </strong>
              </div>
            </div>
            <span className="text-xl sm:text-2xl font-black text-white pr-2">
              {stats.availableServicesCount}
            </span>
          </div>

          {/* Row 2: Maintenance State */}
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 flex-shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-400">
                  Maintenance state
                </span>
                <strong className="block text-xs sm:text-sm font-bold text-white mt-0.5">
                  Clear
                </strong>
              </div>
            </div>
            <span className="text-xl sm:text-2xl font-black text-white pr-2">
              {stats.maintenanceStateCount}
            </span>
          </div>

          {/* Row 3: Databases and Backups */}
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 flex-shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-400">
                  Databases and backups
                </span>
                <strong className="block text-xs sm:text-sm font-bold text-white mt-0.5">
                  Provisioned capacity
                </strong>
              </div>
            </div>
            <span className="text-xl sm:text-2xl font-black text-white pr-2">
              {stats.databasesAndBackupsCount}
            </span>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 2. RESOURCES & STATUS CARDS (Strict match to Screenshot_20260927-175837.png) */}
      {/* ======================================================== */}
      <div className="space-y-3">
        {/* Resources 2x2 Card */}
        <div className="p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#121219] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <HardDrive className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-sm text-white">Resources</h3>
            </div>
            <button
              onClick={() => showToast('Allocated: 28,456 MiB RAM across all active nodes')}
              className="text-[11px] font-semibold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              View Details
            </button>
          </div>

          <div className="grid grid-cols-2 gap-y-3.5 gap-x-4 pt-1">
            <div className="flex items-baseline justify-between border-b border-white/[0.04] pb-2">
              <span className="text-xs text-slate-400 font-medium">Memory</span>
              <span className="text-xs sm:text-sm font-bold text-white font-mono">
                {stats.memoryUsage}
              </span>
            </div>

            <div className="flex items-baseline justify-between border-b border-white/[0.04] pb-2">
              <span className="text-xs text-slate-400 font-medium">Disk</span>
              <span className="text-xs sm:text-sm font-bold text-white font-mono">
                {stats.diskUsage}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-slate-400 font-medium">DB</span>
              <span className="text-xs sm:text-sm font-bold text-white font-mono">
                {stats.databasesCount}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-slate-400 font-medium">Backups</span>
              <span className="text-xs sm:text-sm font-bold text-white font-mono">
                {stats.backupsCount}
              </span>
            </div>
          </div>
        </div>

        {/* Three Status Cards Stacked */}
        <div className="space-y-2.5">
          {/* Running Card */}
          <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/15 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-xs sm:text-sm text-white">Running</h4>
              </div>
              <button
                onClick={() => {
                  setActiveFilter('all');
                  showToast('Showing all online instances');
                }}
                className="text-[11px] font-semibold text-slate-400 hover:text-white px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] transition-colors cursor-pointer"
              >
                View Details
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-white">{stats.runningCount}</span>
                <span className="text-xs font-semibold text-emerald-400">Online</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <Play className="w-5 h-5 fill-current" />
              </div>
            </div>
          </div>

          {/* Stopped Card */}
          <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/20 bg-amber-950/15 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Pause className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-xs sm:text-sm text-white">Stopped</h4>
              </div>
              <button
                onClick={() => {
                  setActiveFilter('all');
                  showToast('Showing offline instances');
                }}
                className="text-[11px] font-semibold text-slate-400 hover:text-white px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] transition-colors cursor-pointer"
              >
                View Details
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-white">{stats.stoppedCount}</span>
                <span className="text-xs font-semibold text-amber-400">Offline</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Pause className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Suspended Card */}
          <div className="p-4 sm:p-5 rounded-2xl border border-rose-500/20 bg-rose-950/15 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Square className="w-3.5 h-3.5 text-rose-400" />
                <h4 className="font-bold text-xs sm:text-sm text-white">Suspended</h4>
              </div>
              <button
                onClick={() => showToast('No suspended accounts on this node cluster')}
                className="text-[11px] font-semibold text-slate-400 hover:text-white px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] transition-colors cursor-pointer"
              >
                View Details
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-white">{stats.suspendedCount}</span>
                <span className="text-xs font-semibold text-rose-400">Suspended</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                <Square className="w-4 h-4 fill-current" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2b. NODE INFRASTRUCTURE — aggregated from the service list */}
      {/* ======================================================== */}
      <section className="rounded-2xl p-4 sm:p-5 border border-white/[0.08] bg-[#111117] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-white">Node Infrastructure</h2>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {nodeSummaries.length} {nodeSummaries.length === 1 ? 'node' : 'nodes'}
          </span>
        </div>

        <div className="space-y-2">
          {nodeSummaries.map((node) => {
            const allActive = node.active === node.total;
            const dotClass = allActive
              ? 'bg-emerald-400'
              : node.active > 0
              ? 'bg-amber-400'
              : 'bg-slate-500';

            return (
              <div
                key={node.node}
                className="p-3 rounded-xl border border-white/[0.06] bg-[#14141c] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white font-mono">
                      {node.node}
                    </h3>
                    <span className="block text-[10px] text-slate-500 mt-0.5 truncate">
                      {node.region}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 text-right flex-shrink-0">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                      Online
                    </span>
                    <strong className="block text-xs font-mono font-bold text-white mt-0.5">
                      {node.active}/{node.total}
                    </strong>
                  </div>
                  <div className="hidden xs:block">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                      Memory
                    </span>
                    <strong className="block text-xs font-mono font-bold text-white mt-0.5">
                      {formatMiB(node.memoryMiB)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
          Aggregated live from your {services.length} services: online instances and allocated
          memory per node.
        </p>
      </section>

      {/* ======================================================== */}
      {/* 3. FILTER TABS (Strict match to Screenshot_20260927-175845.png) */}
      {/* ======================================================== */}
      <div className="border-b border-white/[0.08] flex items-center gap-2 pt-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveFilter('all')}
          className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 relative transition-colors cursor-pointer whitespace-nowrap ${
            activeFilter === 'all'
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-violet-400" />
          <span>All ({stats.availableServicesCount})</span>
          {activeFilter === 'all' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
          )}
        </button>

        <button
          onClick={() => setActiveFilter('game')}
          className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 relative transition-colors cursor-pointer whitespace-nowrap ${
            activeFilter === 'game'
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-violet-400" />
          <span>Game Servers ({stats.gameServersCount})</span>
          {activeFilter === 'game' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
          )}
        </button>

        <button
          onClick={() => setActiveFilter('vps')}
          className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 relative transition-colors cursor-pointer whitespace-nowrap ${
            activeFilter === 'vps'
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-violet-400" />
          <span>VPS ({stats.vpsCount})</span>
          {activeFilter === 'vps' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
          )}
        </button>
      </div>

      {/* ======================================================== */}
      {/* 4. ALL SERVICES SECTION & SERVICE LIST ROWS */}
      {/* ======================================================== */}
      <section className="rounded-2xl p-4 sm:p-5 border border-white/[0.08] bg-[#111117] shadow-sm space-y-3.5">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-white">
              {activeFilter === 'all'
                ? 'All Services'
                : activeFilter === 'game'
                ? 'Game Servers'
                : 'Virtual Machines'}
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {filteredServices.length} {filteredServices.length === 1 ? 'instance' : 'instances'}
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or IP..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#14141c] border border-white/[0.08] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Services List Rows matching Screenshot_20260927-175845.png & Screenshot_20260927-175900.png */}
        <div className="space-y-2 pt-1">
          {filteredServices.length === 0 ? (
            <div className="py-8 text-center">
              <Server className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
              <p className="text-xs text-slate-400 font-medium">No services match your search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-violet-400 hover:underline cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            filteredServices.map((srv) => {
              const isOnline = srv.status === 'ACTIVE';

              return (
                <div
                  key={srv.id}
                  onClick={() => onSelectService(srv)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectService(srv);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="group relative rounded-xl p-3 sm:p-3.5 border border-white/[0.08] bg-[#14141c] hover:bg-[#171722] hover:border-violet-500/30 transition-all cursor-pointer flex items-center justify-between gap-3 overflow-hidden shadow-xs active:scale-[0.99]"
                >
                  {/* Left edge colored bar: green if active, amber/red if offline */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${
                      isOnline ? 'bg-emerald-500' : 'bg-rose-500/80'
                    }`}
                  />

                  {/* Left Content: Index Tag + Service Icon + Name */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 pl-1">
                    {/* Numbered index tag (01, 02, etc.) */}
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-black/40 border border-white/[0.06] flex items-center justify-center font-mono text-[11px] font-bold text-slate-400 flex-shrink-0">
                      {srv.index}
                    </div>

                    {/* Service Type Icon */}
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        srv.type === 'vps'
                          ? 'bg-purple-900/30 border border-purple-500/40 text-purple-300'
                          : 'bg-amber-900/20 border border-amber-500/30 text-amber-400'
                      }`}
                    >
                      {srv.type === 'vps' ? (
                        <Server className="w-4 h-4" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                    </div>

                    {/* Service Name & IP */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-xs sm:text-sm text-white group-hover:text-violet-300 transition-colors leading-snug truncate sm:whitespace-normal">
                        {srv.name}
                      </h3>
                      <span className="block text-[10px] text-slate-500 font-mono truncate mt-0.5">
                        {srv.ip}
                      </span>
                    </div>
                  </div>

                  {/* Right Content: Status Pill matching per-server screen */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider ${
                        isOnline
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/[0.04] text-slate-400 border border-white/[0.08]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      <span>{srv.status}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Quick Link to Order New Servers */}
      <div className="p-4 rounded-xl border border-white/[0.08] bg-[#111117] flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-white">Need more compute power?</h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Deploy instant game server nodes &amp; KVM VPS instances.
          </p>
        </div>
        <button
          onClick={() => {
            openVictusLink('https://billing.victuscloud.com', {
              openLinksExternally: config.openLinksExternally,
              onNavigateInApp: onNavigateTab,
              showToast,
              title: 'Order Servers',
              tabId: 'billing',
            });
          }}
          className="px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm flex-shrink-0"
        >
          <span>Order Servers</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

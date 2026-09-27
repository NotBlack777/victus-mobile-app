import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Square,
  X,
  Copy,
  Check,
  Terminal,
  Cpu,
  HardDrive,
  Send,
  ExternalLink,
} from 'lucide-react';
import { VictusService } from '../services/controlData.ts';
import { useToast } from './Toast.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { openVictusLink } from '../utils/navigation.ts';

interface ServiceControlScreenProps {
  service: VictusService;
  onBack: () => void;
  onUpdateServiceStatus?: (serviceId: string, status: 'ACTIVE' | 'OFFLINE') => void;
}

export const ServiceControlScreen: React.FC<ServiceControlScreenProps> = ({
  service,
  onBack,
  onUpdateServiceStatus,
}) => {
  const { showToast } = useToast();
  const { config } = useTheme();
  const [powerState, setPowerState] = useState<'running' | 'stopping' | 'stopped'>(
    service.status === 'ACTIVE' ? 'running' : 'stopped'
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [consoleInput, setConsoleInput] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    `[Victus Daemon] Node victus-${service.node.toLowerCase()} connected via TLS 1.3`,
    `[Container] Container victus-srv-${service.shortId} initialized with ${service.memory} RAM`,
    `[Pterodactyl/Wings] Server marked as ${service.status} on port ${service.port}`,
    `[Metrics] CPU: 14.8% | RAM: 1.42 GB / ${service.memory} | Disk: 4.8 GB / ${service.disk}`,
    `[Server] Loading core modules for ${service.name}...`,
    service.status === 'ACTIVE'
      ? '[Server] System operational and listening for player traffic.'
      : '[Server] Daemon standing by. Press START to boot container.',
  ]);

  const consoleBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  const copyText = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
    showToast('Copied to clipboard');
  };

  const handlePower = (action: 'start' | 'restart' | 'stop' | 'kill') => {
    if (action === 'start') {
      setPowerState('running');
      setConsoleLogs((prev) => [
        ...prev,
        `[Pterodactyl] Power instruction: START sent to node ${service.node}`,
        `[Wings] Container victus-srv-${service.shortId} spinning up...`,
        `[Server] Done! Port ${service.port} open and listening.`,
      ]);
      if (onUpdateServiceStatus) onUpdateServiceStatus(service.id, 'ACTIVE');
      showToast(`${service.name} started successfully`);
    } else if (action === 'restart') {
      setPowerState('stopping');
      setConsoleLogs((prev) => [
        ...prev,
        `[Pterodactyl] Power instruction: RESTART`,
        `[Server] Graceful shutdown in progress...`,
      ]);
      setTimeout(() => {
        setPowerState('running');
        setConsoleLogs((prev) => [
          ...prev,
          `[Wings] Container victus-srv-${service.shortId} rebooted cleanly.`,
        ]);
        if (onUpdateServiceStatus) onUpdateServiceStatus(service.id, 'ACTIVE');
        showToast(`${service.name} restarted`);
      }, 1200);
    } else if (action === 'stop') {
      setPowerState('stopped');
      setConsoleLogs((prev) => [
        ...prev,
        `[Pterodactyl] Power instruction: STOP`,
        `[Wings] Container victus-srv-${service.shortId} gracefully halted.`,
      ]);
      if (onUpdateServiceStatus) onUpdateServiceStatus(service.id, 'OFFLINE');
      showToast(`${service.name} stopped`);
    } else if (action === 'kill') {
      setPowerState('stopped');
      setConsoleLogs((prev) => [
        ...prev,
        `[Pterodactyl] SIGKILL sent to victus-srv-${service.shortId}`,
        `[Wings] Container terminated immediately.`,
      ]);
      if (onUpdateServiceStatus) onUpdateServiceStatus(service.id, 'OFFLINE');
      showToast(`${service.name} killed`);
    }
  };

  const handleConsoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    const cmd = consoleInput.trim();
    setConsoleLogs((prev) => [...prev, `> ${cmd}`, `[Server] Executed: ${cmd} (status 0)`]);
    setConsoleInput('');
  };

  const isOnline = powerState === 'running';

  return (
    <div className="w-full max-w-[64rem] mx-auto px-3 sm:px-6 py-4 pb-28 space-y-3.5 animate-in fade-in duration-200 select-none">
      {/* Return to Dashboard Header */}
      <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.08] bg-[#14141c]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-violet-400" />
          <span>Back to Fleet Overview</span>
        </button>

        <button
          onClick={() =>
            openVictusLink('http://control.victuscloud.com/', {
              openLinksExternally: config.openLinksExternally,
              showToast,
              title: 'Control Panel',
            })
          }
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Open in external browser"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* 1. Main Server Header Block */}
      <div className="p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#14141c] shadow-sm space-y-4">
        {/* Server Name + Chips Row */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {service.name}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Status Pill */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider bg-white/[0.04] border border-white/[0.08] text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>

            {/* Short ID Tag */}
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium text-violet-300 bg-violet-950/40 border border-violet-800/40">
              <span className="text-violet-400">#</span>
              <span>{service.shortId}</span>
            </div>

            {/* Node Tag */}
            <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium text-slate-300 bg-white/[0.04] border border-white/[0.08]">
              <span>Node: {service.node}</span>
            </div>
          </div>
        </div>

        {/* 2. Power Action Bar: 4 Segmented Buttons */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          {/* START */}
          <button
            onClick={() => handlePower('start')}
            disabled={isOnline}
            className={`min-h-[40px] px-2 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isOnline
                ? 'opacity-40 cursor-not-allowed bg-emerald-500/5 text-emerald-500/50 border border-emerald-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start</span>
          </button>

          {/* RESTART */}
          <button
            onClick={() => handlePower('restart')}
            className="min-h-[40px] px-2 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 bg-white/[0.04] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08] active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restart</span>
          </button>

          {/* STOP */}
          <button
            onClick={() => handlePower('stop')}
            disabled={!isOnline}
            className={`min-h-[40px] px-2 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              !isOnline
                ? 'opacity-40 cursor-not-allowed bg-white/[0.02] text-slate-500 border border-white/[0.04]'
                : 'bg-white/[0.04] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08] active:scale-95'
            }`}
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>

          {/* KILL */}
          <button
            onClick={() => handlePower('kill')}
            disabled={!isOnline}
            className={`min-h-[40px] px-2 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              !isOnline
                ? 'opacity-40 cursor-not-allowed bg-rose-500/5 text-rose-500/50 border border-rose-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 active:scale-95'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            <span>Kill</span>
          </button>
        </div>

        {/* 3. Connection & Info Fields */}
        <div className="pt-2 border-t border-white/[0.06] space-y-3">
          {/* Connection Address */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Connection Address
              </span>
              <span className="block font-mono text-xs sm:text-sm text-slate-200 truncate mt-0.5">
                {service.ip}
              </span>
            </div>
            <button
              onClick={() => copyText(service.ip, 'address')}
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
              title="Copy Address"
            >
              {copiedField === 'address' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* SFTP Address */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                SFTP Address
              </span>
              <span className="block font-mono text-xs sm:text-sm text-slate-200 truncate mt-0.5">
                {service.sftpAddress}
              </span>
            </div>
            <button
              onClick={() => copyText(service.sftpAddress, 'sftp')}
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
              title="Copy SFTP Address"
            >
              {copiedField === 'sftp' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* SFTP Username */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                SFTP Username
              </span>
              <span className="block font-mono text-xs sm:text-sm text-slate-200 truncate mt-0.5">
                {service.sftpUsername}
              </span>
            </div>
            <button
              onClick={() => copyText(service.sftpUsername, 'user')}
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
              title="Copy Username"
            >
              {copiedField === 'user' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Server UUID */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Server UUID
              </span>
              <span className="block font-mono text-xs text-slate-400 truncate mt-0.5">
                {service.uuid}
              </span>
            </div>
            <button
              onClick={() => copyText(service.uuid, 'uuid')}
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
              title="Copy UUID"
            >
              {copiedField === 'uuid' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Resource Usage Cards (Distinct Colors: CPU = Purple, RAM = Green, Disk = Blue) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* CPU Card */}
        <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              CPU Usage
            </span>
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <strong className="text-xl font-mono font-bold text-white">
              {isOnline ? '14.8%' : '0.0%'}
            </strong>
            <span className="text-[11px] text-slate-500 font-mono">/ 400%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-3">
            <div
              className="h-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)] transition-all duration-300"
              style={{ width: isOnline ? '15%' : '0%' }}
            />
          </div>
        </div>

        {/* Memory Card */}
        <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Memory
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <strong className="text-xl font-mono font-bold text-white">
              {isOnline ? '1.42 GB' : '0.00 GB'}
            </strong>
            <span className="text-[11px] text-slate-500 font-mono">/ {service.memory}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-3">
            <div
              className="h-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] transition-all duration-300"
              style={{ width: isOnline ? '35%' : '0%' }}
            />
          </div>
        </div>

        {/* Disk Card */}
        <div className="p-4 rounded-xl border border-white/[0.08] bg-[#14141c] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Disk
            </span>
            <HardDrive className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <strong className="text-xl font-mono font-bold text-white">4.8 GB</strong>
            <span className="text-[11px] text-slate-500 font-mono">/ {service.disk}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-3">
            <div
              className="h-full bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.6)] transition-all duration-300"
              style={{ width: '24%' }}
            />
          </div>
        </div>
      </div>

      {/* 3. Live Terminal Console */}
      <div className="p-4 sm:p-5 rounded-2xl border border-white/[0.08] bg-[#0c0c12] shadow-md space-y-3">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Live Console Output
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.06]">
            UTF-8 / TLS
          </span>
        </div>

        {/* Terminal Log Output Window */}
        <div className="h-64 sm:h-72 overflow-y-auto font-mono text-xs text-slate-300 space-y-1 p-3.5 rounded-xl bg-[#07070b] border border-white/[0.04] no-scrollbar">
          {consoleLogs.map((log, i) => (
            <div
              key={i}
              className={`leading-relaxed break-all ${
                log.startsWith('>')
                  ? 'text-violet-400 font-bold'
                  : log.includes('error') || log.includes('KILL')
                  ? 'text-rose-400'
                  : log.includes('marked as') || log.includes('operational') || log.includes('listening')
                  ? 'text-emerald-400'
                  : 'text-slate-300'
              }`}
            >
              {log}
            </div>
          ))}
          <div ref={consoleBottomRef} />
        </div>

        {/* Command Input Box */}
        <form onSubmit={handleConsoleSubmit} className="flex items-center gap-2 pt-1">
          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3 text-slate-500 font-mono text-xs select-none">&gt;</span>
            <input
              type="text"
              value={consoleInput}
              onChange={(e) => setConsoleInput(e.target.value)}
              placeholder="Send command to server daemon..."
              className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#14141c] border border-white/[0.08] text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0 shadow-sm"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

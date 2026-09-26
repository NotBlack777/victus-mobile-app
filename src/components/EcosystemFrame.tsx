import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Copy,
  Lock,
  Server,
  Play,
  Square,
  RotateCcw,
  HardDrive,
  Upload,
  Download,
  Terminal,
  CreditCard,
  LifeBuoy,
  Activity,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Send,
  Eye,
} from 'lucide-react';
import { useToast } from './Toast.tsx';

interface EcosystemFrameProps {
  url: string;
  title: string;
  onNavigateHome: () => void;
  onTriggerError: (message: string, failingUrl: string) => void;
}

export const EcosystemFrame: React.FC<EcosystemFrameProps> = ({
  url,
  title,
  onNavigateHome: _onNavigateHome,
  onTriggerError,
}) => {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'app' | 'iframe'>('app');
  const [iframeError, setIframeError] = useState(false);
  const [serverPower, setServerPower] = useState<'running' | 'stopping' | 'stopped'>('running');
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[Victus Daemon] Node victus-us-node01 connected via TLS 1.3',
    '[Container] Container victus-srv-1849 initialized with 4096MB RAM',
    '[Pterodactyl/Wings] Server marked as RUNNING on port 25565',
    '[Metrics] CPU: 14.8% | RAM: 1.42 GB / 4.00 GB | Disk: 4.8 GB',
  ]);
  const [driveFiles, setDriveFiles] = useState([
    { name: 'server_backup_2026.tar.gz', size: '242 MB', modified: '2 hours ago', type: 'archive' },
    { name: 'world_data.zip', size: '89 MB', modified: 'Yesterday', type: 'archive' },
    { name: 'server.properties', size: '4.2 KB', modified: '3 days ago', type: 'config' },
    { name: 'victus-cloud-manual.pdf', size: '1.2 MB', modified: 'Last week', type: 'doc' },
  ]);
  const [supportTickets] = useState([
    { id: '#VT-9821', subject: 'Node migration request', status: 'In Review', dept: 'Infrastructure' },
    { id: '#VT-9804', subject: 'Billing invoice query', status: 'Answered', dept: 'Billing' },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset iframe error when URL changes
    setIframeError(false);
  }, [url]);

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard');
  };

  const openExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleConsoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    const cmd = consoleInput.trim();
    setConsoleLogs((prev) => [...prev, `> ${cmd}`, `[Server] Executed: ${cmd} (status 0)`]);
    setConsoleInput('');
  };

  const handlePower = (action: 'start' | 'restart' | 'stop') => {
    if (action === 'start') {
      setServerPower('running');
      setConsoleLogs((prev) => [...prev, '[Daemon] Starting container...', '[Pterodactyl] Server status: RUNNING']);
      showToast('Server started');
    } else if (action === 'restart') {
      setServerPower('running');
      setConsoleLogs((prev) => [...prev, '[Daemon] Restarting container...', '[Pterodactyl] Server restarted successfully']);
      showToast('Server restarted');
    } else {
      setServerPower('stopped');
      setConsoleLogs((prev) => [...prev, '[Daemon] Stopping container gracefully...', '[Pterodactyl] Server status: STOPPED']);
      showToast('Server stopped');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`;
      setDriveFiles((prev) => [
        { name: file.name, size: sizeStr, modified: 'Just now', type: 'file' },
        ...prev,
      ]);
      showToast(`Uploaded ${file.name} to Victus Drive`);
    }
  };

  const handleFileDownload = (fileName: string) => {
    showToast(`Downloading ${fileName}…`);
    setTimeout(() => {
      showToast(`Saved ${fileName} to Downloads/VictusCloud`);
    }, 1200);
  };

  // Determine current ecosystem panel type
  const isControl = url.includes('control.victuscloud.com');
  const isBilling = url.includes('billing.victuscloud.com');
  const isDrive = url.includes('drive.victuscloud.com');
  const isSupport = url.includes('/support');
  const isStatus = url.includes('/status');
  const isMarketplace = url.includes('/marketplace');

  return (
    <div className="w-full max-w-[61.25rem] mx-auto px-3 sm:px-6 pt-3 pb-24 animate-in fade-in duration-200">
      {/* Mini Browser Bar */}
      <div
        className="w-full rounded-2xl p-2.5 sm:p-3 mb-4 border flex items-center justify-between gap-2 text-xs backdrop-blur-md"
        style={{
          backgroundColor: 'var(--panel)',
          borderColor: 'var(--line-soft)',
        }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/20 border border-white/5">
          <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="truncate font-mono text-[11px] opacity-90 select-all">{url}</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setViewMode(viewMode === 'app' ? 'iframe' : 'app')}
            title={viewMode === 'app' ? 'Switch to live iframe loader' : 'Switch to native panel view'}
            className="px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 border transition-all text-[11px] cursor-pointer hover:bg-white/10"
            style={{ borderColor: 'var(--line-soft)' }}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">{viewMode === 'app' ? 'Live Web' : 'Panel View'}</span>
          </button>

          <button
            onClick={copyUrl}
            title="Copy URL"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 opacity-80" />
          </button>

          <button
            onClick={openExternal}
            title="Open in new window"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* Mode: Live iframe view */}
      {viewMode === 'iframe' && (
        <div className="w-full rounded-2xl overflow-hidden border relative min-h-[550px]" style={{ borderColor: 'var(--line-soft)' }}>
          {iframeError ? (
            <div className="p-8 text-center flex flex-col items-center justify-center min-h-[400px]">
              <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
              <h3 className="text-lg font-bold">Browser Cross-Origin Protection</h3>
              <p className="text-xs max-w-md mt-2 opacity-70">
                This Victus Cloud server sends an <code>X-Frame-Options: SAMEORIGIN</code> header that prevents embedding inside web iframes. You can open it directly or use our native panel view.
              </p>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={openExternal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
                >
                  Open in New Tab
                </button>
                <button
                  onClick={() => setViewMode('app')}
                  className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer"
                  style={{ borderColor: 'var(--line-soft)' }}
                >
                  Switch to Panel View
                </button>
              </div>
            </div>
          ) : (
            <iframe
              src={url}
              title={title}
              className="w-full h-[650px] border-none bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onError={() => {
                setIframeError(true);
                onTriggerError('Failed to load embedded frame', url);
              }}
            />
          )}
        </div>
      )}

      {/* Mode: Native Panel View */}
      {viewMode === 'app' && (
        <div className="space-y-4">
          {/* Header banner */}
          <div
            className="p-4 sm:p-5 rounded-2xl border backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              background: 'linear-gradient(145deg, var(--panel-strong), var(--panel))',
              borderColor: 'var(--line)',
            }}
          >
            <div>
              <span
                className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full border inline-block mb-1.5"
                style={{
                  borderColor: 'var(--line)',
                  backgroundColor: 'rgba(var(--accent-1-rgb), 0.1)',
                  color: 'var(--accent-1)',
                }}
              >
                Victus Ecosystem
              </span>
              <h2 className="text-xl sm:text-2xl font-black">{title}</h2>
              <p className="text-xs opacity-70 mt-0.5">
                Connected to secure Victus Cloud network node (US-East Cluster)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openExternal}
                className="min-h-[44px] px-4 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-md"
                style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open External
              </button>
            </div>
          </div>

          {/* CONTROL PANEL VIEW */}
          {isControl && (
            <div className="space-y-4">
              {/* Server status & power card */}
              <div
                className="p-4 sm:p-5 rounded-2xl border backdrop-blur-md"
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
                    >
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base">Victus Game Server #01</h3>
                      <div className="flex items-center gap-2 text-xs opacity-70">
                        <span>Node: us-east-01</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              serverPower === 'running' ? 'bg-emerald-400' : 'bg-red-400'
                            }`}
                          />
                          {serverPower === 'running' ? 'Online' : 'Stopped'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Power Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePower('start')}
                      disabled={serverPower === 'running'}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" /> Start
                    </button>
                    <button
                      onClick={() => handlePower('restart')}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restart
                    </button>
                    <button
                      onClick={() => handlePower('stop')}
                      disabled={serverPower === 'stopped'}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-40 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  </div>
                </div>

                {/* Resource Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <span className="text-[11px] opacity-60 font-semibold uppercase block">CPU Usage</span>
                    <strong className="text-lg font-bold">{serverPower === 'running' ? '14.8%' : '0%'}</strong>
                    <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-purple-400 h-full rounded-full" style={{ width: serverPower === 'running' ? '15%' : '0%' }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <span className="text-[11px] opacity-60 font-semibold uppercase block">Memory (RAM)</span>
                    <strong className="text-lg font-bold">{serverPower === 'running' ? '1.42 GB / 4.00 GB' : '0 MB'}</strong>
                    <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-emerald-400 h-full rounded-full" style={{ width: serverPower === 'running' ? '35.5%' : '0%' }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                    <span className="text-[11px] opacity-60 font-semibold uppercase block">Disk Space</span>
                    <strong className="text-lg font-bold">4.8 GB / 25 GB</strong>
                    <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-blue-400 h-full rounded-full" style={{ width: '19.2%' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Console window */}
              <div
                className="p-4 rounded-2xl border backdrop-blur-md bg-black/40"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="text-xs font-bold flex items-center gap-1.5 opacity-80">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    Live Server Console
                  </span>
                  <span className="text-[10px] font-mono opacity-50">UTF-8 / TLS 1.3</span>
                </div>

                <div className="h-44 overflow-y-auto font-mono text-[11px] space-y-1 p-2 bg-black/50 rounded-lg select-text text-emerald-300">
                  {consoleLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed">{log}</div>
                  ))}
                </div>

                <form onSubmit={handleConsoleSubmit} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={consoleInput}
                    onChange={(e) => setConsoleInput(e.target.value)}
                    placeholder="Type server command (e.g. status, say hello, op)..."
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 focus:outline-none focus:border-purple-400 font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* BILLING PANEL VIEW */}
          {isBilling && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  className="p-4 rounded-2xl border backdrop-blur-md"
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
                >
                  <span className="text-xs opacity-60 font-semibold">Account Balance</span>
                  <h3 className="text-2xl font-black mt-1">$45.00</h3>
                  <button
                    onClick={() => showToast('Redirecting to payment top-up…')}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 cursor-pointer"
                  >
                    Add Credits
                  </button>
                </div>

                <div
                  className="p-4 rounded-2xl border backdrop-blur-md"
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
                >
                  <span className="text-xs opacity-60 font-semibold">Active Services</span>
                  <h3 className="text-2xl font-black mt-1">2 Servers</h3>
                  <span className="text-[11px] text-emerald-400 mt-2 block font-semibold">Renews next month</span>
                </div>

                <div
                  className="p-4 rounded-2xl border backdrop-blur-md"
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
                >
                  <span className="text-xs opacity-60 font-semibold">Unpaid Invoices</span>
                  <h3 className="text-2xl font-black mt-1">$0.00</h3>
                  <span className="text-[11px] text-emerald-400 mt-2 block font-semibold">Account in good standing</span>
                </div>
              </div>

              {/* Subscriptions */}
              <div
                className="p-4 sm:p-5 rounded-2xl border backdrop-blur-md"
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
              >
                <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                  Your Active Cloud Plans
                </h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between">
                    <div>
                      <strong className="block text-sm">Extreme Ryzen 9 Server (4GB)</strong>
                      <span className="text-xs opacity-60">Control Panel ID: #SRV-1849</span>
                    </div>
                    <span className="text-sm font-bold text-purple-400">$6.50 / mo</span>
                  </div>

                  <div className="p-3 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between">
                    <div>
                      <strong className="block text-sm">Victus Cloud Drive 50GB</strong>
                      <span className="text-xs opacity-60">Storage Bucket US-East</span>
                    </div>
                    <span className="text-sm font-bold text-purple-400">$2.00 / mo</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VICTUS DRIVE VIEW */}
          {isDrive && (
            <div className="space-y-4">
              <div
                className="p-4 sm:p-5 rounded-2xl border backdrop-blur-md flex items-center justify-between gap-3"
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
                  >
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Victus Cloud Drive</h3>
                    <p className="text-xs opacity-70">1.8 GB used of 50 GB</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload File
                  </button>
                </div>
              </div>

              {/* Files list */}
              <div
                className="p-4 rounded-2xl border backdrop-blur-md"
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
              >
                <h4 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-3">Storage Files</h4>
                <div className="space-y-2">
                  {driveFiles.map((file, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between gap-2 hover:bg-black/30 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold truncate">{file.name}</p>
                          <span className="text-[11px] opacity-60">
                            {file.size} • {file.modified}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleFileDownload(file.name)}
                        title="Download file"
                        className="p-2 rounded-lg hover:bg-white/10 transition-all cursor-pointer flex-shrink-0"
                      >
                        <Download className="w-4 h-4 text-purple-300" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUPPORT VIEW */}
          {isSupport && (
            <div className="space-y-4">
              <div
                className="p-4 sm:p-5 rounded-2xl border backdrop-blur-md"
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <LifeBuoy className="w-4 h-4 text-purple-400" />
                    Victus Support Hub
                  </h3>
                  <button
                    onClick={() => showToast('Opening new ticket wizard…')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 cursor-pointer"
                  >
                    Open Ticket
                  </button>
                </div>

                <div className="space-y-2">
                  {supportTickets.map((t, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[11px] font-mono text-purple-300">{t.id}</span>
                        <strong className="block text-sm">{t.subject}</strong>
                        <span className="text-[11px] opacity-60">{t.dept}</span>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discord Lounge banner */}
              <div
                className="p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between"
                style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', borderColor: 'rgba(88, 101, 242, 0.3)' }}
              >
                <div>
                  <h4 className="text-sm font-bold">Join the Victus Discord Lounge</h4>
                  <p className="text-xs opacity-80 mt-0.5">Chat with 5,000+ cloud admins, devs, and 24/7 support.</p>
                </div>
                <button
                  onClick={() => window.open('https://discord.gg/victus', '_blank')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#5865F2] hover:bg-[#4752C4] text-white cursor-pointer"
                >
                  Join Discord
                </button>
              </div>
            </div>
          )}

          {/* STATUS VIEW */}
          {isStatus && (
            <div className="space-y-4">
              <div
                className="p-4 sm:p-5 rounded-2xl border backdrop-blur-md"
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-base">All Systems Operational</h3>
                    <p className="text-xs opacity-70">Uptime: 99.98% across all global clusters</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    { name: 'US-East Node Cluster', ping: '12ms', status: 'Operational' },
                    { name: 'EU-Central Node Cluster', ping: '38ms', status: 'Operational' },
                    { name: 'Website & SSO Gateway', ping: '8ms', status: 'Operational' },
                    { name: 'Paymenter Billing Engine', ping: '15ms', status: 'Operational' },
                    { name: 'Victus Drive S3 Storage', ping: '19ms', status: 'Operational' },
                  ].map((node, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between text-xs sm:text-sm"
                    >
                      <span className="font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        {node.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs opacity-60">{node.ping}</span>
                        <span className="text-emerald-400 font-bold text-xs">{node.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GENERAL / MARKETPLACE / WEBSITE VIEW */}
          {!isControl && !isBilling && !isDrive && !isSupport && !isStatus && (
            <div
              className="p-6 rounded-2xl border backdrop-blur-md text-center"
              style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line-soft)' }}
            >
              <h3 className="text-lg font-bold">Victus Cloud {isMarketplace ? 'Marketplace' : 'Portal'}</h3>
              <p className="text-xs opacity-70 max-w-md mx-auto mt-2">
                Explore resources, server templates, add-ons, and cloud features from our ecosystem hub.
              </p>
              <button
                onClick={openExternal}
                className="mt-4 px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-2 cursor-pointer shadow-md"
                style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Launch Live Portal
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

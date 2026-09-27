import React, { useState } from 'react';
import {
  X,
  Shield,
  Mail,
  Copy,
  Check,
  LogOut,
  ExternalLink,
  Server,
  CreditCard,
  LifeBuoy,
  MessageSquare,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from './Toast.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { openVictusLink } from '../utils/navigation.ts';

interface AccountProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (url: string, title?: string, tabId?: string) => void;
}

export const AccountProfileModal: React.FC<AccountProfileModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { user, session, signOut } = useAuth();
  const { showToast } = useToast();
  const { config } = useTheme();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isOpen || !user) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    showToast(`Copied ${field} to clipboard`);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      showToast('Signed out of Victus Cloud');
      onClose();
    } catch {
      showToast('Error signing out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleServiceLink = (url: string, title: string, tabId?: string) => {
    openVictusLink(url, {
      openLinksExternally: config.openLinksExternally,
      onNavigateInApp: onNavigate,
      showToast,
      title,
      tabId,
    });
    onClose();
  };

  const displayName = user.user_metadata?.name || user.email.split('@')[0];
  const role = user.user_metadata?.role || (user.email.includes('admin') ? 'Administrator' : 'Cloud Member');
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#111117] text-white shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-36 rounded-full bg-violet-600/20 blur-[60px] pointer-events-none" />

        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#14141d]/80 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 block">
                Cloud SSO Identity
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">Account Profile</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Close profile modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto no-scrollbar relative z-10 text-xs">
          {/* User Hero Card */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-[#161622] border border-white/[0.06] flex items-center gap-3.5">
            <div className="relative flex-shrink-0">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl border-2 border-violet-500/40 bg-violet-600/20 overflow-hidden flex items-center justify-center shadow-md">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user.email}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-extrabold text-violet-300">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              {/* Online indicator dot */}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#161622]"
                title="Session active"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm sm:text-base font-bold text-white truncate">
                  {displayName}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">
                  <Shield className="w-2.5 h-2.5" />
                  {role}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 truncate text-[11px]">
                <Mail className="w-3 h-3 text-slate-500 flex-shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[10px] mt-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span>Authenticated Session</span>
              </div>
            </div>
          </div>

          {/* Session & Technical Info Section */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
              SESSION CREDENTIALS
            </span>

            {/* Account ID Row */}
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  Account ID
                </span>
                <span className="font-mono text-[11px] text-slate-200 truncate block">
                  {user.id}
                </span>
              </div>
              <button
                onClick={() => handleCopy(user.id, 'Account ID')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer flex-shrink-0"
                title="Copy Account ID"
              >
                {copiedField === 'Account ID' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Access Token Row */}
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="block text-[10px] uppercase font-semibold text-slate-400">
                  Access Token (JWT)
                </span>
                <span className="font-mono text-[11px] text-slate-200 truncate block">
                  {session?.access_token ? `${session.access_token.slice(0, 20)}••••••••` : 'None'}
                </span>
              </div>
              <button
                onClick={() => handleCopy(session?.access_token || '', 'Access Token')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer flex-shrink-0"
                title="Copy Access Token"
              >
                {copiedField === 'Access Token' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Token Lifetime */}
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Session Duration</span>
              </div>
              <span className="font-mono font-medium text-slate-300">
                7 Days (Auto-refresh)
              </span>
            </div>
          </div>

          {/* Connected Victus Cloud Services */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
              CONNECTED CLOUD PROPERTIES
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleServiceLink('http://control.victuscloud.com/', 'Control Panel', 'control')}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.06] hover:border-violet-500/30 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <Server className="w-4 h-4 text-violet-400" />
                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-violet-400 transition-colors" />
                </div>
                <span className="block font-bold text-white text-[11px]">Control Fleet</span>
                <span className="text-[10px] text-slate-400">11 Active Services</span>
              </button>

              <button
                onClick={() => handleServiceLink('http://billing.victuscloud.com', 'Billing & Services', 'billing')}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.06] hover:border-violet-500/30 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </div>
                <span className="block font-bold text-white text-[11px]">Billing Hub</span>
                <span className="text-[10px] text-slate-400">Invoices &amp; Domains</span>
              </button>

              <button
                onClick={() => handleServiceLink('https://victuscloud.com/support', 'Help Center', 'support')}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.06] hover:border-violet-500/30 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <LifeBuoy className="w-4 h-4 text-amber-400" />
                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <span className="block font-bold text-white text-[11px]">Support Center</span>
                <span className="text-[10px] text-slate-400">Priority Assistance</span>
              </button>

              <button
                onClick={() => handleServiceLink('https://discord.gg/victuscloud', 'Discord Community')}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.06] hover:border-violet-500/30 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <MessageSquare className="w-4 h-4 text-[#5865F2]" />
                  <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-[#5865F2] transition-colors" />
                </div>
                <span className="block font-bold text-white text-[11px]">Discord</span>
                <span className="text-[10px] text-slate-400">Community Server</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-[#0e0e15] flex items-center justify-between gap-3 relative z-10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="px-4 py-2 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition-all cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isSigningOut ? 'Signing out…' : 'Sign Out of Account'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

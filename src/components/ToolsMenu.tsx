import React from 'react';
import {
  Compass,
  Server,
  LifeBuoy,
  BookOpen,
  Globe,
  Layers,
  Wrench,
  ExternalLink,
  ShoppingBag,
  Headphones,
  Moon,
  Shield,
  X,
  MessageSquare,
  LogOut,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useToast } from './Toast.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { openVictusLink } from '../utils/navigation.ts';

interface ToolsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onOpenSettings: () => void;
  onNavigate: (url: string, title?: string, tabId?: string) => void;
  onOpenClearSession: () => void;
  onOpenLogin?: () => void;
  onOpenProfile?: () => void;
}

export const ToolsMenu: React.FC<ToolsMenuProps> = ({
  isOpen,
  onClose,
  currentUrl,
  onOpenSettings,
  onNavigate,
  onOpenClearSession,
  onOpenLogin,
  onOpenProfile,
}) => {
  const { showToast } = useToast();
  const { config } = useTheme();
  const { user, signOut } = useAuth();

  if (!isOpen) return null;

  const isDashboardActive =
    currentUrl.includes('control.victuscloud.com') ||
    currentUrl === '' ||
    currentUrl.includes('dashboard');

  const handleLink = (url: string, title: string, tabId?: string) => {
    openVictusLink(url, {
      openLinksExternally: config.openLinksExternally,
      onNavigateInApp: onNavigate,
      showToast,
      title,
      tabId,
    });
    onClose();
  };

  const handleLogout = async () => {
    onClose();
    await signOut();
    showToast('Signed out of Victus Cloud');
  };

  return (
    <div
      className="absolute inset-0 z-modal flex bg-black/75 backdrop-blur-xs animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* Sidebar drawer sliding from left matching reference screenshots */}
      <div
        className="w-72 sm:w-80 max-w-[85vw] h-full bg-[#0c0c12] border-r border-white/[0.08] flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Victus logo mark + wordmark */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#101017]">
          <div className="flex items-center gap-2.5">
            {/* Victus Purple Triangle Mark */}
            <div className="w-7 h-7 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-violet-500 drop-shadow-sm">
                <path d="M12 2L1 21h22L12 2zm0 4.5l7 12H5l7-12z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Victus</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Navigation Groups */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-3.5 space-y-5 no-scrollbar text-xs">
          {/* ======================================================== */}
          {/* SECTION: MAIN */}
          {/* ======================================================== */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-2.5 mb-1.5">
              MAIN
            </span>

            <div className="space-y-0.5">
              {/* Dashboard (Active State matching reference) */}
              <button
                onClick={() => {
                  onNavigate('http://control.victuscloud.com/', 'Control Panel', 'control');
                  onClose();
                }}
                className={`w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 transition-colors cursor-pointer text-left ${
                  isDashboardActive
                    ? 'bg-violet-600/20 text-white border-l-2 border-violet-500 font-semibold shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Compass className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span>Dashboard</span>
              </button>

              {/* My Servers */}
              <button
                onClick={() => {
                  onNavigate('http://control.victuscloud.com/', 'My Servers', 'control');
                  onClose();
                }}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <Server className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>My Servers</span>
              </button>

              {/* Support Tickets */}
              <button
                onClick={() => {
                  onNavigate('https://victuscloud.com/support', 'Support Tickets', 'support');
                  onClose();
                }}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <LifeBuoy className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Support Tickets</span>
              </button>

              {/* Knowledgebase */}
              <button
                onClick={() => handleLink('https://community.victuscloud.com/', 'Knowledgebase', 'community')}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <BookOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Knowledgebase</span>
              </button>

              {/* Domains */}
              <button
                onClick={() => {
                  onNavigate('http://billing.victuscloud.com', 'Domains', 'billing');
                  onClose();
                }}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Domains</span>
              </button>

              {/* VPS */}
              <button
                onClick={() => {
                  onNavigate('http://control.victuscloud.com/', 'VPS Instances', 'control');
                  onClose();
                }}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>VPS</span>
              </button>

              {/* Tools */}
              <button
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <Wrench className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Tools</span>
              </button>

              {/* Content Program */}
              <button
                onClick={() => handleLink('https://victuscloud.com/', 'Content Program', 'website')}
                className="w-full min-h-[40px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Content Program</span>
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION: PLATFORM */}
          {/* ======================================================== */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-2.5 mb-1.5">
              PLATFORM
            </span>

            <div className="space-y-1">
              {/* Order Servers (Card Button highlighted matching screenshot) */}
              <button
                onClick={() => {
                  onNavigate('http://billing.victuscloud.com', 'Order Servers', 'billing');
                  onClose();
                }}
                className="w-full min-h-[42px] px-3.5 rounded-xl flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white font-medium transition-colors cursor-pointer text-left"
              >
                <ShoppingBag className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span>Order Servers</span>
              </button>

              {/* Knowledgebase */}
              <button
                onClick={() => handleLink('https://community.victuscloud.com/', 'Knowledgebase', 'community')}
                className="w-full min-h-[38px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <BookOpen className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Knowledgebase</span>
              </button>

              {/* Network Status */}
              <button
                onClick={() => {
                  onNavigate('https://victuscloud.com/status', 'Network Status', 'status');
                  onClose();
                }}
                className="w-full min-h-[38px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Network Status</span>
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* SECTION: SUPPORT */}
          {/* ======================================================== */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-2.5 mb-1.5">
              SUPPORT
            </span>

            <div className="space-y-0.5">
              {/* Discord Server -> discord.gg/victuscloud */}
              <button
                onClick={() => handleLink('https://discord.gg/victuscloud', 'Victus Discord')}
                className="w-full min-h-[38px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <MessageSquare className="w-4 h-4 text-[#5865F2] flex-shrink-0" />
                <span>Discord Server</span>
              </button>

              {/* Help Center -> https://victuscloud.com/support */}
              <button
                onClick={() => {
                  onNavigate('https://victuscloud.com/support', 'Help Center', 'support');
                  onClose();
                }}
                className="w-full min-h-[38px] px-3 rounded-xl flex items-center gap-3 text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer text-left"
              >
                <Headphones className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Help Center</span>
              </button>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* PINNED BOTTOM ENTRIES (Profile, Theme, Admin, Log Out) */}
        {/* ======================================================== */}
        <div className="p-3 border-t border-white/[0.08] bg-[#0e0e15] space-y-1">
          {/* User Profile */}
          {user ? (
            <button
              onClick={() => {
                onClose();
                if (onOpenProfile) {
                  onOpenProfile();
                } else if (onOpenLogin) {
                  onOpenLogin();
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] hover:border-violet-500/30 flex items-center justify-between mb-1 transition-all cursor-pointer text-left active:scale-[0.99] group"
              title="View Account Profile"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-violet-600/20 text-violet-400 group-hover:bg-violet-600/30 flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white truncate">
                    {user.user_metadata?.name || user.email.split('@')[0]}
                  </span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {user.email}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-violet-400 group-hover:text-violet-300 ml-2 flex-shrink-0">
                Profile →
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                if (onOpenLogin) onOpenLogin();
              }}
              className="w-full min-h-[38px] px-3 rounded-lg flex items-center gap-3 hover:bg-white/[0.04] text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
            >
              <div className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-xs">Sign In</span>
            </button>
          )}

          {/* Theme */}
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full min-h-[38px] px-3 rounded-lg flex items-center gap-3 hover:bg-white/[0.04] text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
          >
            <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0">
              <Moon className="w-4 h-4 text-violet-400" />
            </div>
            <span className="text-xs">Theme &amp; Appearance</span>
          </button>

          {/* Admin Area */}
          <button
            onClick={() => handleLink('http://control.victuscloud.com/admin', 'Admin Area', 'control')}
            className="w-full min-h-[38px] px-3 rounded-lg flex items-center gap-3 hover:bg-white/[0.04] text-slate-300 hover:text-white transition-colors cursor-pointer text-left"
          >
            <div className="w-5 h-5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 flex items-center justify-center flex-shrink-0">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold">Admin Area</span>
          </button>

          {/* Clear local app session / cached storage */}
          <button
            onClick={() => {
              onClose();
              onOpenClearSession();
            }}
            className="w-full min-h-[38px] px-3 rounded-lg flex items-center gap-3 hover:bg-rose-500/10 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer text-left"
          >
            <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-rose-400/80" />
            </div>
            <span className="text-xs font-semibold">Clear App Session</span>
          </button>

          {/* Explicit Logout Option */}
          {user && (
            <button
              onClick={handleLogout}
              className="w-full min-h-[38px] px-3 rounded-lg flex items-center gap-3 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer text-left"
            >
              <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0">
                <LogOut className="w-4 h-4 text-rose-400" />
              </div>
              <span className="text-xs font-semibold">Log Out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

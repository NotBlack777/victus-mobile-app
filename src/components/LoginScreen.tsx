import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Sparkles, Shield, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from './Toast.tsx';

export const LoginScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          setErrorMessage(error.message);
        } else {
          showToast(`Welcome back to Victus Cloud!`);
        }
      } else {
        const { error } = await signUp(email, password, name);
        if (error) {
          setErrorMessage(error.message);
        } else {
          showToast(`Account created! Welcome to Victus Cloud.`);
        }
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setEmail('admin@victuscloud.com');
    setPassword('victus2026');
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const { error } = await signIn('admin@victuscloud.com', 'victus2026');
      if (error) {
        setErrorMessage(error.message);
      } else {
        showToast('Logged in with Admin Demo account');
      }
    } catch {
      setErrorMessage('Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#0a0a0f] text-white relative overflow-hidden select-none">
      {/* Background radial ambient glow matching Victus design system */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute -bottom-32 right-10 w-[28rem] h-[28rem] rounded-full bg-indigo-900/15 blur-[100px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full px-6 py-5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-violet-500 drop-shadow-md">
              <path d="M12 2L1 21h22L12 2zm0 4.5l7 12H5l7-12z" />
            </svg>
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white">Victus</span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-violet-600/15 border border-violet-500/30 text-violet-300">
          <Shield className="w-3.5 h-3.5 text-violet-400" />
          <span>Cloud Auth Portal</span>
        </div>
      </header>

      {/* Main Form Center Card */}
      <main className="relative z-10 w-full max-w-md mx-auto px-4 py-8 sm:py-12 my-auto">
        <div className="rounded-2xl p-6 sm:p-8 border border-white/[0.08] bg-[#121219] shadow-2xl backdrop-blur-xl">
          {/* Tag & Headline */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30 mb-2.5">
              <Zap className="w-3 h-3 text-violet-400" />
              <span>Sign in required</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {mode === 'signin' ? 'Sign in to Victus Cloud' : 'Create an Account'}
            </h1>
            <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
              Access your Ryzen 9 7950X game servers, KVM virtual machines, and cloud billing.
            </p>
          </div>

          {/* Quick Demo Access Button */}
          <button
            type="button"
            onClick={handleQuickDemoLogin}
            disabled={isLoading}
            className="w-full mb-5 py-2.5 px-4 rounded-xl border border-violet-500/40 bg-violet-950/30 hover:bg-violet-900/40 text-violet-200 font-semibold text-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
          >
            <Sparkles className="w-4 h-4 text-violet-400 group-hover:rotate-12 transition-transform" />
            <span>Continue with Demo Account (admin@victuscloud.com)</span>
          </button>

          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-white/[0.08] w-full" />
            <span className="bg-[#121219] px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Or with credentials
            </span>
            <div className="border-t border-white/[0.08] w-full" />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Cloud"
                  disabled={isLoading}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#161622] border border-white/[0.08] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@victuscloud.com"
                  disabled={isLoading}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#161622] border border-white/[0.08] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() =>
                      showToast('Use demo password: victus2026 or sign in with demo account')
                    }
                    className="text-[10px] text-violet-400 hover:text-violet-300 font-medium cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[#161622] border border-white/[0.08] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-1 text-slate-400 hover:text-white cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <span>{mode === 'signin' ? 'Sign In to Dashboard' : 'Create Cloud Account'}</span>
              )}
            </button>
          </form>

          {/* Toggle between Sign In and Sign Up */}
          <div className="mt-5 text-center pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-slate-400">
              {mode === 'signin' ? "Don't have an account yet?" : 'Already have an account?'}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setErrorMessage(null);
                }}
                className="ml-1.5 text-violet-400 font-bold hover:underline cursor-pointer"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Feature Highlights beneath */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="font-bold text-slate-400 block">7950X Nodes</span>
            <span>5.7 GHz single core</span>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="font-bold text-slate-400 block">DDoS Shield</span>
            <span>12Tbps Cosmic Guard</span>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="font-bold text-slate-400 block">24/7 Support</span>
            <span>discord.gg/victuscloud</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 px-6 text-center text-xs text-slate-500 border-t border-white/[0.04]">
        <span>© 2026 Victus Cloud Inc. All rights reserved. • </span>
        <a
          href="https://victuscloud.com"
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 hover:text-white transition-colors"
        >
          victuscloud.com
        </a>
      </footer>
    </div>
  );
};

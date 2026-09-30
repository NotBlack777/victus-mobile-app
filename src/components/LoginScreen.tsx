import React, { useEffect, useRef, useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Shield,
  Zap,
  KeyRound,
  ArrowLeft,
  Info,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from './Toast.tsx';
import { BackgroundFX } from './BackgroundFX.tsx';
import { ACCOUNT_SIGNUP_URL, API_CREDENTIALS_URL } from '../services/authService.ts';
import { totpWindowState } from '../services/victusBridge.ts';
import { useTheme } from '../context/ThemeContext.tsx';

type Mode = 'signin' | 'twofactor' | 'apikey';

/** Opens a Victus Cloud page: device browser via the bridge, window.open in a browser. */
function openExternal(url: string) {
  const bridge = typeof window !== 'undefined' ? window.VictusNative : undefined;
  if (bridge?.openBrowser) {
    bridge.openBrowser(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const LoginScreen: React.FC = () => {
  const { signIn, verifyTwoFactor, signInWithApiKey, requestPasswordReset, realAuthAvailable } =
    useAuth();
  const { showToast } = useToast();
  const { config } = useTheme();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [code, setCode] = useState('');
  const [confirmationToken, setConfirmationToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const resetMessages = () => {
    setErrorMessage(null);
    setInfoMessage(null);
  };

  /**
   * The authenticator's 30-second window, on the PANEL's clock.
   *
   * <p>An authenticator code is derived from a 30-second step of the server's
   * clock, so a code read off the screen in the last seconds of its window is
   * already stale by the time it is typed — and a phone whose clock has drifted
   * produces codes the panel rejects outright. The shell reports the real
   * remaining seconds (measured from the panel's own {@code Date} header), and
   * this ring simply counts them down and re-reads at each boundary. No spinner,
   * no message, no flicker: when the ring refills, the next code is already valid
   * and nothing needs to be re-submitted.</p>
   */
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [windowSynced, setWindowSynced] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== 'twofactor') return;
    let cancelled = false;

    const read = () => {
      if (cancelled) return;
      const state = totpWindowState();
      setSecondsLeft(state.secondsRemaining);
      setWindowSynced(state.synced);
      // Re-read just after the boundary so the displayed value is the server's,
      // never a locally extrapolated guess that could drift across a step.
      const delay = Math.max(250, state.millisUntilNext || 1000);
      timerRef.current = window.setTimeout(read, delay);
    };
    read();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      if (mode === 'signin') {
        const { error, twoFactor } = await signIn(email, password);
        if (twoFactor) {
          setConfirmationToken(twoFactor.confirmationToken);
          setCode('');
          setMode('twofactor');
          setInfoMessage('Enter the 6-digit code from your authenticator app.');
        } else if (error) {
          setErrorMessage(error.message);
        } else {
          showToast('Signed in to Victus Cloud');
        }
      } else if (mode === 'twofactor') {
        const { error } = await verifyTwoFactor(confirmationToken, code);
        if (error) {
          setErrorMessage(error.message);
        } else {
          showToast('Signed in to Victus Cloud');
        }
        setCode('');
      } else {
        const { error } = await signInWithApiKey(apiKey);
        if (error) {
          setErrorMessage(error.message);
        } else {
          showToast('Signed in with your Victus Cloud API key');
        }
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!email.trim()) {
      setErrorMessage('Enter your email address first, then tap "Forgot password?".');
      return;
    }
    setIsLoading(true);
    try {
      const { message, error } = await requestPasswordReset(email);
      if (error) setErrorMessage(error.message);
      else setInfoMessage(message ?? 'Check your inbox for the reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    resetMessages();
    setMode(next);
  };

  const heading =
    mode === 'signin'
      ? 'Sign in to Victus Cloud'
      : mode === 'twofactor'
        ? 'Two-factor verification'
        : 'Sign in with an API key';

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#0a0a0f] text-white relative overflow-hidden select-none">
      <BackgroundFX />

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
          <span>control.victuscloud.com</span>
        </div>
      </header>

      {/* Main Form Center Card */}
      <main className="relative z-10 w-full max-w-md mx-auto px-4 py-8 sm:py-12 my-auto">
        <div className="rounded-2xl p-6 sm:p-8 border border-white/[0.08] bg-[#121219] shadow-2xl backdrop-blur-xl">
          {/* Tag & Headline */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30 mb-2.5">
              <Zap className="w-3 h-3 text-violet-400" />
              <span>{mode === 'apikey' ? 'API access' : 'Panel sign-in'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {heading}
            </h1>
            <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
              {mode === 'signin'
                ? 'Your Victus Cloud account signs you in to servers, virtual machines, billing and drive.'
                : mode === 'twofactor'
                  ? 'Your account is protected by two-factor authentication. One more step.'
                  : 'Paste a key from Account → API Credentials. Handy for automation or if two-factor is on.'}
            </p>
          </div>

          {/* The demo entry was removed in 4.6.3: a real user must never be
              shown fabricated servers. The app only ever renders a signed-in
              account's own panel data, and the login screen when nobody is
              signed in. */}

          {/* Panel-reachability notice: a browser preview has no native panel session */}
          {!realAuthAvailable && mode !== 'twofactor' && (
            <div className="mb-4 p-3 rounded-xl bg-slate-500/10 border border-slate-500/25 text-slate-300 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Real sign-in needs the Victus Cloud Android app, which talks to the
                panel natively. There is no sample or demo account.
              </span>
            </div>
          )}

          {/* Error / info */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}
          {infoMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signin' && (
              <>
                <div>
                  <label htmlFor="victus-signin-identifier"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Email or Username
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      id="victus-signin-identifier"
                      spellCheck={false}
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@victuscloud.com"
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
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isLoading}
                      className="text-[10px] text-violet-400 hover:text-violet-300 font-medium cursor-pointer disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                    <input
                      id="victus-signin-password"
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
              </>
            )}

            {mode === 'twofactor' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Authenticator code
                </label>
                <div className="relative flex items-center">
                  <Shield className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    disabled={isLoading}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#161622] border border-white/[0.08] text-white text-xs tracking-[0.3em] placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  {/* Silent 30-second ring, aligned to the panel's clock. */}
                  <span
                    className="absolute right-3 w-5 h-5 flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 36 36" className="w-5 h-5 -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="15.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-white/10"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${(secondsLeft ?? 30) * (2 * Math.PI * 15.5) / 30} ${
                          2 * Math.PI * 15.5
                        }`}
                        className={`text-violet-400 ${
                          config.reduceMotion ? '' : 'transition-[stroke-dasharray] duration-1000 ease-linear'
                        }`}
                      />
                    </svg>
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Six digits from your authenticator app, or one of your recovery codes.
                  {secondsLeft !== null && (
                    <span className="text-violet-400/90">
                      {' '}New code in {secondsLeft}s
                      {!windowSynced ? ' (device clock)' : ''}.
                    </span>
                  )}
                </p>
              </div>
            )}

            {mode === 'apikey' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  API key
                </label>
                <div className="relative flex items-center">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="abc12345ptlc_…"
                    disabled={isLoading}
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#161622] border border-white/[0.08] text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  Copy the whole key from{' '}
                  <button
                    type="button"
                    onClick={() => openExternal(API_CREDENTIALS_URL)}
                    className="text-violet-400 hover:text-violet-300 font-medium cursor-pointer"
                  >
                    Account → API Credentials
                  </button>
                  . The app only ever stores it on this device, encrypted.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.99] text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Contacting the panel…</span>
                </>
              ) : (
                <span>
                  {mode === 'signin'
                    ? 'Sign in'
                    : mode === 'twofactor'
                      ? 'Verify and sign in'
                      : 'Sign in with API key'}
                </span>
              )}
            </button>
          </form>

          {/* Mode switches */}
          <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-2.5">
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => switchMode('apikey')}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Use an API key instead</span>
              </button>
            )}

            {mode !== 'signin' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to password sign-in</span>
              </button>
            )}

            <p className="text-center text-xs text-slate-400">
              No Victus Cloud account yet?
              <button
                type="button"
                onClick={() => openExternal(ACCOUNT_SIGNUP_URL)}
                className="ml-1.5 text-violet-400 font-bold hover:underline cursor-pointer"
              >
                Create one
              </button>
            </p>
          </div>
        </div>

        {/* Feature Highlights beneath */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="font-bold text-slate-400 block">Cloud Fleet</span>
            <span>Game &amp; VPS Nodes</span>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="font-bold text-slate-400 block">DDoS Shield</span>
            <span>Protected Network</span>
          </div>
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
            <span className="font-bold text-slate-400 block">24/7 Support</span>
            <span>discord.gg/victuscloud</span>
          </div>
        </div>

        {/* Security note: where the credential actually lives */}
        <div className="mt-4 flex items-start gap-2 text-[10px] text-slate-500 px-1">
          <UserRound className="w-3.5 h-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            Sign-in happens directly with control.victuscloud.com over HTTPS. Your password is never
            stored — the app keeps a revocable API key it created for itself, encrypted on this
            device, and revokes it when you sign out.
          </span>
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

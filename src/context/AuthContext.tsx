import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, User, Session, AuthError } from '../services/authService.ts';

interface SignInOutcome {
  error: AuthError | null;
  /** Present when the panel wants a second factor before the session exists. */
  twoFactor?: { confirmationToken: string };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /** True inside the Android app, where real panel sign-in is possible. */
  realAuthAvailable: boolean;
  signIn: (email: string, pass: string) => Promise<SignInOutcome>;
  verifyTwoFactor: (confirmationToken: string, code: string) => Promise<SignInOutcome>;
  signInWithApiKey: (apiKey: string) => Promise<SignInOutcome>;
  requestPasswordReset: (email: string) => Promise<{ message?: string; error: AuthError | null }>;
  signOut: (options?: { revokeKey?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Synchronous initialization: reads the cached session on immediate mount (no timing gap)
  const [session, setSession] = useState<Session | null>(() => authService.getStoredSession());

  // Single source of truth: user is strictly derived from session so they are NEVER desynced
  const user: User | null = session?.user ?? null;

  useEffect(() => {
    // Subscribe to auth state transitions (includes cross-tab storage sync)
    const { unsubscribe } = authService.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Re-validate the cached session against the panel once on start-up. Real
    // sessions only survive if the panel still accepts their credential, so a key
    // revoked in the panel signs the app out here rather than failing later.
    let cancelled = false;
    authService
      .restore()
      .then(({ session: restored }) => {
        if (!cancelled) setSession(restored);
      })
      .catch(() => {
        // restore() already resolves failures as "no session"; this is belt and braces.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, pass: string): Promise<SignInOutcome> => {
    const res = await authService.signIn(email, pass);
    if (!res.error && res.session) setSession(res.session);
    return { error: res.error, twoFactor: res.twoFactor };
  };

  const verifyTwoFactor = async (
    confirmationToken: string,
    code: string
  ): Promise<SignInOutcome> => {
    const res = await authService.verifyTwoFactor(confirmationToken, code);
    if (!res.error && res.session) setSession(res.session);
    return { error: res.error };
  };

  const signInWithApiKey = async (apiKey: string): Promise<SignInOutcome> => {
    const res = await authService.signInWithApiKey(apiKey);
    if (!res.error && res.session) setSession(res.session);
    return { error: res.error };
  };

  const signOut = async (options?: { revokeKey?: boolean }) => {
    await authService.signOut(options);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading: false,
        realAuthAvailable: authService.isRealAuthAvailable(),
        signIn,
        verifyTwoFactor,
        signInWithApiKey,
        requestPasswordReset: authService.requestPasswordReset,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

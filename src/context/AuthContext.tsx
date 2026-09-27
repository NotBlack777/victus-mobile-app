import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, User, Session, AuthError } from '../services/authService.ts';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, pass: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, pass: string, name?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes
    const { unsubscribe } = authService.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession ? currentSession.user : null);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    const res = await authService.signIn(email, pass);
    if (!res.error && res.session) {
      setSession(res.session);
      setUser(res.user);
    }
    return { error: res.error };
  };

  const signUp = async (email: string, pass: string, name?: string) => {
    const res = await authService.signUp(email, pass, name);
    if (!res.error && res.session) {
      setSession(res.session);
      setUser(res.user);
    }
    return { error: res.error };
  };

  const signOut = async () => {
    await authService.signOut();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signIn,
        signUp,
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

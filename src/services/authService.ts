/**
 * authService.ts
 *
 * Production Supabase Authentication service for Victus Cloud.
 * Connects directly to Supabase client using environment variables.
 */

import { supabase } from './supabaseClient.ts';
import type { User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';

export interface User {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
    avatar_url?: string;
    role?: string;
  };
  created_at: string;
}

export interface Session {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: User;
}

export interface AuthError {
  message: string;
  status?: number;
}

export type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'USER_UPDATED'
  | 'INITIAL_SESSION'
  | 'TOKEN_REFRESHED'
  | 'PASSWORD_RECOVERY';

export type AuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null
) => void;

const AUTH_STORAGE_KEY = 'victus_auth_session';

function mapSupabaseUser(sbUser: SupabaseUser | null): User | null {
  if (!sbUser) return null;
  const email = sbUser.email || '';
  const meta = sbUser.user_metadata || {};
  return {
    id: sbUser.id,
    email,
    user_metadata: {
      name: meta.name || meta.full_name || (email ? email.split('@')[0] : 'User'),
      avatar_url:
        meta.avatar_url ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email || sbUser.id)}`,
      role: meta.role || 'Member',
    },
    created_at: sbUser.created_at || new Date().toISOString(),
  };
}

function mapSupabaseSession(sbSession: SupabaseSession | null): Session | null {
  if (!sbSession || !sbSession.user) return null;
  const user = mapSupabaseUser(sbSession.user);
  if (!user) return null;

  const expiresAtMs = sbSession.expires_at
    ? sbSession.expires_at < 1e11
      ? sbSession.expires_at * 1000
      : sbSession.expires_at
    : Date.now() + 3600 * 1000;

  return {
    access_token: sbSession.access_token,
    token_type: sbSession.token_type || 'bearer',
    expires_in: sbSession.expires_in || 3600,
    expires_at: expiresAtMs,
    user,
  };
}

function persistSession(session: Session | null) {
  try {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

export function getStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session || (session.expires_at && session.expires_at < Date.now())) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export const authService = {
  /**
   * Sign in with email and password via Supabase
   */
  async signIn(
    email: string,
    password: string
  ): Promise<{ user: User | null; session: Session | null; error: AuthError | null }> {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return {
        user: null,
        session: null,
        error: { message: 'Please enter a valid email address.', status: 400 },
      };
    }

    if (!password) {
      return {
        user: null,
        session: null,
        error: { message: 'Please enter your password.', status: 400 },
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        return {
          user: null,
          session: null,
          error: { message: error.message, status: error.status },
        };
      }

      const mappedSession = mapSupabaseSession(data.session);
      const mappedUser = mapSupabaseUser(data.user);
      persistSession(mappedSession);

      return { user: mappedUser, session: mappedSession, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      return {
        user: null,
        session: null,
        error: { message, status: 500 },
      };
    }
  },

  /**
   * Sign up a new user with email, password, and optional name via Supabase
   */
  async signUp(
    email: string,
    password: string,
    name?: string
  ): Promise<{ user: User | null; session: Session | null; error: AuthError | null }> {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return {
        user: null,
        session: null,
        error: { message: 'Please enter a valid email address.', status: 400 },
      };
    }

    if (!password || password.length < 6) {
      return {
        user: null,
        session: null,
        error: { message: 'Password must be at least 6 characters.', status: 400 },
      };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            name: name?.trim() || cleanEmail.split('@')[0],
          },
        },
      });

      if (error) {
        return {
          user: null,
          session: null,
          error: { message: error.message, status: error.status },
        };
      }

      const mappedSession = mapSupabaseSession(data.session);
      const mappedUser = mapSupabaseUser(data.user);
      if (mappedSession) {
        persistSession(mappedSession);
      }

      return { user: mappedUser, session: mappedSession, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      return {
        user: null,
        session: null,
        error: { message, status: 500 },
      };
    }
  },

  /**
   * Sign out current user from Supabase
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      persistSession(null);
      if (error) {
        return { error: { message: error.message, status: error.status } };
      }
      return { error: null };
    } catch (err: unknown) {
      persistSession(null);
      const message = err instanceof Error ? err.message : 'Sign out failed';
      return { error: { message, status: 500 } };
    }
  },

  /**
   * Retrieve active session from Supabase
   */
  async getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        return { session: null, error: { message: error.message, status: error.status } };
      }
      const mapped = mapSupabaseSession(data.session);
      persistSession(mapped);
      return { session: mapped, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch session';
      return { session: null, error: { message, status: 500 } };
    }
  },

  /**
   * Retrieve current authenticated user from Supabase
   */
  async getUser(): Promise<{ user: User | null; error: AuthError | null }> {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        return { user: null, error: { message: error.message, status: error.status } };
      }
      const mapped = mapSupabaseUser(data.user);
      return { user: mapped, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch user';
      return { user: null, error: { message, status: 500 } };
    }
  },

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) {
        return { error: { message: error.message, status: error.status } };
      }
      return { error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reset password failed';
      return { error: { message, status: 500 } };
    }
  },

  /**
   * Synchronously retrieve stored session from localStorage
   */
  getStoredSession(): Session | null {
    return getStoredSession();
  },

  /**
   * Listen to Supabase auth state transitions
   */
  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void } {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sbSession) => {
      const mapped = mapSupabaseSession(sbSession);
      persistSession(mapped);
      callback(event as AuthChangeEvent, mapped);
    });

    return {
      unsubscribe: () => {
        subscription.unsubscribe();
      },
    };
  },
};

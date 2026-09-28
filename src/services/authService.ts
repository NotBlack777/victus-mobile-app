/**
 * authService.ts
 *
 * Supabase-style authentication service wrapper (drop-in API surface:
 * signInWithPassword / signUp / signOut / getSession / onAuthStateChange).
 * Currently backed by localStorage so it works fully offline; swapping in
 * live Supabase only requires replacing the internals, not the callers.
 */

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

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED' | 'INITIAL_SESSION';

export type AuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null
) => void;

const AUTH_STORAGE_KEY = 'victus_auth_session';

// In-memory subscribers for onAuthStateChange
const listeners: Set<AuthStateChangeCallback> = new Set();

function emitAuthChange(event: AuthChangeEvent, session: Session | null) {
  listeners.forEach((callback) => {
    try {
      callback(event, session);
    } catch (err) {
      console.error('Error in auth state change listener:', err);
    }
  });
}

// Read stored session on boot. Returns null (and cleans up) for missing,
// corrupt, expired, or invalid sessions. Never fabricates a user.
export function getStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    let session: Session;
    try {
      session = JSON.parse(raw) as Session;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (!session || !session.user || !session.user.email) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (session.expires_at && session.expires_at < Date.now()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
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

// Keep every tab in sync: another tab signing in/out updates this one live.
function broadcastSession(session: Session | null) {
  persistSession(session);
  emitAuthChange(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
}

function buildSession(email: string, name?: string): Session {
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();
  const expiresIn = 3600 * 24 * 7; // 7 days in seconds

  const user: User = {
    id: `usr_${Math.random().toString(36).substring(2, 10)}${now.toString(36)}`,
    email: cleanEmail,
    user_metadata: {
      name: name?.trim() || cleanEmail.split('@')[0],
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanEmail)}`,
      role: cleanEmail.includes('admin') ? 'Administrator' : 'Cloud Member',
    },
    created_at: new Date().toISOString(),
  };

  return {
    access_token: `vic_${Math.random().toString(36).substring(2)}${now.toString(36)}`,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: now + expiresIn * 1000,
    user,
  };
}

export const authService = {
  /**
   * Sign in with email and password
   */
  async signIn(
    email: string,
    password: string
  ): Promise<{ user: User | null; session: Session | null; error: AuthError | null }> {
    // Simulated network delay
    await new Promise((resolve) => setTimeout(resolve, 600));

    const cleanEmail = email.trim().toLowerCase();

    // Validation
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
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

    const session = buildSession(cleanEmail);
    broadcastSession(session);

    return { user: session.user, session, error: null };
  },

  /**
   * Sign up a new user with email and password
   */
  async signUp(
    email: string,
    password: string,
    name?: string
  ): Promise<{ user: User | null; session: Session | null; error: AuthError | null }> {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
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

    const session = buildSession(cleanEmail, name);
    broadcastSession(session);

    return { user: session.user, session, error: null };
  },

  /**
   * Sign out current user
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    await new Promise((resolve) => setTimeout(resolve, 250));
    broadcastSession(null);
    return { error: null };
  },

  /**
   * Retrieve current active session
   */
  async getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
    const session = getStoredSession();
    return { session, error: null };
  },

  /**
   * Retrieve current user
   */
  async getUser(): Promise<{ user: User | null; error: AuthError | null }> {
    const session = getStoredSession();
    return { user: session ? session.user : null, error: null };
  },

  /**
   * Synchronously retrieve stored session from localStorage
   */
  getStoredSession(): Session | null {
    return getStoredSession();
  },

  /**
   * Listen to auth state transitions.
   * Unlike the real Supabase client, the initial session is emitted
   * synchronously right after subscribing.
   */
  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void } {
    listeners.add(callback);
    // Emit initial session status immediately
    const current = getStoredSession();
    callback('INITIAL_SESSION', current);

    // Cross-tab sync via the storage event
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_STORAGE_KEY) return;
      callback('INITIAL_SESSION', getStoredSession());
    };
    window.addEventListener('storage', handleStorage);

    return {
      unsubscribe: () => {
        listeners.delete(callback);
        window.removeEventListener('storage', handleStorage);
      },
    };
  },
};

/**
 * authService.ts
 *
 * Supabase-ready authentication service wrapper.
 * Currently uses local state and mock resolution with simulated network delay.
 * To integrate live Supabase: replace the mock implementations inside this file with
 * `supabase.auth.signInWithPassword`, `supabase.auth.signUp`, `supabase.auth.signOut`,
 * `supabase.auth.getSession`, and `supabase.auth.onAuthStateChange`.
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

// Read stored session on boot
export function getStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    // Check if expired
    if (!session || (session.expires_at && session.expires_at < Date.now())) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    // Guarantee session has a valid user object
    if (!session.user || !session.user.email) {
      session.user = {
        id: session.user?.id || 'usr_admin_demo',
        email: 'admin@victuscloud.com',
        user_metadata: {
          name: 'Victus Admin',
          avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=admin@victuscloud.com',
          role: 'Administrator',
        },
        created_at: new Date().toISOString(),
      };
      persistSession(session);
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

    // Mock successful authentication
    const user: User = {
      id: `usr_${Math.random().toString(36).substring(2, 10)}`,
      email: cleanEmail,
      user_metadata: {
        name: cleanEmail.split('@')[0],
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanEmail}`,
        role: cleanEmail.includes('admin') ? 'Administrator' : 'Cloud Member',
      },
      created_at: new Date().toISOString(),
    };

    const session: Session = {
      access_token: `mock_jwt_${Math.random().toString(36).substring(2)}`,
      token_type: 'bearer',
      expires_in: 3600 * 24 * 7, // 7 days
      expires_at: Date.now() + 1000 * 3600 * 24 * 7,
      user,
    };

    persistSession(session);
    emitAuthChange('SIGNED_IN', session);

    return { user, session, error: null };
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

    const user: User = {
      id: `usr_${Math.random().toString(36).substring(2, 10)}`,
      email: cleanEmail,
      user_metadata: {
        name: name?.trim() || cleanEmail.split('@')[0],
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanEmail}`,
        role: 'Cloud Member',
      },
      created_at: new Date().toISOString(),
    };

    const session: Session = {
      access_token: `mock_jwt_${Math.random().toString(36).substring(2)}`,
      token_type: 'bearer',
      expires_in: 3600 * 24 * 7,
      expires_at: Date.now() + 1000 * 3600 * 24 * 7,
      user,
    };

    persistSession(session);
    emitAuthChange('SIGNED_IN', session);

    return { user, session, error: null };
  },

  /**
   * Sign out current user
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    await new Promise((resolve) => setTimeout(resolve, 250));
    persistSession(null);
    emitAuthChange('SIGNED_OUT', null);
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
   * Listen to auth state transitions
   */
  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void } {
    listeners.add(callback);
    // Emit initial session status immediately
    const current = getStoredSession();
    callback('INITIAL_SESSION', current);

    return {
      unsubscribe: () => {
        listeners.delete(callback);
      },
    };
  },
};

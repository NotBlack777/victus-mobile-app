import './dom-shim.ts';
import { beforeEach, describe, expect, test } from 'bun:test';
import { resetStorage, storage } from './dom-shim.ts';
import { authService, getStoredSession } from '../src/services/authService.ts';
import { isNativeAuthAvailable } from '../src/services/victusBridge.ts';

const AUTH_KEY = 'victus_auth_session';

/** The panel account as the native layer reports it (no credential in it). */
const NATIVE_SESSION = {
  kind: 'api_key',
  userId: '1',
  username: 'ada',
  email: 'ada@victuscloud.com',
  name: 'Ada Lovelace',
  rootAdmin: true,
  twoFactorEnabled: true,
  createdAt: 1767225600000,
  expiresAt: 0,
  keyMasked: '…alue',
};

type Handler = (...args: unknown[]) => string;

let bridgeCalls: Array<{ method: string; args: unknown[] }> = [];

/**
 * Installs a fake `window.VictusNative`, mirroring how the Java bridge answers: the
 * handler returns a JSON payload, and the callback id (always the last argument) is
 * resolved through `window.__victusBridge`.
 *
 * `apiGet` defaults to a two-server fleet because a successful sign-in also reads
 * `GET /api/client`, so tests that do not care about it stay short.
 */
function stubBridge(handlers: Record<string, Handler>): void {
  const native: Record<string, unknown> = {};
  const all: Record<string, Handler> = {
    apiGet: () => apiOk({ object: 'list', data: [{}, {}] }),
    ...handlers,
  };

  for (const [method, handler] of Object.entries(all)) {
    native[method] = (...args: unknown[]) => {
      const callbackId = args[args.length - 1];
      bridgeCalls.push({ method, args: args.slice(0, -1) });
      const payload = handler(...args.slice(0, -1));
      const resolver = (window as unknown as {
        __victusBridge: { resolve: (id: number, payload: string) => void };
      }).__victusBridge;
      resolver.resolve(Number(callbackId), payload);
    };
  }

  (window as unknown as { VictusNative?: unknown }).VictusNative = native;
}

function clearBridge(): void {
  delete (window as unknown as { VictusNative?: unknown }).VictusNative;
}

const json = (value: unknown) => JSON.stringify(value);

const signedIn = (session: Record<string, unknown> = NATIVE_SESSION) =>
  json({ ok: true, state: 'signed_in', session });

const failed = (message: string, status = 400) =>
  json({ ok: false, state: 'error', message, status });

const twoFactorRequired = (confirmationToken: string) =>
  json({ ok: false, state: 'two_factor_required', confirmationToken });

const apiOk = (body: unknown) =>
  json({ ok: true, state: 'ok', status: 200, body: JSON.stringify(body) });

const apiUnauthorized = () =>
  json({
    ok: false,
    state: 'error',
    status: 401,
    body: JSON.stringify({
      errors: [{ code: 'AuthenticationException', status: '401', detail: 'Unauthenticated.' }],
    }),
  });

beforeEach(() => {
  resetStorage();
  clearBridge();
  bridgeCalls = [];
});

describe('authService in a browser (no native bridge)', () => {
  test('refuses to sign in instead of fabricating a session', async () => {
    const res = await authService.signIn('admin@victuscloud.com', 'victus2026');

    expect(res.session).toBeNull();
    expect(res.user).toBeNull();
    expect(res.error?.message).toContain('Android app');
    expect(storage.getItem(AUTH_KEY)).toBeNull();
  });

  test('reports that real sign-in is unavailable', () => {
    expect(isNativeAuthAvailable()).toBe(false);
    expect(authService.isRealAuthAvailable()).toBe(false);
  });

  test('asks for a password before reaching the panel', async () => {
    const res = await authService.signIn('admin@victuscloud.com', '');
    expect(res.error?.message).toContain('Enter your password');
  });

  test('validates a reset email locally rather than calling the bridge', async () => {
    const res = await authService.requestPasswordReset('nope');
    expect(res.message).toBeUndefined();
    expect(res.error?.message).toContain('email address');
    expect(bridgeCalls).toHaveLength(0);
  });

  // Demo mode was removed in 4.6.3. These tests exist so it cannot come back by
  // accident: a real user must never be shown fabricated servers, and the only
  // session the app can hold is a real panel session.
  test('there is no way to sign in without the panel', async () => {
    const authServiceAny = authService as unknown as Record<string, unknown>;
    expect(authServiceAny.signInDemo).toBeUndefined();
  });

  test('restore never invents a session when the panel is unreachable', async () => {
    // No native bridge, and a stale demo-shaped session left in storage by an
    // older build. It must be refused, not adopted.
    storage.setItem(
      AUTH_KEY,
      JSON.stringify({
        provider: 'demo',
        access_token: '',
        expires_at: 0,
        user: { id: 'demo', email: 'demo@victuscloud.com' },
      })
    );

    const restored = await authService.restore();
    expect(restored.session).toBeNull();
  });

  test('restore drops a cached panel session it cannot re-validate', async () => {
    storage.setItem(
      AUTH_KEY,
      JSON.stringify({
        provider: 'victus',
        access_token: '',
        expires_at: 0,
        user: { id: '1', email: 'ada@victuscloud.com' },
      })
    );
    const restored = await authService.restore();
    expect(restored.session).toBeNull();
  });
});

describe('authService against the panel', () => {
  test('builds the session from the panel account, with no credential in the web app', async () => {
    stubBridge({ authSignIn: () => signedIn() });

    const events: string[] = [];
    const { unsubscribe } = authService.onAuthStateChange((event) => events.push(event));

    const res = await authService.signIn('ada@victuscloud.com', 'hunter2');

    expect(res.error).toBeNull();
    expect(res.session?.provider).toBe('victus');
    expect(res.session?.credentialKind).toBe('api_key');
    expect(res.session?.keyMasked).toBe('…alue');
    expect(res.session?.user.email).toBe('ada@victuscloud.com');
    expect(res.session?.user.user_metadata.name).toBe('Ada Lovelace');
    // The role comes from the panel's root_admin flag, not from the email string.
    expect(res.session?.user.user_metadata.role).toBe('Administrator');
    // The credential never enters the web app.
    expect(res.session?.access_token).toBe('');
    expect(storage.getItem(AUTH_KEY) ?? '').not.toContain('ptlc_');
    expect(events).toEqual(['INITIAL_SESSION', 'SIGNED_IN']);

    unsubscribe();
  });

  test('records the live server count from GET /api/client', async () => {
    stubBridge({
      authSignIn: () => signedIn(),
      apiGet: () => apiOk({ object: 'list', data: [{}, {}, {}] }),
    });

    const res = await authService.signIn('ada@victuscloud.com', 'hunter2');

    expect(res.session?.serverCount).toBe(3);
    expect(bridgeCalls.some((call) => call.method === 'apiGet' && call.args[0] === '/api/client'))
      .toBe(true);
  });

  test('normalises the address before it reaches the panel', async () => {
    stubBridge({ authSignIn: () => signedIn() });

    await authService.signIn('  Ada@VictusCloud.com  ', 'hunter2');

    const call = bridgeCalls.find((entry) => entry.method === 'authSignIn');
    expect(call?.args[0]).toBe('ada@victuscloud.com');
    expect(call?.args[1]).toBe('hunter2');
  });

  test("surfaces the panel's own rejection message", async () => {
    stubBridge({
      authSignIn: () =>
        failed('No account matching those credentials could be found.', 400),
    });

    const res = await authService.signIn('ada@victuscloud.com', 'wrong');

    expect(res.session).toBeNull();
    expect(res.error?.message).toBe('No account matching those credentials could be found.');
    expect(res.error?.status).toBe(400);
    expect(storage.getItem(AUTH_KEY)).toBeNull();
  });

  test('asks for the second factor, then completes the session', async () => {
    stubBridge({
      authSignIn: () => twoFactorRequired('confirm-token'),
      authSubmitTwoFactor: () => signedIn(),
    });

    const first = await authService.signIn('ada@victuscloud.com', 'hunter2');
    expect(first.session).toBeNull();
    expect(first.error).toBeNull();
    expect(first.twoFactor?.confirmationToken).toBe('confirm-token');
    expect(storage.getItem(AUTH_KEY)).toBeNull();

    const second = await authService.verifyTwoFactor('confirm-token', '123456');
    expect(second.error).toBeNull();
    expect(second.session?.user.email).toBe('ada@victuscloud.com');

    const call = bridgeCalls.find((entry) => entry.method === 'authSubmitTwoFactor');
    expect(call?.args).toEqual(['confirm-token', '123456']);
  });

  test('reports a rejected two-factor code', async () => {
    stubBridge({
      authSubmitTwoFactor: () => failed("That code wasn't accepted.", 401),
    });

    const res = await authService.verifyTwoFactor('confirm-token', '000000');
    expect(res.session).toBeNull();
    expect(res.error?.message).toBe("That code wasn't accepted.");
  });

  test('signs in with a pasted API key', async () => {
    stubBridge({ authSignInWithApiKey: () => signedIn() });

    const res = await authService.signInWithApiKey('  abc12345ptlc_secret  ');

    expect(res.error).toBeNull();
    expect(bridgeCalls[0]?.args[0]).toBe('abc12345ptlc_secret');
    expect(res.session?.user.user_metadata.role).toBe('Administrator');
  });

  test('reports a rejected API key without caching anything', async () => {
    stubBridge({ authSignInWithApiKey: () => failed('Paste the whole key from Account → API Credentials (it ends in a long ptlc_… value).', 400) });

    const res = await authService.signInWithApiKey('wrong');

    expect(res.session).toBeNull();
    expect(res.error?.message).toContain('Paste the whole key');
    expect(storage.getItem(AUTH_KEY)).toBeNull();
  });

  test('restore re-validates against the panel and keeps a good session', async () => {
    stubBridge({ authRestore: () => signedIn() });

    const res = await authService.restore();

    expect(res.error).toBeNull();
    expect(res.session?.provider).toBe('victus');
    expect(res.session?.user.email).toBe('ada@victuscloud.com');
    expect(getStoredSession()?.user.email).toBe('ada@victuscloud.com');
  });

  test('restore signs out when the panel no longer accepts the stored key', async () => {
    stubBridge({ authRestore: () => json({ ok: false, state: 'signed_out' }) });
    storage.setItem(
      AUTH_KEY,
      JSON.stringify({
        provider: 'victus',
        access_token: '',
        expires_at: 0,
        user: { id: '1', email: 'ada@victuscloud.com' },
      })
    );

    const events: string[] = [];
    const { unsubscribe } = authService.onAuthStateChange((event) => events.push(event));

    const res = await authService.restore();

    expect(res.session).toBeNull();
    expect(getStoredSession()).toBeNull();
    expect(events).toContain('SIGNED_OUT');
    unsubscribe();
  });

  test('treats a session the panel immediately rejects as a failed sign-in', async () => {
    stubBridge({
      authSignIn: () => signedIn(),
      apiGet: () => apiUnauthorized(),
    });

    const res = await authService.signIn('ada@victuscloud.com', 'hunter2');

    expect(res.session).toBeNull();
    expect(res.error?.status).toBe(401);
    expect(res.error?.message).toContain('rejected the session');
    expect(storage.getItem(AUTH_KEY)).toBeNull();
  });

  test('sign-out revokes the API key the app created, then clears everything', async () => {
    stubBridge({ authSignOut: () => json({ ok: false, state: 'signed_out' }) });
    storage.setItem(
      AUTH_KEY,
      JSON.stringify({
        provider: 'victus',
        access_token: '',
        expires_at: 0,
        user: { id: '1', email: 'ada@victuscloud.com' },
      })
    );

    const res = await authService.signOut();

    expect(res.error).toBeNull();
    expect(bridgeCalls.find((call) => call.method === 'authSignOut')?.args[0]).toBe(true);
    expect(getStoredSession()).toBeNull();
    expect(storage.getItem(AUTH_KEY)).toBeNull();
  });

  test('sign-out can keep the key when the caller asks it to', async () => {
    stubBridge({ authSignOut: () => json({ ok: false, state: 'signed_out' }) });

    await authService.signOut({ revokeKey: false });

    expect(bridgeCalls.find((call) => call.method === 'authSignOut')?.args[0]).toBe(false);
  });

  test('surfaces a native call that throws rather than hanging the button', async () => {
    stubBridge({
      authSignIn: () => {
        throw new Error('Sign-in is only available in the Victus Cloud app.');
      },
    });

    const res = await authService.signIn('ada@victuscloud.com', 'hunter2');

    expect(res.session).toBeNull();
    expect(res.error?.message).toContain('Victus Cloud app');
  });

  test('a malformed native payload is an error, never a session', async () => {
    stubBridge({ authSignIn: () => 'not json at all' });

    const res = await authService.signIn('ada@victuscloud.com', 'hunter2');

    expect(res.session).toBeNull();
    expect(res.error?.message).toContain('could not read');
    expect(storage.getItem(AUTH_KEY)).toBeNull();
  });

  test('a password reset that the panel accepts returns its own confirmation text', async () => {
    stubBridge({
      authPasswordReset: () =>
        json({ ok: false, state: 'info', message: 'We have emailed your password reset link!' }),
    });

    const res = await authService.requestPasswordReset('ada@victuscloud.com');

    expect(res.error).toBeNull();
    expect(res.message).toBe('We have emailed your password reset link!');
  });

  test('a password reset that the panel rejects returns its message', async () => {
    stubBridge({
      authPasswordReset: () => failed('The email must be a valid email address.', 422),
    });

    const res = await authService.requestPasswordReset('ada@victuscloud.com');

    expect(res.message).toBeUndefined();
    expect(res.error?.message).toBe('The email must be a valid email address.');
  });
});

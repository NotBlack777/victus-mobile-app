import './dom-shim.ts';
import { beforeEach, describe, expect, test } from 'bun:test';
import { resetStorage } from './dom-shim.ts';
import {
  bytesToGiB,
  fetchResources,
  fetchServers,
  formatBytes,
  formatMiB,
  formatUptime,
  mapPanelServer,
  mapStatus,
  panelError,
  sendCommand,
  sendPower,
  toVictusService,
} from '../src/services/panelApi.ts';

/**
 * A documented `GET /api/client` entry. The shapes here come from the panel's own
 * client API, which is why the mappers can be tested without a panel to talk to.
 */
const SERVER_ATTRIBUTES = {
  server_owner: true,
  identifier: '9a4b12c1',
  uuid: '9a4b12c1-3a1b-4cd3-84f9-71b8cd961001',
  name: 'Survival SMP',
  node: 'SG-1',
  description: '',
  status: 'running',
  is_suspended: false,
  is_installing: false,
  limits: { memory: 8192, swap: 0, disk: 50000, io: 500, cpu: 400 },
  relationships: {
    allocations: {
      data: [
        {
          attributes: { ip: '203.0.113.9', port: 25566, is_default: false },
        },
        {
          attributes: { ip: '203.0.113.10', port: 25565, is_default: true },
        },
      ],
    },
  },
};

let bridgeCalls: Array<{ method: string; args: unknown[] }> = [];

/** Installs a fake native bridge that answers each call with a fixed payload. */
function stubBridge(handlers: Record<string, (...args: unknown[]) => string>): void {
  const native: Record<string, unknown> = {};
  for (const [method, handler] of Object.entries(handlers)) {
    native[method] = (...args: unknown[]) => {
      const callbackId = args[args.length - 1];
      bridgeCalls.push({ method, args: args.slice(0, -1) });
      const resolver = (window as unknown as {
        __victusBridge: { resolve: (id: number, payload: string) => void };
      }).__victusBridge;
      resolver.resolve(Number(callbackId), handler(...args.slice(0, -1)));
    };
  }
  (window as unknown as { VictusNative?: unknown }).VictusNative = native;
}

const apiOk = (body: unknown) =>
  JSON.stringify({ ok: true, state: 'ok', status: 200, body: JSON.stringify(body) });

const apiError = (status: number, errors: unknown) =>
  JSON.stringify({
    ok: false,
    state: 'error',
    status,
    body: JSON.stringify({ errors }),
  });

beforeEach(() => {
  resetStorage();
  bridgeCalls = [];
  delete (window as unknown as { VictusNative?: unknown }).VictusNative;
});

describe('panel status mapping', () => {
  test('a transitioning container still counts as active', () => {
    // Showing "offline" while a server boots is what makes people press start twice.
    expect(mapStatus('running', false, false)).toBe('ACTIVE');
    expect(mapStatus('starting', false, false)).toBe('ACTIVE');
    expect(mapStatus('stopping', false, false)).toBe('ACTIVE');
  });

  test('stopped, suspended and installing states map honestly', () => {
    expect(mapStatus(null, false, false)).toBe('OFFLINE');
    expect(mapStatus('offline', false, false)).toBe('OFFLINE');
    expect(mapStatus('running', true, false)).toBe('SUSPENDED');
    // A suspended server outranks its power state: it cannot be started.
    expect(mapStatus('offline', true, false)).toBe('SUSPENDED');
    // An installing server is up as far as the panel's own UI is concerned.
    expect(mapStatus(null, false, true)).toBe('ACTIVE');
  });
});

describe('panel value formatting', () => {
  test('allocations print the way the rest of the app prints them', () => {
    expect(formatMiB(8192)).toBe('8,192 MiB');
    expect(formatMiB(50000)).toBe('50,000 MiB');
    // The panel uses 0 for "unlimited".
    expect(formatMiB(0)).toBe('Unlimited');
  });

  test('live byte counts are readable without pretending to be precise', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(512 * 1024 * 1024)).toBe('512 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
    expect(bytesToGiB(2 * 1024 * 1024 * 1024)).toBe(2);
  });

  test('uptime is shown coarsely, and not at all for a stopped server', () => {
    expect(formatUptime(0)).toBeNull();
    expect(formatUptime(-5)).toBeNull();
    expect(formatUptime(12 * 60 * 1000)).toBe('12m');
    expect(formatUptime(3 * 60 * 60 * 1000 + 12 * 60 * 1000)).toBe('3h 12m');
    expect(formatUptime(2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000)).toBe('2d 5h');
  });
});

describe('mapPanelServer', () => {
  test('reads the documented attributes and prefers the default allocation', () => {
    const server = mapPanelServer(SERVER_ATTRIBUTES);

    expect(server.uuid).toBe('9a4b12c1-3a1b-4cd3-84f9-71b8cd961001');
    expect(server.identifier).toBe('9a4b12c1');
    expect(server.name).toBe('Survival SMP');
    expect(server.node).toBe('SG-1');
    expect(server.status).toBe('ACTIVE');
    expect(server.memoryMiB).toBe(8192);
    expect(server.diskMiB).toBe(50000);
    expect(server.cpuPercent).toBe(400);
    // The default allocation wins over the first one in the list.
    expect(server.allocation).toBe('203.0.113.10:25565');
  });

  test('survives a sparse payload instead of crashing the dashboard', () => {
    const server = mapPanelServer({ uuid: 'abc' });
    expect(server.name).toBe('Unnamed server');
    expect(server.node).toBe('Victus Cloud');
    expect(server.status).toBe('OFFLINE');
    expect(server.memoryMiB).toBe(0);
    expect(server.allocation).toBe('');
  });

  test('a server with no allocations does not invent an address', () => {
    const server = mapPanelServer({ ...SERVER_ATTRIBUTES, relationships: {} });
    expect(server.allocation).toBe('');
  });
});

describe('toVictusService', () => {
  test('produces the shape every existing screen already renders', () => {
    const service = toVictusService(mapPanelServer(SERVER_ATTRIBUTES), 0);

    expect(service.index).toBe('01');
    expect(service.id).toBe('9a4b12c1-3a1b-4cd3-84f9-71b8cd961001');
    expect(service.uuid).toBe('9a4b12c1-3a1b-4cd3-84f9-71b8cd961001');
    expect(service.name).toBe('Survival SMP');
    expect(service.status).toBe('ACTIVE');
    expect(service.memory).toBe('8,192 MiB');
    expect(service.disk).toBe('50,000 MiB');
    expect(service.ip).toBe('203.0.113.10:25565');
    expect(service.port).toBe(25565);
    expect(service.shortId).toBe('9a4b12c1');
    expect(service.cpuCores).toBe('400% CPU');
  });

  test('indexes servers from 01 in the order the panel returned them', () => {
    const server = mapPanelServer(SERVER_ATTRIBUTES);
    expect(toVictusService(server, 0).index).toBe('01');
    expect(toVictusService(server, 11).index).toBe('12');
  });

  test('a server with no port falls back to a dash rather than NaN', () => {
    const service = toVictusService(mapPanelServer({ uuid: 'abc', name: 'No port' }), 0);
    expect(service.ip).toBe('—');
    expect(service.port).toBe(0);
  });
});

describe('panelError', () => {
  test("uses the panel's own wording when it sends the error envelope", () => {
    expect(
      panelError(
        { ok: false, state: 'error', status: 403, body: '' },
        { errors: [{ code: 'DisplayException', detail: 'You do not have permission.' }] }
      )
    ).toBe('You do not have permission.');
  });

  test('falls back to an actionable sentence per status', () => {
    const response = { ok: false, state: 'error', status: 401, body: '' };
    expect(panelError(response, null)).toContain('Sign in again');
    expect(panelError({ ...response, status: 404 }, null)).toContain('could not find');
    expect(panelError({ ...response, status: 429 }, null)).toContain('Too many requests');
    expect(panelError({ ...response, status: 503 }, null)).toContain('having trouble');
  });
});

describe('fetchServers over the bridge', () => {
  test('parses the panel list into servers the app can render', async () => {
    stubBridge({
      apiGet: () =>
        apiOk({ object: 'list', data: [{ attributes: SERVER_ATTRIBUTES }] }),
    });

    const result = await fetchServers();

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].name).toBe('Survival SMP');
    expect(bridgeCalls[0].args[0]).toBe('/api/client');
  });

  test('an empty account is an empty list, not an error', async () => {
    stubBridge({ apiGet: () => apiOk({ object: 'list', data: [] }) });

    const result = await fetchServers();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  test('a rejected key surfaces the panel message', async () => {
    stubBridge({
      apiGet: () =>
        apiError(401, [
          { code: 'AuthenticationException', status: '401', detail: 'Unauthenticated.' },
        ]),
    });

    const result = await fetchServers();

    expect(result.data).toBeNull();
    expect(result.error).toBe('Unauthenticated.');
    expect(result.status).toBe(401);
  });

  test('a list the app cannot read is reported rather than silently empty', async () => {
    stubBridge({
      apiGet: () => JSON.stringify({ ok: true, state: 'ok', status: 200, body: '{"object":"list"}' }),
    });

    const result = await fetchServers();

    expect(result.data).toBeNull();
    expect(result.error).toContain('did not understand');
  });
});

describe('power and console actions over the bridge', () => {
  test('sends the signal the panel expects', async () => {
    stubBridge({
      apiPost: () => JSON.stringify({ ok: true, state: 'ok', status: 204, body: '' }),
    });

    const result = await sendPower('abc-123', 'restart');

    expect(result.error).toBeNull();
    expect(bridgeCalls[0].args[0]).toBe('/api/client/servers/abc-123/power');
    expect(JSON.parse(String(bridgeCalls[0].args[1]))).toEqual({ signal: 'restart' });
    expect(bridgeCalls[0].method).toBe('apiPost');
  });

  test('a refused power action reports why, and claims nothing', async () => {
    stubBridge({
      apiPost: () =>
        apiError(403, [
          { code: 'DisplayException', status: '403', detail: 'Server is suspended.' },
        ]),
    });

    const result = await sendPower('abc-123', 'start');

    expect(result.data).toBeNull();
    expect(result.error).toBe('Server is suspended.');
  });

  test('console commands are sent, and an empty command is not', async () => {
    stubBridge({
      apiPost: () => JSON.stringify({ ok: true, state: 'ok', status: 204, body: '' }),
    });

    const sent = await sendCommand('abc-123', '  say hello  ');
    expect(sent.error).toBeNull();
    expect(bridgeCalls[0].args[0]).toBe('/api/client/servers/abc-123/command');
    expect(JSON.parse(String(bridgeCalls[0].args[1]))).toEqual({ command: 'say hello' });

    bridgeCalls = [];
    const empty = await sendCommand('abc-123', '   ');
    expect(empty.error).toContain('Nothing to send');
    expect(bridgeCalls).toHaveLength(0);
  });

  test('an action with no server selected is refused before any request', async () => {
    stubBridge({ apiPost: () => apiOk({}) });
    const result = await sendPower('', 'start');
    expect(result.error).toContain('No server selected');
    expect(bridgeCalls).toHaveLength(0);
  });
});

describe('fetchResources', () => {
  test('reads live usage for the signed-in account', async () => {
    stubBridge({
      apiGet: () =>
        apiOk({
          object: 'stats',
          attributes: {
            current_state: 'running',
            resources: {
              cpu_absolute: 12.4,
              memory_bytes: 1_500_000_000,
              disk_bytes: 5_400_000_000,
              uptime: 11_520_000,
            },
          },
        }),
    });

    const result = await fetchResources('abc-123');

    expect(result.error).toBeNull();
    expect(result.data?.state).toBe('running');
    expect(result.data?.cpuPercent).toBeCloseTo(12.4, 1);
    expect(formatBytes(result.data?.memoryBytes ?? 0)).toBe('1.4 GB');
    expect(formatUptime(result.data?.uptimeMs ?? 0)).toBe('3h 12m');
    expect(bridgeCalls[0].args[0]).toBe('/api/client/servers/abc-123/resources');
  });

  test('a stopped server reports zeroes instead of throwing', async () => {
    stubBridge({
      apiGet: () =>
        apiOk({ object: 'stats', attributes: { current_state: 'offline', resources: {} } }),
    });

    const result = await fetchResources('abc-123');

    expect(result.error).toBeNull();
    expect(result.data?.cpuPercent).toBe(0);
    expect(formatUptime(result.data?.uptimeMs ?? 0)).toBeNull();
  });
});

/**
 * panelApi.ts
 *
 * The real control-panel API, reached through the native bridge so the API key
 * stays in the app's native layer.
 *
 * Everything here talks to `control.victuscloud.com/api/client…`. The credential
 * is attached by Java (`VictusAuth.apiGet` / `apiPost`), which is also why the
 * request paths are allowlisted there rather than here: a page cannot use this as
 * a general-purpose proxy.
 *
 * Request/response shapes follow the panel's documented client API:
 *
 *   GET  /api/client                          → { data: [{ attributes: { uuid, name, status, limits, … } }] }
 *   GET  /api/client/servers/{uuid}/resources  → { attributes: { current_state, resources: { cpu_absolute, memory_bytes, disk_bytes, uptime } } }
 *   POST /api/client/servers/{uuid}/power      ← { signal: 'start' | 'stop' | 'restart' | 'kill' }
 *   POST /api/client/servers/{uuid}/command    ← { command: '…' }
 *
 * The mappers are pure functions so the parsing is unit-tested against those
 * shapes (`tests/panelApi.test.ts`) without a panel to talk to.
 */

import { VictusService } from './controlData.ts';
import { nativeApiGet, nativeApiPost, type NativeApiResponse } from './victusBridge.ts';

export type PowerSignal = 'start' | 'stop' | 'restart' | 'kill';

/** A server as the panel reports it, reduced to what the app renders. */
export interface PanelServer {
  uuid: string;
  identifier: string;
  name: string;
  node: string;
  status: 'ACTIVE' | 'OFFLINE' | 'SUSPENDED';
  /** Raw panel state: running / starting / stopping / null. */
  rawState: string | null;
  suspended: boolean;
  installing: boolean;
  memoryMiB: number;
  diskMiB: number;
  cpuPercent: number;
  /** Primary allocation, e.g. "1.2.3.4:25565", when the panel exposes one. */
  allocation: string;
}

/** Live resource usage for one server. */
export interface PanelResources {
  state: string | null;
  cpuPercent: number;
  memoryBytes: number;
  diskBytes: number;
  uptimeMs: number;
}

export interface PanelResult<T> {
  data: T | null;
  error: string | null;
  status: number;
}

/* ------------------------------------------------------------------ parsing */

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** The panel's error envelope: `{errors:[{code,status,detail}]}`. */
export function panelError(response: NativeApiResponse, body: unknown): string {
  const envelope = body as { errors?: Array<{ detail?: string; code?: string }> } | null;
  const first = envelope?.errors?.[0];
  if (first?.detail) return first.detail;
  if (first?.code) return first.code;
  if (response.status === 401) return 'The panel rejected the app’s key. Sign in again.';
  if (response.status === 403) return 'This account is not allowed to do that.';
  if (response.status === 404) return 'The panel could not find that server.';
  if (response.status === 429) return 'Too many requests — wait a moment and try again.';
  if (response.status >= 500) return `The panel is having trouble (HTTP ${response.status}).`;
  if (response.message) return response.message;
  return `The panel returned HTTP ${response.status}.`;
}

/**
 * Maps the panel's server state onto the app's three-state model.
 *
 * `starting`/`stopping` count as ACTIVE on purpose: the container exists and is
 * transitioning, and showing "offline" mid-boot is what makes people press start
 * twice.
 */
export function mapStatus(
  rawState: string | null,
  suspended: boolean,
  installing: boolean
): 'ACTIVE' | 'OFFLINE' | 'SUSPENDED' {
  if (suspended) return 'SUSPENDED';
  if (installing) return 'ACTIVE';
  const state = (rawState ?? '').toLowerCase();
  if (state === 'running' || state === 'starting' || state === 'stopping') return 'ACTIVE';
  return 'OFFLINE';
}

/** "1,024 MiB" from 1024, matching how the rest of the app prints allocations. */
export function formatMiB(mib: number): string {
  if (!Number.isFinite(mib) || mib <= 0) return 'Unlimited';
  return `${mib.toLocaleString('en-US')} MiB`;
}

export function bytesToGiB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/** Bytes as "1.4 GB" / "512 MB" for the usage rows. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** "3d 4h 12m" from a millisecond uptime, or null when the server is stopped. */
export function formatUptime(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** The first allocation string the panel exposes, if any. */
function primaryAllocation(attributes: Record<string, unknown>): string {
  const relationships = attributes.relationships as
    | { allocations?: { data?: Array<{ attributes?: Record<string, unknown> }> } }
    | undefined;
  const allocations = relationships?.allocations?.data;
  if (!Array.isArray(allocations) || allocations.length === 0) return '';

  const preferred = allocations.find(
    (entry) => entry?.attributes?.is_default === true
  );
  const chosen = preferred ?? allocations[0];
  const ip = String(chosen?.attributes?.ip ?? '');
  const port = chosen?.attributes?.port;
  return ip && port ? `${ip}:${port}` : ip;
}

/** One panel server entry, reduced to what the app renders. */
export function mapPanelServer(attributes: Record<string, unknown>): PanelServer {
  const limits = (attributes.limits ?? {}) as Record<string, unknown>;
  const memoryMiB = Number(limits.memory ?? 0) || 0;
  const diskMiB = Number(limits.disk ?? 0) || 0;
  const cpuPercent = Number(limits.cpu ?? 0) || 0;
  const rawState = typeof attributes.status === 'string' ? attributes.status : null;

  const uuid = String(attributes.uuid ?? '');
  const identifier = String(attributes.identifier ?? '');

  return {
    uuid,
    identifier,
    name: String(attributes.name ?? 'Unnamed server'),
    node: String(attributes.node ?? 'Victus Cloud'),
    status: mapStatus(rawState, attributes.is_suspended === true, attributes.is_installing === true),
    rawState,
    suspended: attributes.is_suspended === true,
    installing: attributes.is_installing === true,
    memoryMiB,
    diskMiB,
    cpuPercent,
    allocation: primaryAllocation(attributes),
  };
}

/**
 * A panel server in the shape the rest of the app already renders, so every
 * existing screen works with real data instead of only the sample fleet.
 */
export function toVictusService(server: PanelServer, index: number): VictusService {
  const shortId = (server.identifier || server.uuid.replace(/-/g, '')).slice(0, 8);
  const port = Number(server.allocation.split(':')[1] ?? 0) || 0;
  return {
    index: String(index + 1).padStart(2, '0'),
    id: server.uuid || `panel-${index}`,
    name: server.name,
    type: 'game',
    status: server.status,
    ip: server.allocation || '—',
    shortId,
    node: server.node,
    sftpAddress: '',
    sftpUsername: '',
    uuid: server.uuid,
    memory: formatMiB(server.memoryMiB),
    disk: formatMiB(server.diskMiB),
    cpuCores: server.cpuPercent > 0 ? `${server.cpuPercent}% CPU` : 'Shared CPU',
    port,
  };
}

/* --------------------------------------------------------------- requests */

/**
 * Every entry point below resolves — it never rejects. The bridge can be absent
 * (a browser build), refuse a path, or time out, and each of those is a reported
 * error rather than an unhandled rejection that leaves a screen spinning.
 */
function bridgeFailure(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : 'The app could not reach the panel.';
}

/** The account's servers, as the panel reports them. */
export async function fetchServers(): Promise<PanelResult<PanelServer[]>> {
  let response: NativeApiResponse;
  try {
    response = await nativeApiGet('/api/client');
  } catch (err) {
    return { data: null, error: bridgeFailure(err), status: 0 };
  }
  const body = parseJson(response.body);

  if (!response.ok) {
    return { data: null, error: panelError(response, body), status: response.status };
  }

  const list = (body as { data?: Array<{ attributes?: Record<string, unknown> }> } | null)?.data;
  if (!Array.isArray(list)) {
    return { data: null, error: 'The panel sent a server list the app did not understand.', status: response.status };
  }

  const servers = list
    .map((entry) => (entry?.attributes ? mapPanelServer(entry.attributes) : null))
    .filter((server): server is PanelServer => server !== null);

  return { data: servers, error: null, status: response.status };
}

/** Live resource usage for one server. */
export async function fetchResources(uuid: string): Promise<PanelResult<PanelResources>> {
  if (!uuid) return { data: null, error: 'No server selected.', status: 0 };

  let response: NativeApiResponse;
  try {
    response = await nativeApiGet(`/api/client/servers/${uuid}/resources`);
  } catch (err) {
    return { data: null, error: bridgeFailure(err), status: 0 };
  }
  const body = parseJson(response.body);
  if (!response.ok) {
    return { data: null, error: panelError(response, body), status: response.status };
  }

  const attributes = (body as { attributes?: Record<string, unknown> } | null)?.attributes;
  const resources = (attributes?.resources ?? {}) as Record<string, unknown>;
  return {
    data: {
      state: typeof attributes?.current_state === 'string' ? attributes.current_state : null,
      cpuPercent: Number(resources.cpu_absolute ?? 0) || 0,
      memoryBytes: Number(resources.memory_bytes ?? 0) || 0,
      diskBytes: Number(resources.disk_bytes ?? 0) || 0,
      uptimeMs: Number(resources.uptime ?? 0) || 0,
    },
    error: null,
    status: response.status,
  };
}

/**
 * Sends a power signal. The panel answers 204 with an empty body, so success is
 * "any 2xx" rather than a parsed payload — which is why the callers re-read the
 * server list afterwards instead of trusting the response.
 */
export async function sendPower(
  uuid: string,
  signal: PowerSignal
): Promise<PanelResult<true>> {
  if (!uuid) return { data: null, error: 'No server selected.', status: 0 };

  let response: NativeApiResponse;
  try {
    response = await nativeApiPost(
      `/api/client/servers/${uuid}/power`,
      JSON.stringify({ signal })
    );
  } catch (err) {
    return { data: null, error: bridgeFailure(err), status: 0 };
  }
  if (response.ok) return { data: true, error: null, status: response.status };
  return { data: null, error: panelError(response, parseJson(response.body)), status: response.status };
}

/** Sends a console command. Also a 204 with no body on success. */
export async function sendCommand(
  uuid: string,
  command: string
): Promise<PanelResult<true>> {
  if (!uuid) return { data: null, error: 'No server selected.', status: 0 };
  if (!command.trim()) return { data: null, error: 'Nothing to send.', status: 0 };

  let response: NativeApiResponse;
  try {
    response = await nativeApiPost(
      `/api/client/servers/${uuid}/command`,
      JSON.stringify({ command: command.trim() })
    );
  } catch (err) {
    return { data: null, error: bridgeFailure(err), status: 0 };
  }
  if (response.ok) return { data: true, error: null, status: response.status };
  return { data: null, error: panelError(response, parseJson(response.body)), status: response.status };
}

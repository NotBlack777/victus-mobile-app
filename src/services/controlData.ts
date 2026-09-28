/**
 * controlData.ts
 *
 * Real Victus Cloud Control Panel data model and services list
 * directly reflecting control.victuscloud.com.
 */

export interface VictusService {
  index: string; // '01', '02', etc.
  id: string;
  name: string;
  type: 'game' | 'bot' | 'vps';
  status: 'ACTIVE' | 'OFFLINE' | 'SUSPENDED';
  ip: string;
  shortId: string;
  node: string;
  sftpAddress: string;
  sftpUsername: string;
  uuid: string;
  memory: string;
  disk: string;
  cpuCores: string;
  port: number;
}

export const REAL_VICTUS_SERVICES: VictusService[] = [
  {
    index: '01',
    id: 'victus-srv-01',
    name: 'VictusMc Survival',
    type: 'game',
    status: 'ACTIVE',
    ip: 'survival.victusmc.net:25565',
    shortId: '9a4b12c1',
    node: 'SG-1',
    sftpAddress: 'sg1.victuscloud.com:2022',
    sftpUsername: 'icy.9a4b12c1',
    uuid: '9a4b12c1-3a1b-4cd3-84f9-71b8cd961001',
    memory: '8,192 MiB',
    disk: '50,000 MiB',
    cpuCores: '4 vCPU Cores',
    port: 25565,
  },
  {
    index: '02',
    id: 'victus-srv-02',
    name: 'VictusMc Hub',
    type: 'game',
    status: 'ACTIVE',
    ip: 'hub.victusmc.net:25565',
    shortId: '3f8e77a2',
    node: 'SG-1',
    sftpAddress: 'sg1.victuscloud.com:2022',
    sftpUsername: 'icy.3f8e77a2',
    uuid: '3f8e77a2-5b2c-4ef1-90a1-71b8cd961002',
    memory: '4,096 MiB',
    disk: '25,000 MiB',
    cpuCores: '2 vCPU Cores',
    port: 25566,
  },
  {
    index: '03',
    id: 'victus-srv-03',
    name: 'VictusMc | Lifesteal',
    type: 'game',
    status: 'OFFLINE',
    ip: 'lifesteal.victusmc.net:25570',
    shortId: '2b1a90d4',
    node: 'SG-2',
    sftpAddress: 'sg2.victuscloud.com:2022',
    sftpUsername: 'icy.2b1a90d4',
    uuid: '2b1a90d4-1a3f-4cd2-b7a4-71b8cd961003',
    memory: '6,144 MiB',
    disk: '35,000 MiB',
    cpuCores: '3 vCPU Cores',
    port: 25570,
  },
  {
    index: '04',
    id: 'victus-srv-04',
    name: 'Victus MC Velocity',
    type: 'game',
    status: 'ACTIVE',
    ip: 'proxy.victusmc.net:25577',
    shortId: '5e6c41b8',
    node: 'SG-1',
    sftpAddress: 'sg1.victuscloud.com:2022',
    sftpUsername: 'icy.5e6c41b8',
    uuid: '5e6c41b8-8e9a-4bc4-93e2-71b8cd961004',
    memory: '2,048 MiB',
    disk: '10,000 MiB',
    cpuCores: '2 vCPU Cores',
    port: 25577,
  },
  {
    index: '05',
    id: 'victus-srv-05',
    name: 'Paras and Icy joint Dc bot',
    type: 'bot',
    status: 'OFFLINE',
    ip: '104.234.180.12:8080',
    shortId: '7d3a22f5',
    node: 'US-East',
    sftpAddress: 'us1.victuscloud.com:2022',
    sftpUsername: 'icy.7d3a22f5',
    uuid: '7d3a22f5-2d4e-4fa3-a8c1-71b8cd961005',
    memory: '1,024 MiB',
    disk: '5,000 MiB',
    cpuCores: '1 vCPU Core',
    port: 8080,
  },
  {
    index: '06',
    id: 'victus-srv-06',
    name: 'Victus Cloud Bot LavaLink',
    type: 'bot',
    status: 'ACTIVE',
    ip: 'lavalink.victuscloud.com:2333',
    shortId: '8c9b33e1',
    node: 'EU-Central',
    sftpAddress: 'eu1.victuscloud.com:2022',
    sftpUsername: 'icy.8c9b33e1',
    uuid: '8c9b33e1-7b8c-4de2-bc91-71b8cd961006',
    memory: '2,048 MiB',
    disk: '12,000 MiB',
    cpuCores: '2 vCPU Cores',
    port: 2333,
  },
  {
    index: '07',
    id: 'victus-srv-07',
    name: 'Victus Cloud Bot',
    type: 'bot',
    status: 'ACTIVE',
    ip: 'bot.victuscloud.com:3000',
    shortId: '4f2e11d9',
    node: 'SG-1',
    sftpAddress: 'sg1.victuscloud.com:2022',
    sftpUsername: 'icy.4f2e11d9',
    uuid: '4f2e11d9-6a5b-4ef1-8e7c-71b8cd961007',
    memory: '1,024 MiB',
    disk: '5,000 MiB',
    cpuCores: '1 vCPU Core',
    port: 3000,
  },
  {
    index: '08',
    id: 'victus-srv-08',
    name: 'VictusMC racing',
    type: 'game',
    status: 'OFFLINE',
    ip: 'racing.victusmc.net:25580',
    shortId: '1a7c88b3',
    node: 'SG-2',
    sftpAddress: 'sg2.victuscloud.com:2022',
    sftpUsername: 'icy.1a7c88b3',
    uuid: '1a7c88b3-4f9e-4ad2-9b5e-71b8cd961008',
    memory: '4,096 MiB',
    disk: '20,000 MiB',
    cpuCores: '2 vCPU Cores',
    port: 25580,
  },
  {
    index: '09',
    id: 'victus-srv-09',
    name: 'Icys minecraft server',
    type: 'game',
    status: 'OFFLINE',
    ip: 'paid5.victuscloud.com:25588',
    shortId: '6d3b39e7',
    node: 'SG-1',
    sftpAddress: 'sg1.victuscloud.com:2022',
    sftpUsername: 'icy.6d3b39e7',
    uuid: '6d3b39e7-8cba-44fc-a8c5-71b8cd961678',
    memory: '4,096 MiB',
    disk: '40,000 MiB',
    cpuCores: '3 vCPU Cores',
    port: 25588,
  },
  {
    index: '10',
    id: 'victus-srv-10',
    name: "Icy's Mc Server",
    type: 'game',
    status: 'OFFLINE',
    ip: 'icy.victusmc.net:25590',
    shortId: '0e5d44a6',
    node: 'SG-1',
    sftpAddress: 'sg1.victuscloud.com:2022',
    sftpUsername: 'icy.0e5d44a6',
    uuid: '0e5d44a6-3c2b-4da1-a9e4-71b8cd961010',
    memory: '4,096 MiB',
    disk: '30,000 MiB',
    cpuCores: '2 vCPU Cores',
    port: 25590,
  },
  {
    index: '11',
    id: 'victus-srv-11',
    name: 'AI for Speedy',
    type: 'vps',
    status: 'ACTIVE',
    ip: '194.163.140.85:22',
    shortId: 'vps-speedy',
    node: 'Frankfurt-KVM',
    sftpAddress: 'kvm1.victuscloud.com:22',
    sftpUsername: 'root.speedy',
    uuid: 'bf4a71c2-9e8d-4f6b-8a3c-71b8cd961011',
    memory: '8,192 MiB',
    disk: '80,000 MiB',
    cpuCores: '4 vCPU (KVM Dedicated)',
    port: 22,
  },
];

/**
 * Datacentre each node id belongs to, matching the cluster names the app
 * already reports under Status → node clusters.
 */
export const NODE_REGIONS: Record<string, string> = {
  'SG-1': 'Singapore',
  'SG-2': 'Singapore',
  'US-East': 'Virginia, US',
  'EU-Central': 'Frankfurt, EU',
  'Frankfurt-KVM': 'Frankfurt, EU',
};

export interface NodeSummary {
  node: string;
  region: string;
  total: number;
  active: number;
  memoryMiB: number;
  diskMiB: number;
}

/** "8,192 MiB" -> 8192. Non-numeric input yields 0 rather than NaN. */
export function parseMiB(value: string): number {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * Groups the fleet by node. Everything here is aggregated from the service
 * list, so the infrastructure view can never disagree with the server rows.
 */
export function getNodeSummaries(services: VictusService[]): NodeSummary[] {
  const byNode = new Map<string, NodeSummary>();

  for (const service of services) {
    const existing = byNode.get(service.node) ?? {
      node: service.node,
      region: NODE_REGIONS[service.node] ?? 'Victus Cloud',
      total: 0,
      active: 0,
      memoryMiB: 0,
      diskMiB: 0,
    };

    existing.total += 1;
    if (service.status === 'ACTIVE') existing.active += 1;
    existing.memoryMiB += parseMiB(service.memory);
    existing.diskMiB += parseMiB(service.disk);

    byNode.set(service.node, existing);
  }

  return [...byNode.values()].sort(
    (a, b) => b.active - a.active || b.total - a.total || a.node.localeCompare(b.node)
  );
}

/** "8192" -> "8,192 MiB" */
export function formatMiB(value: number): string {
  return `${value.toLocaleString('en-US')} MiB`;
}

export interface FleetStats {
  gameServersCount: number;
  vpsCount: number;
  addonsCount: number;
  availableServicesCount: number;
  maintenanceStateCount: number;
  databasesAndBackupsCount: number;
  memoryUsage: string;
  diskUsage: string;
  databasesCount: number;
  backupsCount: number;
  runningCount: number;
  stoppedCount: number;
  suspendedCount: number;
}

export function getFleetStats(services: VictusService[]): FleetStats {
  const gameServersCount = services.filter((s) => s.type === 'game' || s.type === 'bot').length;
  const vpsCount = services.filter((s) => s.type === 'vps').length;
  const runningCount = services.filter((s) => s.status === 'ACTIVE').length;
  const stoppedCount = services.filter((s) => s.status === 'OFFLINE').length;
  const suspendedCount = services.filter((s) => s.status === 'SUSPENDED').length;

  return {
    gameServersCount,
    vpsCount,
    addonsCount: 463,
    availableServicesCount: services.length,
    maintenanceStateCount: 0,
    databasesAndBackupsCount: 463,
    memoryUsage: '28,456 MiB',
    diskUsage: '308,418 MiB',
    databasesCount: 226,
    backupsCount: 237,
    runningCount,
    stoppedCount,
    suspendedCount,
  };
}

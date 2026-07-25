import { open, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentActivity } from './agentActivity';

export interface RoleRunScope {
  workspaceRoot: string;
  sessionCreatedAt: number;
  scopeId?: string;
}

interface ParsedRoleRun {
  activity: AgentActivity;
  startedAt: number;
  active: boolean;
}

const STATUS_MAP: Readonly<Record<string, AgentActivity['status']>> = {
  starting: 'starting',
  running: 'running',
  succeeded: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  timed_out: 'failed',
};
const ROLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_MANIFEST_BYTES = 64 * 1024;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function safeTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function parseManifest(
  raw: unknown,
  manifestDirectory: string,
  scope: RoleRunScope,
): ParsedRoleRun | undefined {
  const data = record(raw);
  if (!data || data.schema_version !== '1.0.0' || data.execution_mode !== 'standalone_fresh_session') return undefined;

  const repoRoot = typeof data.repo_root === 'string' ? data.repo_root : '';
  if (!repoRoot || path.resolve(repoRoot) !== path.resolve(scope.workspaceRoot)) return undefined;

  const startedAt = typeof data.started_at === 'string' ? Date.parse(data.started_at) : Number.NaN;
  if (!Number.isFinite(startedAt) || startedAt < scope.sessionCreatedAt) return undefined;

  const role = typeof data.role === 'string' ? data.role.trim() : '';
  const roleId = typeof data.role_id === 'string' ? data.role_id.trim() : '';
  const runId = typeof data.run_id === 'string' ? data.run_id : '';
  const status = typeof data.status === 'string' ? STATUS_MAP[data.status] : undefined;
  if (!role || role.length > 100 || !ROLE_ID.test(roleId) || !runId || !status) return undefined;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(runId) || runId !== path.basename(manifestDirectory)) return undefined;

  const context = record(data.context);
  const contextUsed = safeTokenCount(data.context_used ?? context?.used);
  const contextSize = safeTokenCount(data.context_size ?? context?.size);
  const activity: AgentActivity = {
    id: `role-run:${runId}`,
    name: role,
    status,
    ...(contextUsed !== undefined ? { contextUsed } : {}),
    ...(contextSize !== undefined ? { contextSize } : {}),
  };
  return {
    activity,
    startedAt,
    active: data.status === 'starting' || data.status === 'running',
  };
}

async function readBoundedJson(manifestPath: string): Promise<unknown> {
  const handle = await open(manifestPath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(MAX_MANIFEST_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_MANIFEST_BYTES) throw new Error('role manifest exceeds size limit');
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

/**
 * Load canonical standalone-role manifests for one VS Code session/workspace.
 *
 * The manifest is authoritative for identity and lifecycle. Missing fields are
 * omitted rather than inferred from packet text, process names, or timestamps.
 */
export async function loadRoleRunActivities(
  runtimeRoot: string,
  scope: RoleRunScope,
): Promise<AgentActivity[]> {
  let directories;
  try {
    directories = await readdir(path.join(runtimeRoot, 'runs'), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const manifests = directories
    .filter(entry => entry.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(0, 200);
  const parsed: Array<ParsedRoleRun | undefined> = [];
  for (let index = 0; index < manifests.length; index += 8) {
    const batch = manifests.slice(index, index + 8);
    parsed.push(...await Promise.all(batch.map(async entry => {
      const manifestDirectory = path.join(runtimeRoot, 'runs', entry.name);
      try {
        const raw = await readBoundedJson(path.join(manifestDirectory, 'manifest.json'));
        return parseManifest(raw, manifestDirectory, scope);
      } catch {
        return undefined;
      }
    })));
  }

  return parsed
    .filter((item): item is ParsedRoleRun => item !== undefined)
    .sort((left, right) => Number(right.active) - Number(left.active) || right.startedAt - left.startedAt)
    .slice(0, 12)
    .map(item => item.activity);
}

export function defaultRoleRunsRoot(): string {
  return path.join(os.homedir(), '.hermes', 'role-runs');
}

export class RoleRunMonitor {
  private timer: NodeJS.Timeout | undefined;
  private refreshTail: Promise<void> = Promise.resolve();
  private lastSignature = '';

  constructor(
    private readonly runtimeRoot: string,
    private readonly scope: () => RoleRunScope | undefined,
    private readonly onUpdate: (scope: RoleRunScope, activities: AgentActivity[]) => void,
    private readonly intervalMs = 2_000,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, this.intervalMs);
    this.timer.unref?.();
  }

  refresh(): Promise<void> {
    const scope = this.scope();
    if (!scope) return Promise.resolve();

    const run = async (): Promise<void> => {
      let activities: AgentActivity[];
      try {
        activities = await loadRoleRunActivities(this.runtimeRoot, scope);
      } catch {
        // Runtime manifests are optional metadata. I/O failures clear stale
        // role state instead of destabilising the extension host.
        activities = [];
      }
      const signature = JSON.stringify([scope.scopeId, scope.workspaceRoot, scope.sessionCreatedAt, activities]);
      if (signature !== this.lastSignature) {
        this.lastSignature = signature;
        this.onUpdate(scope, activities);
      }
    };

    const queued = this.refreshTail.catch(() => {}).then(run);
    this.refreshTail = queued;
    return queued;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

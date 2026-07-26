/** Authoritative runtime activity for one Hermes agent or canonical role. */
export interface AgentActivity {
  id: string;
  name: string;
  status: 'planned' | 'starting' | 'running' | 'idle' | 'completed' | 'blocked' | 'failed' | 'cancelled' | 'unknown';
  contextUsed?: number;
  contextSize?: number;
}

const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VALID_STATUSES = new Set<AgentActivity['status']>([
  'planned', 'starting', 'running', 'idle', 'completed', 'blocked', 'failed', 'cancelled', 'unknown',
]);
const MAX_AGENTS = 64;

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

/**
 * Read explicit Hermes agent-activity metadata. Do not infer roles from tool titles,
 * assistant prose, process names, or static org-chart entries.
 */
export function parseAgentActivities(update: Record<string, unknown>): AgentActivity[] | null {
  const meta = update['_meta'];
  const hermes = meta && typeof meta === 'object'
    ? (meta as Record<string, unknown>).hermes
    : undefined;
  const hermesMeta = hermes && typeof hermes === 'object'
    ? hermes as Record<string, unknown>
    : undefined;
  const raw = update.agentActivities
    ?? update.agent_activities
    ?? hermesMeta?.agentActivities
    ?? hermesMeta?.agent_activities;
  if (!Array.isArray(raw)) return null;

  const activities: AgentActivity[] = [];
  const seen = new Set<string>();
  for (const value of raw.slice(0, MAX_AGENTS)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 100) : '';
    const status = typeof candidate.status === 'string'
      ? candidate.status.trim().toLowerCase() as AgentActivity['status']
      : 'unknown';
    if (!AGENT_ID.test(id) || !name || !VALID_STATUSES.has(status) || seen.has(id)) continue;

    const contextUsed = nonNegativeInteger(candidate.contextUsed ?? candidate.context_used);
    const contextSize = nonNegativeInteger(candidate.contextSize ?? candidate.context_size);
    activities.push({
      id,
      name,
      status,
      ...(contextUsed !== undefined ? { contextUsed } : {}),
      ...(contextSize !== undefined && contextSize > 0 ? { contextSize } : {}),
    });
    seen.add(id);
  }
  return activities;
}

export function primaryAgentActivity(
  running: boolean,
  contextUsed?: number,
  contextSize?: number,
): AgentActivity {
  return {
    id: 'primary',
    name: 'Hermes',
    status: running ? 'running' : 'idle',
    ...(nonNegativeInteger(contextUsed) !== undefined ? { contextUsed } : {}),
    ...(nonNegativeInteger(contextSize) !== undefined && (contextSize as number) > 0 ? { contextSize } : {}),
  };
}

export function shouldPulseComposer(busy: boolean, activities: readonly AgentActivity[]): boolean {
  return busy || activities.some(activity => activity.status === 'starting' || activity.status === 'running');
}

/** Explicit adapter metadata wins when it supplies the primary role identity. */
export function mergeAgentActivities(
  primary: AgentActivity,
  activities: readonly AgentActivity[],
): AgentActivity[] {
  const explicitPrimary = activities.find(activity => activity.id === primary.id);
  return [explicitPrimary ?? primary, ...activities.filter(activity => activity.id !== primary.id)];
}

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ModelMenuItem {
  id: string;
  label: string;
  command: string;
}

export interface ModelMenuGroup {
  group: string;
  items: ModelMenuItem[];
}

/** One entry of ACP's `SessionModelState.available_models`. */
export interface AcpModelInfo {
  modelId?: string;
  name?: string;
}

/** ACP `SessionModelState`, sent on session/new and session/load. */
export interface AcpModelState {
  availableModels?: AcpModelInfo[];
  currentModelId?: string;
}

interface HermesModelRecord {
  id?: string;
  name?: string;
}

interface HermesModelCache {
  anthropic?: {
    models?: Record<string, HermesModelRecord>;
  };
  openai?: {
    models?: Record<string, HermesModelRecord>;
  };
}

const ANTHROPIC_MODEL_IDS = [
  'claude-opus-4-1-20250805',
  'claude-opus-4-20250514',
  'claude-opus-4-5-20251101',
  'claude-opus-4-6',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-6',
  'claude-3-haiku-20240307',
  'claude-haiku-4-5-20251001',
];

const OPENAI_CODEX_MODEL_IDS = [
  'gpt-5.4-mini',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.3-codex-spark',
];

const FALLBACK_LABELS: Record<string, string> = {
  'claude-opus-4-1-20250805': 'Claude Opus 4.1',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-opus-4-5-20251101': 'Claude Opus 4.5',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-5.4-mini': 'GPT-5.4 mini',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'gpt-5.2-codex': 'GPT-5.2 Codex',
  'gpt-5.2': 'GPT-5.2',
  'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
  'gpt-5.1-codex-mini': 'GPT-5.1 Codex mini',
  'gpt-5.3-codex-spark': 'GPT-5.3 Codex Spark',
};

const UNGROUPED = 'Models';
/** Hermes renders inventory names as "<provider label> · <model>". */
const NAME_SEPARATOR = ' · ';

/**
 * Split an inventory entry into its provider label and model label.
 *
 * Hermes builds ids as `<provider>:<model>` and names as
 * `<provider label> · <model>`, so the human-readable provider label is already
 * on the wire. Prefer it, fall back to the id prefix, and only then to a
 * generic bucket — the picker never hardcodes a provider list.
 */
function splitEntry(entry: AcpModelInfo): { group: string; label: string } {
  const id = (entry.modelId ?? '').trim();
  const name = (entry.name ?? '').trim();

  const separator = name.indexOf(NAME_SEPARATOR);
  if (separator > 0) {
    return {
      group: name.slice(0, separator).trim(),
      label: name.slice(separator + NAME_SEPARATOR.length).trim(),
    };
  }

  const colon = id.indexOf(':');
  if (colon > 0) {
    return { group: id.slice(0, colon), label: name || id.slice(colon + 1) };
  }

  return { group: UNGROUPED, label: name || id };
}

/**
 * Turn ACP's advertised inventory into picker groups.
 *
 * `command` is the advertised `modelId` verbatim: it is handed straight back to
 * `session/set_model`, so it must round-trip untouched. Provider order follows
 * the server's own ordering rather than being re-sorted here.
 */
export function buildModelGroups(state: AcpModelState | undefined): ModelMenuGroup[] {
  const groups: ModelMenuGroup[] = [];
  const byName = new Map<string, ModelMenuGroup>();

  for (const entry of state?.availableModels ?? []) {
    const id = (entry.modelId ?? '').trim();
    if (!id) {
      continue;
    }

    const { group: groupName, label } = splitEntry(entry);
    let group = byName.get(groupName);
    if (!group) {
      group = { group: groupName, items: [] };
      byName.set(groupName, group);
      groups.push(group);
    }

    group.items.push({ id, label: label || id, command: id });
  }

  return groups;
}

/**
 * Choose which inventory the picker shows.
 *
 * Live ACP state wins outright whenever it carries anything — it is the only
 * source that knows about local, custom, and named-endpoint providers. The
 * fallback covers the window before the first session/new response arrives.
 * The two are never merged: appending a stale hardcoded list to the
 * authoritative one would resurrect models the server did not offer.
 */
export function resolveModelGroups(
  state: AcpModelState | undefined,
  fallback: ModelMenuGroup[],
): ModelMenuGroup[] {
  const live = buildModelGroups(state);
  return live.length > 0 ? live : fallback;
}

function readCache(): HermesModelCache | null {
  const cachePath = path.join(os.homedir(), '.hermes', 'models_dev_cache.json');
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(raw) as HermesModelCache;
  } catch {
    return null;
  }
}

function itemLabel(modelId: string, record?: HermesModelRecord): string {
  const label = record?.name?.trim();
  return label || FALLBACK_LABELS[modelId] || modelId;
}

function buildGroup(
  group: string,
  commandPrefix: string,
  ids: readonly string[],
  models?: Record<string, HermesModelRecord>,
): ModelMenuGroup {
  const hasCache = !!models && Object.keys(models).length > 0;
  const selectedIds = hasCache ? ids.filter((id) => models[id]) : [...ids];
  return {
    group,
    items: (selectedIds.length > 0 ? selectedIds : [...ids]).map((id) => ({
      id,
      label: itemLabel(id, models?.[id]),
      command: `${commandPrefix}:${id}`,
    })),
  };
}

/**
 * Offline fallback used before any session has advertised its inventory.
 *
 * `buildModelGroups` is the real source once ACP replies; this keeps the picker
 * populated during the window before the first session/new response arrives.
 */
export function loadHermesModelGroups(): ModelMenuGroup[] {
  const cache = readCache();
  const anthropic = cache?.anthropic?.models;
  const openai = cache?.openai?.models;

  return [
    buildGroup('Anthropic', 'anthropic', ANTHROPIC_MODEL_IDS, anthropic),
    buildGroup('OpenAI Codex', 'openai-codex', OPENAI_CODEX_MODEL_IDS, openai),
  ];
}

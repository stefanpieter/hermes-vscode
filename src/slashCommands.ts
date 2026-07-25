/** Slash-command metadata advertised by the active Hermes ACP session. */
export interface AvailableSlashCommand {
  name: string;
  description: string;
  inputHint?: string;
}

/** Compatibility catalog used only until the adapter advertises its live list. */
export const DEFAULT_AVAILABLE_COMMANDS: readonly AvailableSlashCommand[] = [
  { name: 'help', description: 'List available commands' },
  { name: 'model', description: 'Show current model and provider, or switch models', inputHint: 'model name to switch to' },
  { name: 'tools', description: 'List available tools with descriptions' },
  { name: 'context', description: 'Show conversation message counts by role' },
  { name: 'reset', description: 'Clear conversation history' },
  { name: 'compress', description: 'Compress conversation context' },
  { name: 'steer', description: 'Inject guidance into the currently running agent turn', inputHint: 'guidance for the active turn' },
  { name: 'queue', description: 'Queue a prompt to run after the current turn finishes', inputHint: 'prompt to run next' },
  { name: 'version', description: 'Show Hermes version' },
];

const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MAX_COMMANDS = 100;
const MAX_DESCRIPTION = 240;
const MAX_INPUT_HINT = 120;

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

/**
 * Parse the ACP available_commands_update payload as untrusted runtime input.
 * An empty array is a valid authoritative command set; null means no feed was present.
 */
export function parseAvailableCommandsUpdate(update: Record<string, unknown>): AvailableSlashCommand[] | null {
  const raw = update.availableCommands ?? update.available_commands;
  if (!Array.isArray(raw)) return null;

  const commands: AvailableSlashCommand[] = [];
  const seen = new Set<string>();
  for (const value of raw.slice(0, MAX_COMMANDS)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Record<string, unknown>;
    const rawName = cleanText(candidate.name, 65)?.replace(/^\//, '');
    if (!rawName || !COMMAND_NAME.test(rawName)) continue;
    const name = rawName.toLowerCase();
    if (seen.has(name)) continue;

    const description = cleanText(candidate.description, MAX_DESCRIPTION) ?? '';
    const input = candidate.input && typeof candidate.input === 'object'
      ? candidate.input as Record<string, unknown>
      : undefined;
    const inputHint = cleanText(
      candidate.inputHint ?? candidate.input_hint ?? input?.hint,
      MAX_INPUT_HINT,
    );

    commands.push({ name, description, ...(inputHint ? { inputHint } : {}) });
    seen.add(name);
  }
  return commands;
}

export function isKnownSlashCommand(
  text: string,
  availableCommands: readonly AvailableSlashCommand[] = DEFAULT_AVAILABLE_COMMANDS,
): boolean {
  if (!text.startsWith('/')) return false;
  const first = text.slice(1).split(/\s/, 1)[0].toLowerCase();
  return availableCommands.some(command => command.name.toLowerCase() === first);
}

export type SlashCommandPresentation = {
  command: string;
  mode: 'execute' | 'confirm' | 'prompt';
  argumentLabel?: string;
  confirmation?: string;
};

/** Derive UI dispatch behavior from ACP metadata, preserving a local safety gate for reset. */
export function slashCommandPresentation(command: AvailableSlashCommand): SlashCommandPresentation {
  const text = `/${command.name}`;
  if (command.name.toLowerCase() === 'reset') {
    return {
      command: text,
      mode: 'confirm',
      confirmation: 'Clear the entire conversation history? This cannot be undone.',
    };
  }
  if (command.inputHint) {
    return { command: text, mode: 'prompt', argumentLabel: command.inputHint };
  }
  return { command: text, mode: 'execute' };
}

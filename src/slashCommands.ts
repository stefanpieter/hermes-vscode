/** Known ACP adapter slash commands that return system-style responses. */
const KNOWN_SLASH_COMMANDS = new Set([
  'help', 'model', 'tools', 'context', 'reset', 'compact', 'steer', 'queue',
  'version',
]);

export function isKnownSlashCommand(text: string): boolean {
  if (!text.startsWith('/')) return false;
  const first = text.slice(1).split(/\s/, 1)[0].toLowerCase();
  return KNOWN_SLASH_COMMANDS.has(first);
}

/**
 * `@` file mentions.
 *
 * Pure parsing and prompt assembly: no DOM, no vscode API, so it lives under
 * the main tsconfig and is directly unit-testable. The webview detects the
 * query and renders the picker; the extension host resolves matches (only it
 * has `vscode.workspace`).
 *
 * Hermes reads mentioned files itself from the `file://` URI
 * (`acp_adapter/content.py::_resource_link_to_parts`), so a mention costs one
 * small block — the extension never inlines file contents into the prompt.
 */

/** A prompt content block as ACP accepts it. */
export type PromptBlock =
  | { type: 'text'; text: string }
  | { type: 'resource_link'; uri: string; name: string };

/** A mention the host resolved to a real workspace file. */
export interface ResolvedMention {
  /** The text written after `@`, e.g. `src/session.py`. */
  mention: string;
  /** Absolute `file://` URI Hermes will read. */
  uri: string;
  /** Display name, usually the basename. */
  name: string;
}

/**
 * A candidate offered by the composer's `@` picker.
 *
 * Declared here rather than beside the resolver so `types.ts` — which the
 * webview bundle imports — never has a path to a module that requires
 * `vscode`.
 */
export interface MentionSuggestion {
  /** Text inserted after `@`, workspace-relative and slash-normalised. */
  mention: string;
  /** Basename, shown as the primary label. */
  name: string;
  /** Containing directory, shown as the dim suffix. */
  directory: string;
  uri: string;
}

/**
 * Characters that may appear in a mention.
 *
 * Whitespace ends one. `@` is excluded so `user@example.com` cannot be read as
 * a mention of `example.com`.
 */
const MENTION_BODY = '[^\\s@]*';
const MENTION_PATTERN = new RegExp(`(^|\\s)@(${MENTION_BODY})`, 'g');

/** Which catalogue a mention query is searching. */
export interface MentionQueryKind {
  kind: 'file' | 'skill';
  /** The query with any `skill:` prefix stripped. */
  term: string;
}

/**
 * Classify a mention query.
 *
 * `@skill:debug` searches skills; anything else searches workspace files. The
 * picker needs the distinction to know which catalogue to offer, and the
 * sender needs it so a skill is never resolved as a file path.
 */
export function splitMentionQuery(query: string): MentionQueryKind {
  const prefix = 'skill:';
  if (query.toLowerCase().startsWith(prefix)) {
    return { kind: 'skill', term: query.slice(prefix.length) };
  }
  return { kind: 'file', term: query };
}

/**
 * Find the mention the caret is currently inside, if any.
 *
 * Returns the query text after `@` and the index of the `@` itself, so the
 * caller can replace the right span on accept. A bare `@` yields an empty
 * query, which should open the picker unfiltered.
 */
export function findMentionQuery(
  text: string,
  caret: number,
): { query: string; start: number } | undefined {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) {
    return undefined;
  }

  // Must start a word: beginning of input or preceded by whitespace. This is
  // what keeps email addresses and `a@b` from opening the picker.
  const preceding = at === 0 ? '' : before[at - 1];
  if (preceding && !/\s/.test(preceding)) {
    return undefined;
  }

  const query = before.slice(at + 1);
  if (/[\s@]/.test(query)) {
    return undefined;
  }

  return { query, start: at };
}

/** Every distinct path mentioned in the text, in first-seen order. */
export function parseMentions(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const mention = match[2];
    if (mention && !seen.has(mention)) {
      seen.add(mention);
      found.push(mention);
    }
  }

  return found;
}

/**
 * Assemble the ACP prompt payload.
 *
 * The text is sent verbatim — mentions stay visible so the transcript reads
 * the way the user typed it — followed by one `resource_link` per resolved
 * file. A mention that resolved to nothing is left as literal text rather than
 * becoming a link to a path that does not exist.
 */
export function buildPromptBlocks(text: string, resolved: ResolvedMention[]): PromptBlock[] {
  const blocks: PromptBlock[] = [{ type: 'text', text }];

  for (const file of resolved) {
    blocks.push({ type: 'resource_link', uri: file.uri, name: file.name });
  }

  return blocks;
}

# Repository guidance

This repository contains a VS Code extension that surfaces Hermes Agent as a sidebar chat client over ACP (JSON-RPC 2.0 on stdio).

## Source orientation

```text
src/
  extension.ts       activation, commands, profile and approval settings
  acpClient.ts       Hermes ACP subprocess and JSON-RPC lifecycle
  sessionManager.ts  session lifecycle and streamed ACP updates
  sessionStore.ts    VS Code workspaceState persistence
  chatPanel.ts       extension-host authority for webview/session UI state
  protocol.ts        ACP update parsing and normalisation
  webview/           sandboxed browser-side UI
resources/           extension icons and logos
```

## Required gates

```bash
npm ci
npm run verify
```

For focused work, run the smallest relevant test first, then the full verification gate before proposing a release.

## Engineering rules

- Treat the extension host as authoritative; webview state is transient.
- Bind asynchronous ACP events to the child-process generation and session that created them.
- Keep foreground prompt completion and background-process completion as separate lifecycle channels.
- Add deterministic regressions for session switching, process replacement, queue mutation, cancellation, and delayed events.
- Never include user-specific paths, hosts, providers, model selections, credentials, or local Hermes patches in tracked documentation.
- Use the public Hermes Agent documentation and repository as the compatibility reference.
- Preserve the original MIT attribution.
- Do not publish using the `joaompfp` Marketplace identity while the handover is unresolved.

## Release policy

Follow `docs/releasing.md`, `GOVERNANCE.md`, and the active transition plan under `docs/plans/`.

# Hermes AI Agent for VS Code

A VS Code sidebar client for [Hermes Agent](https://github.com/NousResearch/hermes-agent), communicating with a local Hermes process over the Agent Client Protocol (ACP).

## Maintenance status

[`stefanpieter/hermes-vscode`](https://github.com/stefanpieter/hermes-vscode) is the canonical, actively maintained successor of the original `joaompfp/hermes-vscode` codebase. Development, issues, pull requests, security work, and source releases are managed here; the original repository is retained only as project provenance and is no longer a contribution target for this maintained line.

- Joao Peixoto remains credited as the original author and copyright holder.
- The maintained successor has registered the distinct Marketplace publisher `stefanpieter` and selected extension identity `stefanpieter.hermes-ai-agent` with display name **Hermes AI Agent (Maintained)**; publication remains gated on a verified automation credential.
- The original `joaompfp.hermes-ai-agent` Marketplace listing remains owned by its original publisher and is not this project's release channel.
- Stable GitHub releases whose `vX.Y.Z` tag exactly matches `package.json` are verified and published automatically through the protected `marketplace-production` environment.

See the [governance policy](https://github.com/stefanpieter/hermes-vscode/blob/main/GOVERNANCE.md) and [transition plan](https://github.com/stefanpieter/hermes-vscode/blob/main/docs/plans/2026-07-24-maintained-successor-transition.md).

## Features

- Streaming Hermes chat in the VS Code sidebar
- Multiple persistent workspace conversations
- Hermes profile and model selection
- ACP permission and edit-approval controls
- Tool calls, reasoning, todos, usage, and context visibility
- Live Lead/role activity chips with per-agent context usage and compression counts
- Background-process lifecycle notifications
- Busy-session follow-up queue with edit and delete controls
- Image paste, file references, slash commands, and skill selection
- Automatic file opening for read and edit tool calls

## Requirements

1. A supported VS Code release (`^1.85.0` or newer).
2. A working Hermes Agent installation.
3. `hermes` available on `PATH`, or an explicit trusted path in `hermes.path`.
4. A trusted workspace. The extension remains disabled in VS Code Restricted Mode because it launches an autonomous local agent with access to the current workspace.

Use the current [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs) for installation, providers, profiles, and ACP configuration.

## Development installation

```bash
npm ci
npm run verify
code --install-extension hermes-ai-agent-ci.vsix
```

The generated VSIX uses the maintained successor identity `stefanpieter.hermes-ai-agent`.

Do not activate the original and maintained extensions together: they contribute the same Hermes commands, settings, and views. The maintained extension fails closed while `joaompfp.hermes-ai-agent` is installed. Uninstall or disable the original, then reload VS Code before using the maintained successor. VS Code settings remain under the existing `hermes.*` keys, but extension-scoped saved session-list state and trusted-binary approvals do not migrate to the new extension ID. Hermes's own persisted runtime sessions are not deleted by uninstalling the old VS Code extension.

After installing or updating a VSIX, reload the VS Code window when no valuable ACP/background process is running.

## Configuration

| Setting | Purpose |
|---|---|
| `hermes.path` | Trusted absolute path to the Hermes executable |
| `hermes.profile` | Hermes profile launched by the ACP client |
| `hermes.editApprovalMode` | ACP edit approval mode, when supported by Hermes |

Configuration is machine-overridable. The extension asks for approval before launching a newly selected executable path.

## Build and verification

```bash
npm ci
npm run verify
```

`npm run verify` performs TypeScript checking, secret scanning, the regression suite, a production build, a dependency security audit, VSIX packaging, and package-file listing.

Individual commands:

```bash
npm run lint
npm test
npm run build
npm run package
```

## Architecture

- `src/extension.ts` — extension activation and command wiring
- `src/acpClient.ts` — Hermes ACP subprocess and JSON-RPC lifecycle
- `src/sessionManager.ts` — ACP sessions and streamed updates
- `src/sessionStore.ts` — workspace session persistence
- `src/chatPanel.ts` — extension-host authority for webview state
- `src/webview/` — browser-side chat rendering and interaction

The extension treats ACP/session state in the extension host as authoritative. Webview state is transient and must be rehydrated after recreation.

## Contributing and security

Read the [contribution guide](https://github.com/stefanpieter/hermes-vscode/blob/main/CONTRIBUTING.md) before submitting changes. Report vulnerabilities according to the [security policy](https://github.com/stefanpieter/hermes-vscode/blob/main/SECURITY.md), not through a public issue.

## Licence

MIT. See [LICENSE](LICENSE). The original copyright and permission notice are retained.

# Hermes AI Agent for VS Code

A VS Code sidebar client for [Hermes Agent](https://github.com/NousResearch/hermes-agent), communicating with a local Hermes process over the Agent Client Protocol (ACP).

## Maintenance status

This repository contains the actively maintained successor line of [`joaompfp/hermes-vscode`](https://github.com/joaompfp/hermes-vscode). A cooperative maintainership or ownership handover has been requested. Until that is resolved:

- Joao Peixoto remains credited as the original author and copyright holder.
- The original Marketplace listing remains owned by publisher `joaompfp`.
- Builds from this repository must not be published through that publisher without explicit access and authorisation.
- Local candidate builds from this fork are development artefacts only. Any VSIX retaining the original identity remains restricted to private compatibility testing.

See the [governance policy](https://github.com/stefanpieter/hermes-vscode/blob/main/GOVERNANCE.md) and [transition plan](https://github.com/stefanpieter/hermes-vscode/blob/main/docs/plans/2026-07-24-maintained-successor-transition.md).

## Features

- Streaming Hermes chat in the VS Code sidebar
- Multiple persistent workspace conversations
- Hermes profile and model selection
- ACP permission and edit-approval controls
- Tool calls, reasoning, todos, usage, and context visibility
- Background-process lifecycle notifications
- Busy-session follow-up queue with edit and delete controls
- Image paste, file references, slash commands, and skill selection
- Automatic file opening for read and edit tool calls

## Requirements

1. A supported VS Code release (`^1.85.0` or newer).
2. A working Hermes Agent installation.
3. `hermes` available on `PATH`, or an explicit trusted path in `hermes.path`.

Use the current [Hermes Agent documentation](https://hermes-agent.nousresearch.com/docs) for installation, providers, profiles, and ACP configuration.

## Development installation

```bash
npm ci
npm run verify
code --install-extension hermes-ai-agent-ci.vsix
```

The generated VSIX retains the original extension identity only for local compatibility testing while handover is pending. Do not publish it, upload it to the Marketplace, or attach it to a public release.

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

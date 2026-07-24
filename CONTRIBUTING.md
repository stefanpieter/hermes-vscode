# Contributing

Thank you for helping maintain the Hermes VS Code client.

## Set up

Requirements:

- Node.js 20 or newer
- npm
- VS Code compatible with the engine range in `package.json`
- Hermes Agent for live ACP testing when a change affects runtime integration

```bash
git clone https://github.com/stefanpieter/hermes-vscode.git
cd hermes-vscode
npm ci
npm run verify
```

## Workflow

1. Open or reference an issue for non-trivial work.
2. Create a focused branch from the maintained default branch.
3. Add a deterministic failing regression before fixing a bug.
4. Keep extension-host authority separate from transient webview state.
5. Run the focused test while iterating.
6. Run `npm run verify` before requesting review.
7. Add a changelog entry for user-visible behaviour.

## Pull-request evidence

Describe:

- the user-visible problem or feature
- the root cause and relevant ACP/session lifecycle
- automated tests added or changed
- live Hermes/VS Code verification, when applicable
- security, migration, and rollback implications

High-risk areas include process replacement, permission responses, session switching, delayed events, background work, persisted state, HTML rendering, and executable launch configuration. These require targeted tests and independent review.

## Code and documentation rules

- Do not commit credentials, tokens, personal paths, private hosts, private model/provider configuration, or local database contents.
- Do not instruct contributors to patch files under their personal Hermes installation.
- Use text-node rendering or explicit escaping for untrusted webview content.
- Do not weaken executable-path approval or ACP permission handling without a documented threat analysis.
- Keep protocol assumptions grounded in current Hermes Agent behaviour and public documentation.
- Preserve the original MIT licence and attribution.

## Distribution identity

The Marketplace handover is unresolved. Do not publish a package using publisher `joaompfp`, change the extension identity, or create a new public listing without a recorded maintainer decision and tested migration plan.

## Security reports

Follow `SECURITY.md`. Do not disclose suspected vulnerabilities in public issues or pull requests.

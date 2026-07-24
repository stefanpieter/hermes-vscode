# Maintained successor transition plan

Date: 2026-07-24
Status: In progress
Interim canonical repository: `stefanpieter/hermes-vscode`
Upstream repository: `joaompfp/hermes-vscode`

## Objective

Establish a sustainable, transparent maintenance line for the Hermes VS Code extension without impersonating the original publisher, fragmenting users unnecessarily, or discarding the tested existing implementation.

The preferred outcome is cooperative co-maintenance or transfer of the existing GitHub repository and Marketplace distribution. Until that is resolved, the maintained fork may publish source branches and verification summaries only. Any VSIX that retains `joaompfp.hermes-ai-agent` is restricted to local or explicitly private compatibility testing and must not be attached to a public release, published to a Marketplace, or presented as an upstream release.

## Confirmed baseline

- The source is MIT licensed. The original copyright and permission notice must remain.
- Upstream's last source push and Marketplace update were on 2026-04-06.
- The upstream Marketplace listing is version 3.0.0.
- The maintained line is version 3.3.0 and contains materially newer ACP lifecycle, permissions, profile, queue, and background-process support.
- A handover/co-maintenance proposal was posted on upstream PR #16 on 2026-07-24: https://github.com/joaompfp/hermes-vscode/pull/16#issuecomment-5073543397
- The current `package.json` still uses the original Marketplace identity. It is valid only for local compatibility testing while handover is pending; it is not authorised for public publication by the maintained fork.

## Guardrails

1. Do not publish with another person's Marketplace credentials or publisher identity.
2. Do not claim official Nous Research status without organisational approval.
3. Preserve Joao Peixoto's MIT copyright notice and document later maintainers' contributions separately.
4. Do not rewrite the extension solely to create a new distribution; retain tested behaviour and history.
5. Do not merge or publish a renamed extension until migration from `joaompfp.hermes-ai-agent` has been tested.
6. Do not require users to run scripts that directly mutate VS Code's internal state database.
7. Treat GitHub releases and Marketplace publication as separate gates.

## Phase 1 — repository foundation

### Task 1: Remove repository-specific private assumptions

Files:
- `CLAUDE.md`
- `README.md`

Actions:
- Remove personal host/model configuration and local patch instructions.
- Link to current Hermes Agent documentation and repository.
- Describe supported ACP expectations and public compatibility boundaries.

Verification:
- Search tracked files for user home paths, private IP addresses, private model/provider settings, secrets, and stale `collinear-ai` links.

### Task 2: Add governance and contribution policy

Files:
- `GOVERNANCE.md`
- `MAINTAINERS.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/CODEOWNERS`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug-report.yml`
- `.github/ISSUE_TEMPLATE/feature-request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`

Actions:
- Record interim ownership, transfer readiness, decision rules, review requirements, security reporting, and maintainer succession.
- Require evidence for ACP lifecycle and concurrency changes.
- Keep support boundaries explicit.

### Task 3: Add deterministic verification and CI

Files:
- `package.json`
- `.github/workflows/ci.yml`
- `.github/dependabot.yml`
- `docs/releasing.md`

Actions:
- Add a single local verification command covering type checking, secret scanning, tests, production build, package creation, package inspection, and a locked dependency security audit.
- Run the same gates in CI on pushes and pull requests.
- Build and inspect the VSIX ephemerally in CI, but do not upload it while its manifest retains the original publisher identity.
- Document release provenance, checksums, changelog requirements, and Marketplace approval gates.

Verification:
- `npm ci`
- `npm run verify`
- Inspect the generated VSIX file list and manifest.
- `git diff --check`

## Phase 2 — distribution decision and migration

### Task 4: Resolve identity

Preferred path:
- Cooperative access/transfer for the existing repository and Marketplace extension.

Fallback path:
- A clearly named successor under an authorised publisher, initially `stefanpieter` unless an organisation accepts ownership.

Before changing `publisher`, `name`, command IDs, view IDs, or display name:
- Record the final publisher and repository owner.
- Confirm branding permission.
- Confirm whether the original extension can publish a final migration notice.

### Task 5: Design and test migration

Files:
- `docs/migration-from-original.md`
- Later implementation and tests for explicit export/import if a new extension ID is required.

Requirements:
- Explain that VS Code `workspaceState` is scoped to extension identity.
- Preserve ordinary `hermes.*` configuration where compatible.
- Prevent the original and successor extensions from contributing conflicting commands/views simultaneously.
- Provide an explicit, supported export/import path or clearly state which UI-only history cannot migrate.
- Never read or edit VS Code's private state database as the normal migration path.
- Test uninstall/install, multi-root workspaces, remote workspaces, and rollback.

## Phase 3 — public transition

### Task 6: Release candidate

- Complete independent code and security review.
- After an authorised distribution identity exists, publish a GitHub pre-release with a checksum and migration warning.
- Enable issues and private vulnerability reporting on the maintained repository.
- Require pull requests and passing CI for `main`.

### Task 7: Marketplace release

Only after identity and migration gates pass:
- Publish under an authorised publisher.
- Ensure all package links point to the canonical maintained repository.
- Mark the relationship to the original project accurately.
- Announce the supported migration and rollback process.

## Acceptance criteria

- No private environment data or credentials are tracked or packaged.
- Repository ownership and release authority are explicit.
- The full test/typecheck/build/package/audit gate passes from a clean checkout.
- The VSIX contains only intended runtime files and assets.
- The MIT licence and original attribution remain intact.
- A new Marketplace identity is not published before migration testing.
- The transition branch receives independent review before merge.

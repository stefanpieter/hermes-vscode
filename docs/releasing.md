# Releasing

## Authority

The original Marketplace publisher is `joaompfp`. No maintained-fork release may be published through that identity without explicit access and authorisation from its owner.

While handover is pending, maintainers may publish source branches and verification summaries. They must not attach a publicly downloadable VSIX that still declares the original publisher identity. A compatibility or bridge VSIX may be shared privately with explicit testers, with a clear warning that it is not an upstream or Marketplace release.

## Release prerequisites

- The release commit is on a protected branch or reviewed release branch.
- User-visible changes are documented in `CHANGELOG.md`.
- Distribution identity and repository links match the authorised channel.
- Persisted-state or identity changes have tested migration and rollback instructions.
- No user-specific configuration, private paths, credentials, generated databases, or development archives are tracked or packaged.
- An independent reviewer has approved high-risk lifecycle/security changes.

## Candidate procedure

From a clean checkout:

```bash
npm ci
npm run verify
git diff --check
git status --short
```

`npm run verify` produces `hermes-ai-agent-ci.vsix`. Record its SHA-256 using a platform-appropriate trusted tool and inspect the package listing emitted by `vsce ls`.

Verify at minimum:

1. TypeScript compilation and all tests pass.
2. Production extension and webview bundles build.
3. The isolated lockfile audit forces an online query to the official npm registry, ignores external npm offline/omit/production/registry settings, explicitly includes production, development, optional, and peer dependencies, verifies npm's reported dependency total against `package-lock.json`, validates the structure and internal consistency of vulnerability metadata, and reports no vulnerability findings at any severity. Behavioural regressions must cover hostile environment and user/global configuration, incomplete or contradictory inventory, malformed output, vulnerabilities, child-process failure, and temporary-state cleanup.
4. The VSIX contains only the manifest, bundled runtime, README/licence/changelog, and required assets.
5. A fresh VS Code profile can install and activate the candidate.
6. Hermes ACP can initialise, open/resume a session, stream a response, handle permissions, and complete background work.
7. Upgrade and rollback behaviour match the release notes.

## GitHub pre-release

This step requires an authorised distribution identity. It is not permitted while the candidate still declares the original publisher without transfer or co-maintainer authorisation.

- Tag the exact reviewed commit.
- Attach the VSIX and a SHA-256 checksum file.
- Include compatibility, migration, rollback, and known-limitations notes.
- Mark it as a pre-release while distribution ownership is unresolved.
- Never attach secrets or diagnostic state databases.

## Marketplace release

Marketplace publication additionally requires:

- an authorised publisher account owned by the agreed maintainer/organisation
- final extension ID, display name, repository, support, and security links
- a tested migration from `joaompfp.hermes-ai-agent` if the ID changes
- a clear statement of upstream/fork relationship
- a final independent package review

A publisher token must be stored only in the release platform's secret store. It must not appear in local config, repository files, shell history, logs, or release artefacts.

## Rollback

Retain the previous known-good VSIX and release notes. If a candidate regresses ACP/session integrity, stop distribution, document the affected versions, and direct users to the previous verified artefact. Do not claim preserved sessions unless rollback has been tested for that state schema.

# Releasing

## Authority

The authorised maintained-successor Marketplace identity is `stefanpieter.hermes-ai-agent-maintained`. The original Marketplace publisher is `joaompfp`; no successor release may be published through that identity.

Release artefacts must declare publisher `stefanpieter`, package name `hermes-ai-agent-maintained`, display name `Hermes AI Agent (Maintained)`, and the canonical repository links. Marketplace requires package names to be globally unique: the original listing already owns `hermes-ai-agent`, so the successor must not reuse it even under a different publisher.

### Publisher account record

- Marketplace publisher ID: `stefanpieter`
- Owner sign-in: `comesayhi@gmail.com` (personal Microsoft account / `live.com` identity)
- Exact Marketplace user ID: stored in macOS Keychain under service `Hermes VS Code Marketplace Publisher`, account `stefanpieter`; it is intentionally not duplicated in this public repository

The publisher record is established, but automated publish access is not complete until a Microsoft Entra workload identity has been federated to the GitHub `marketplace-production` environment and added as a member of publisher `stefanpieter`. The Keychain item above records the human owner identity only.

Known setup issue observed on 2026-08-11: attempting to use this personal Microsoft account against the `Microsoft_Azure_Resources` application in the `Microsoft Services` tenant failed with `AADSTS50020` / `AADSTS16000` because the `live.com` identity was not a guest in that tenant. [Microsoft documents](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50020-user-account-identity-provider-does-not-exist) this as expected when a personal Microsoft account reaches the Microsoft Services tenant without a linked directory. This is not evidence that the Marketplace publisher is missing. Long-term workload-identity setup requires a tenant and subscription controlled by the publisher owner; create those under the same personal account rather than changing the Marketplace identity.

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

`npm run verify` produces `hermes-ai-agent-maintained-ci.vsix`. Record its SHA-256 using a platform-appropriate trusted tool and inspect the package listing emitted by `vsce ls`.

Verify at minimum:

1. TypeScript compilation and all tests pass.
2. Production extension and webview bundles build.
3. The isolated lockfile audit forces an online query to the official npm registry, ignores external npm offline/omit/production/registry settings, explicitly includes production, development, optional, and peer dependencies, verifies npm's reported dependency total against `package-lock.json`, validates the structure and internal consistency of vulnerability metadata, and reports no vulnerability findings at any severity. Behavioural regressions must cover hostile environment and user/global configuration, incomplete or contradictory inventory, malformed output, vulnerabilities, child-process failure, and temporary-state cleanup.
4. The VSIX contains only the manifest, bundled runtime, README/licence/changelog, and required assets.
5. A fresh VS Code profile can install and activate the candidate.
6. Hermes ACP can initialise, open/resume a session, stream a response, handle permissions, and complete background work.
7. Upgrade and rollback behaviour match the release notes.

## GitHub release and automated Marketplace publication

Publishing a stable GitHub release triggers `.github/workflows/publish-marketplace.yml`. The workflow:

- checks out the exact release tag;
- rejects drafts, prereleases, non-semantic versions, identity drift, and tag/package-version mismatches;
- requires the tagged commit to be on canonical `main`;
- runs the complete release gate and packages the exact VSIX;
- exchanges GitHub's short-lived OIDC token for the environment's Microsoft Entra publishing identity;
- publishes through `vsce --azure-credential` without a stored publishing secret;
- uses `--skip-duplicate` so a replay cannot create a second copy of the same version.

The eligible tag is exactly `vX.Y.Z`, where `X.Y.Z` equals `package.json`'s stable version. GitHub prereleases are intentionally not Marketplace-published. Never attach secrets or diagnostic state databases.

## Marketplace release

Marketplace publication requires:

- publisher `stefanpieter` owned by the recorded Marketplace account;
- a user-assigned managed identity added as a member of publisher `stefanpieter`;
- a federated credential with issuer `https://token.actions.githubusercontent.com`, subject `repo:stefanpieter/hermes-vscode:environment:marketplace-production`, and audience `api://AzureADTokenExchange`;
- environment variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` containing non-secret identity references;
- final extension ID, display name, repository, support, and security links;
- migration and coexistence warnings for `joaompfp.hermes-ai-agent` users;
- a final independent package review.

### Long-term workload-identity setup

The publishing path intentionally does not use a Marketplace PAT or client secret. Set it up once as follows:

1. Create or select a Microsoft Entra tenant and Azure subscription controlled by the publisher owner. A paid monthly Azure plan is not required, but Azure may require payment-method verification before it creates the subscription.
2. Create a dedicated resource group and user-assigned managed identity for Marketplace publishing.
3. Add one federated credential using Azure's **Other issuer** scenario. Set issuer `https://token.actions.githubusercontent.com`, subject identifier `repo:stefanpieter/hermes-vscode:environment:marketplace-production`, audience `api://AzureADTokenExchange`, and name `github-marketplace-production`. Do not use the GitHub-guided form if it generates an ID-bound subject containing numeric owner/repository IDs: GitHub Actions presents the standard environment-scoped subject above, and an ID-bound subject fails with `AADSTS700213`.
4. Add the managed identity's client ID, tenant ID, and subscription ID as environment variables—not secrets—under GitHub environment `marketplace-production` using the exact names above.
5. After the workflows are merged, create a temporary bootstrap tag matching the environment's `v*` deployment policy and manually run `Identify Marketplace publishing principal` at that tag. A new managed identity does not initially have an Azure DevOps profile, so the workflow runs `vsce verify-pat --azure-credential stefanpieter` and extracts the Marketplace user ID from the expected access-denied response without exposing a token or raw authentication output. Add that user ID as a **Contributor** to Marketplace publisher `stefanpieter`, rerun the workflow to verify access, and then delete the temporary tag.
6. Keep GitHub environment deployment protection restricted to eligible release tags. The `marketplace-production` environment uses a custom deployment policy that accepts only `v*` tags. It intentionally has no additional required-reviewer rule so publication can complete automatically after an authorised stable GitHub Release; repository release permissions, exact tag/version validation, canonical-main ancestry, and the tag policy remain the human and technical gates. The workflows request `id-token: write` only so GitHub can mint a short-lived, environment-bound OIDC token.

The managed identity must be dedicated to publication and granted only the Azure access needed to establish its login context. Never add a PAT, client secret, session ID, federated token, or diagnostic authentication payload to GitHub variables, repository files, Keychain account records, logs, or release artefacts.

## Rollback

Retain the previous known-good VSIX and release notes. If a candidate regresses ACP/session integrity, stop distribution, document the affected versions, and direct users to the previous verified artefact. Do not claim preserved sessions unless rollback has been tested for that state schema.

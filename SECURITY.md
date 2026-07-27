# Security policy

## Supported code

Security fixes are developed against the current maintained branch. The original Marketplace release and older development VSIX files may not contain current fixes.

| Line | Status |
|---|---|
| Maintained default branch | Supported |
| Latest maintained GitHub release, once published | Supported |
| Original `joaompfp` Marketplace release | Upstream-owned; upgrade path pending |
| Older local VSIX builds | Unsupported |

## Reporting a vulnerability

Use this repository's private vulnerability reporting / Security Advisories interface. Include:

- affected version or commit
- impact and threat model
- reproduction steps or a minimal proof of concept
- whether credentials or user data may have been exposed
- any known mitigation

Do not include secrets, production credentials, private source, or personal Hermes state databases.

If private vulnerability reporting is temporarily unavailable, open a public issue containing no vulnerability detail and ask the maintainer to establish a private channel. Do not disclose the vulnerability itself in that issue.

The interim maintainer aims to acknowledge reports within three business days. Resolution timing depends on severity and coordination needs.

## Security boundaries

The extension executes a user-selected Hermes binary and renders data received over ACP. Security-sensitive areas include:

- executable-path trust and launch arguments
- ACP permission responses
- webview HTML and command-message handling
- file locations returned by tools
- process/session generation isolation
- persisted workspace and global state
- release artefacts and Marketplace credentials

A report about Hermes Agent itself should be sent to the Hermes Agent maintainers unless the extension creates or amplifies the vulnerability.

## Disclosure

Coordinated disclosure is preferred. Security advisories should credit reporters who want attribution and should not publish exploit detail before users have a reasonable upgrade path.

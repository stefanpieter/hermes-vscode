# Governance

## Project status

This project is an actively maintained fork of `joaompfp/hermes-vscode`. The project is seeking a cooperative co-maintenance or ownership handover so existing Marketplace users are not stranded. Until that is resolved, `stefanpieter/hermes-vscode` is the interim maintenance repository and must describe itself as a maintained fork rather than an upstream or official release.

## Principles

1. Preserve project history and original attribution.
2. Prefer compatibility, migration, and collaboration over ecosystem fragmentation.
3. Require evidence for changes involving ACP lifecycle, concurrency, permissions, or persistence.
4. Keep releases reproducible and reviewable.
5. Never make one personal credential or account the sole long-term release dependency.

## Roles

### Maintainer

Maintainers triage issues, review changes, manage releases, handle security reports, and appoint additional maintainers. Maintainers may not use another publisher's credentials or represent the project as officially endorsed without authorisation.

### Contributor

Contributors may propose changes through pull requests. Contributions require tests and documentation appropriate to their risk.

### Original author

Joao Peixoto remains the original author and copyright holder. Original authorship does not imply responsibility for maintained-fork releases. If Joao accepts a handover or co-maintenance arrangement, this document will be updated to reflect the agreed roles.

## Decisions

Routine decisions are made through reviewed pull requests. The following require a recorded decision in a pull request or issue:

- Marketplace publisher or extension identity changes
- Repository or organisation transfer
- Breaking changes to settings, commands, views, or stored session data
- Changes to the licence
- Security-policy or release-signing changes

For security-sensitive changes, public detail may be deferred until a fix is available.

## Change requirements

- At least one maintainer approval
- Passing required CI checks
- Regression evidence for bug fixes
- Migration notes for persisted-state or extension-identity changes
- Changelog entry for user-visible changes
- Independent review for releases and high-risk lifecycle/security changes

Maintainers must not approve their own high-risk release without an independent reviewer.

## Succession and organisational ownership

The preferred long-term home is an organisation willing to provide at least two maintainers and organisation-owned release credentials. A transfer must preserve the MIT history and clearly communicate any Marketplace migration.

If the interim maintainer becomes unavailable, a contributor with sustained reviewed contributions may request maintainership in a public issue. Existing maintainers should respond within 30 days or document why additional evidence is needed.

## Relationship with upstream

The original repository remains an upstream source. Useful upstream changes should be reviewed and incorporated. If upstream maintenance resumes, collaboration or reunification is preferred where it does not regress compatibility or strand successor users.

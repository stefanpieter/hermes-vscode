import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { validateMarketplaceRelease } from './validate-marketplace-release.mjs';

const validPackage = {
  name: 'hermes-ai-agent',
  displayName: 'Hermes AI Agent (Maintained)',
  version: '3.5.3',
  publisher: 'stefanpieter',
  repository: {
    type: 'git',
    url: 'https://github.com/stefanpieter/hermes-vscode',
  },
  homepage: 'https://github.com/stefanpieter/hermes-vscode',
  bugs: { url: 'https://github.com/stefanpieter/hermes-vscode/issues' },
  qna: 'https://github.com/stefanpieter/hermes-vscode/issues',
  license: 'MIT',
  author: { name: 'Joao Peixoto', url: 'https://github.com/joaompfp' },
};

const validEvent = {
  action: 'published',
  release: {
    draft: false,
    prerelease: false,
    tag_name: 'v3.5.3',
  },
};

test('accepts an exact stable release and controlled successor identity', () => {
  assert.deepEqual(validateMarketplaceRelease(validEvent, validPackage), {
    extensionId: 'stefanpieter.hermes-ai-agent',
    tag: 'v3.5.3',
    version: '3.5.3',
    vsixName: 'hermes-ai-agent-3.5.3.vsix',
  });
});

test('repository package declares the controlled successor Marketplace identity', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.publisher, validPackage.publisher);
  assert.equal(pkg.name, validPackage.name);
  assert.equal(pkg.displayName, validPackage.displayName);
  assert.equal(pkg.repository.url, validPackage.repository.url);
  assert.equal(
    validateMarketplaceRelease(
      { ...validEvent, release: { ...validEvent.release, tag_name: `v${pkg.version}` } },
      pkg,
    ).version,
    pkg.version,
  );
});

test('rejects release tags that do not exactly match package.json', () => {
  assert.throws(
    () => validateMarketplaceRelease({ ...validEvent, release: { ...validEvent.release, tag_name: 'v3.5.4' } }, validPackage),
    /must exactly match/,
  );
});

test('rejects drafts, prereleases, and non-published actions', () => {
  assert.throws(() => validateMarketplaceRelease({ ...validEvent, action: 'edited' }, validPackage), /published/);
  assert.throws(
    () => validateMarketplaceRelease({ ...validEvent, release: { ...validEvent.release, draft: true } }, validPackage),
    /draft/i,
  );
  assert.throws(
    () => validateMarketplaceRelease({ ...validEvent, release: { ...validEvent.release, prerelease: true } }, validPackage),
    /prerelease/,
  );
});

test('rejects an unowned publisher or unexpected extension/repository identity', () => {
  for (const candidate of [
    { ...validPackage, publisher: 'joaompfp' },
    { ...validPackage, name: 'hermes-agent' },
    { ...validPackage, repository: { ...validPackage.repository, url: 'https://github.com/joaompfp/hermes-vscode' } },
    { ...validPackage, homepage: 'https://example.test' },
    { ...validPackage, bugs: { url: 'https://example.test' } },
    { ...validPackage, qna: 'https://example.test' },
  ]) {
    assert.throws(() => validateMarketplaceRelease(validEvent, candidate), /identity|repository|support links/);
  }
});

test('rejects invalid or prerelease package versions', () => {
  for (const version of ['3.5', '3.5.3-beta.1', '03.5.3', '3.5.3;echo nope']) {
    assert.throws(() => validateMarketplaceRelease(validEvent, { ...validPackage, version }), /stable semantic version/);
  }
});

test('rejects removal of the original MIT licence or author attribution', () => {
  for (const candidate of [
    { ...validPackage, license: 'UNLICENSED' },
    { ...validPackage, author: { ...validPackage.author, name: 'Stefan van Biljon' } },
    { ...validPackage, author: { ...validPackage.author, url: 'https://example.test' } },
  ]) {
    assert.throws(() => validateMarketplaceRelease(validEvent, candidate), /MIT licence and author attribution/);
  }
});

test('workflow is release-only, OIDC-scoped, exact-tag, environment-scoped, and duplicate-safe', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/publish-marketplace.yml', import.meta.url), 'utf8');
  assert.match(workflow, /release:\s*\n\s*types:\s*\[published\]/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /environment: marketplace-production/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.release\.tag_name \}\}/);
  assert.match(workflow, /node scripts\/validate-marketplace-release\.mjs/);
  assert.match(workflow, /Azure\/login@[0-9a-f]{40}/);
  assert.match(workflow, /client-id: \$\{\{ vars\.AZURE_CLIENT_ID \}\}/);
  assert.match(workflow, /tenant-id: \$\{\{ vars\.AZURE_TENANT_ID \}\}/);
  assert.match(workflow, /subscription-id: \$\{\{ vars\.AZURE_SUBSCRIPTION_ID \}\}/);
  assert.match(workflow, /vsce publish .*--azure-credential.*--skip-duplicate/);
  assert.doesNotMatch(workflow, /VSCE_PAT|secrets\./);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
});

test('identity bootstrap is manual, OIDC-scoped, environment-bound, and secretless', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/identify-marketplace-principal.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write/);
  assert.match(workflow, /environment: marketplace-production/);
  assert.match(workflow, /Azure\/login@[0-9a-f]{40}/);
  assert.match(workflow, /client-id: \$\{\{ vars\.AZURE_CLIENT_ID \}\}/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /vsce verify-pat --azure-credential stefanpieter/);
  assert.match(workflow, /Access Denied:\\s\*/);
  const validationIndex = workflow.indexOf('if [ -z "$resource_id" ]; then');
  const noticeIndex = workflow.indexOf('::notice title=Marketplace publishing principal::$resource_id');
  assert.notEqual(validationIndex, -1);
  assert.ok(noticeIndex > validationIndex);
  assert.match(workflow.slice(validationIndex, noticeIndex), /exit 1\r?\n\s+fi/);
  assert.doesNotMatch(workflow, /app\.vssps\.visualstudio\.com\/_apis\/profile\/profiles\/me/);
  assert.doesNotMatch(workflow, /VSCE_PAT|secrets\.|pull_request:|push:|release:/);
});

test('release guidance uses the exact GitHub environment OIDC subject', () => {
  const releasing = fs.readFileSync(new URL('../docs/releasing.md', import.meta.url), 'utf8');
  const transitionPlan = fs.readFileSync(
    new URL('../docs/plans/2026-07-24-maintained-successor-transition.md', import.meta.url),
    'utf8',
  );
  assert.match(releasing, /repo:stefanpieter\/hermes-vscode:environment:marketplace-production/);
  assert.match(releasing, /Other issuer/);
  assert.match(releasing, /accepts only `v\*` tags/);
  assert.match(releasing, /complete automatically after an authorised stable GitHub Release/);
  assert.doesNotMatch(releasing, /repo:[^`\s]+@\d+\//);
  assert.match(transitionPlan, /maintained successor candidate is version `3\.6\.0`/);
  assert.match(transitionPlan, /current `package\.json` uses the separate successor Marketplace identity/);
  assert.doesNotMatch(transitionPlan, /current `package\.json` still uses the original Marketplace identity/);
});

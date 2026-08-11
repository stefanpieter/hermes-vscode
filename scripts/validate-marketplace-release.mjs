import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  publisher: 'stefanpieter',
  name: 'hermes-ai-agent',
  displayName: 'Hermes AI Agent (Maintained)',
  repository: 'https://github.com/stefanpieter/hermes-vscode',
  homepage: 'https://github.com/stefanpieter/hermes-vscode',
  bugs: 'https://github.com/stefanpieter/hermes-vscode/issues',
  qna: 'https://github.com/stefanpieter/hermes-vscode/issues',
  license: 'MIT',
  originalAuthorName: 'Joao Peixoto',
  originalAuthorUrl: 'https://github.com/joaompfp',
});

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function repositoryUrl(pkg) {
  return typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
}

export function validateMarketplaceRelease(event, pkg) {
  if (!event || event.action !== 'published' || !event.release) {
    throw new Error('Marketplace publication requires a published GitHub release event.');
  }
  if (event.release.draft) {
    throw new Error('Draft releases cannot be published to the Marketplace.');
  }
  if (event.release.prerelease) {
    throw new Error('GitHub prereleases are not eligible for stable Marketplace publication.');
  }
  if (!STABLE_SEMVER.test(pkg?.version ?? '')) {
    throw new Error('package.json version must be a stable semantic version (x.y.z).');
  }
  if (
    pkg.publisher !== EXPECTED.publisher ||
    pkg.name !== EXPECTED.name ||
    pkg.displayName !== EXPECTED.displayName
  ) {
    throw new Error('package.json extension identity does not match the controlled successor identity.');
  }
  if (repositoryUrl(pkg) !== EXPECTED.repository) {
    throw new Error('package.json repository does not match the canonical maintained repository.');
  }
  if (pkg.homepage !== EXPECTED.homepage || pkg.bugs?.url !== EXPECTED.bugs || pkg.qna !== EXPECTED.qna) {
    throw new Error('package.json support links do not match the canonical maintained repository.');
  }
  if (
    pkg.license !== EXPECTED.license
    || pkg.author?.name !== EXPECTED.originalAuthorName
    || pkg.author?.url !== EXPECTED.originalAuthorUrl
  ) {
    throw new Error('package.json must preserve the original MIT licence and author attribution.');
  }

  const expectedTag = `v${pkg.version}`;
  if (event.release.tag_name !== expectedTag) {
    throw new Error(`Release tag ${JSON.stringify(event.release.tag_name)} must exactly match ${expectedTag}.`);
  }

  return {
    extensionId: `${pkg.publisher}.${pkg.name}`,
    tag: expectedTag,
    version: pkg.version,
    vsixName: `${pkg.name}-${pkg.version}.vsix`,
  };
}

function appendOutputs(metadata) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  fs.appendFileSync(
    outputPath,
    [
      `extension_id=${metadata.extensionId}`,
      `tag=${metadata.tag}`,
      `version=${metadata.version}`,
      `vsix_name=${metadata.vsixName}`,
      '',
    ].join('\n'),
    { encoding: 'utf8' },
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const eventPath = process.argv[2];
  const packagePath = process.argv[3] ?? 'package.json';
  if (!eventPath) {
    throw new Error('Usage: node scripts/validate-marketplace-release.mjs <event.json> [package.json]');
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const metadata = validateMarketplaceRelease(event, pkg);
  appendOutputs(metadata);
  process.stdout.write(`Validated ${metadata.extensionId} ${metadata.version} from ${metadata.tag}.\n`);
}

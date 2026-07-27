import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runLockfileAudit } from './audit-all-locked.mjs';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const wrapperPath = resolve(scriptsRoot, 'audit-all-locked.mjs');

const fakeNpmSource = `
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const requiredArgs = [
  'audit',
  '--audit-level=info',
  '--package-lock-only',
  '--include=prod',
  '--include=dev',
  '--include=optional',
  '--include=peer',
  '--offline=false',
  '--dry-run=false',
  '--registry=https://registry.npmjs.org/',
  '--json',
];
const forbiddenEnvironmentKeys = new Set([
  'node_env',
  'npm_config_audit',
  'npm_config_audit_level',
  'npm_config_dry_run',
  'npm_config_globalconfig',
  'npm_config_include',
  'npm_config_offline',
  'npm_config_omit',
  'npm_config_only',
  'npm_config_package_lock_only',
  'npm_config_prefer_offline',
  'npm_config_production',
  'npm_config_registry',
  'npm_config_userconfig',
]);

if (!requiredArgs.every((argument) => args.includes(argument))) {
  console.error('missing required audit arguments');
  process.exit(7);
}
for (const key of Object.keys(process.env)) {
  if (forbiddenEnvironmentKeys.has(key.toLowerCase())) {
    console.error('unsafe audit environment: ' + key);
    process.exit(8);
  }
}

const userConfig = args.find((argument) => argument.startsWith('--userconfig='))?.slice(13);
const globalConfig = args.find((argument) => argument.startsWith('--globalconfig='))?.slice(15);
if (!userConfig || !globalConfig || userConfig === globalConfig) {
  console.error('audit configs are missing or not isolated');
  process.exit(9);
}
readFileSync(userConfig, 'utf8');
readFileSync(globalConfig, 'utf8');

const mode = process.env.FAKE_AUDIT_MODE ?? 'success';
if (mode === 'signal') {
  process.kill(process.pid, 'SIGTERM');
}
if (mode === 'malformed') {
  console.log('not json');
  process.exit(0);
}

const expectedDependencies = Number(process.env.EXPECTED_DEPENDENCIES ?? '1');
const reportedDependencies = mode === 'incomplete' ? expectedDependencies - 1 : expectedDependencies;
const vulnerabilityMetadata = {
  info: 0,
  low: 0,
  moderate: 0,
  high: 0,
  critical: 0,
  total: 0,
};
let vulnerabilities = {};

if (mode === 'vulnerability') {
  vulnerabilities = { fixture: { name: 'fixture', severity: 'low' } };
  vulnerabilityMetadata.low = 1;
  vulnerabilityMetadata.total = 1;
} else if (mode === 'missing-vulnerability-total') {
  delete vulnerabilityMetadata.total;
} else if (mode === 'negative-vulnerability-total') {
  vulnerabilityMetadata.total = -1;
} else if (mode === 'fractional-vulnerability-total') {
  vulnerabilityMetadata.total = 0.5;
} else if (mode === 'contradictory-vulnerabilities') {
  vulnerabilities = { fixture: { name: 'fixture', severity: 'low' } };
} else if (mode === 'contradictory-severities') {
  vulnerabilityMetadata.low = 1;
}

console.log(JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: {
    vulnerabilities: vulnerabilityMetadata,
    dependencies: {
      prod: reportedDependencies,
      dev: reportedDependencies,
      optional: 0,
      peer: 0,
      peerOptional: 0,
      total: reportedDependencies,
    },
  },
}));
if (mode === 'nonzero') process.exitCode = 3;
`;

function makeFixture({ lockfile } = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'hermes-audit-test-'));
  const auditTempRoot = join(fixtureRoot, 'tmp');
  mkdirSync(auditTempRoot);
  writeFileSync(
    join(fixtureRoot, 'package.json'),
    JSON.stringify({ name: 'audit-test', version: '1.0.0', private: true }) + '\n',
  );
  const fixtureLockfile = lockfile ?? {
    name: 'audit-test',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'audit-test', version: '1.0.0' },
      'node_modules/fixture': { version: '1.0.0' },
      'node_modules/link': { resolved: 'packages/link', link: true },
    },
  };
  writeFileSync(
    join(fixtureRoot, 'package-lock.json'),
    JSON.stringify(fixtureLockfile) + '\n',
  );
  const fakeNpmPath = join(fixtureRoot, 'fake-npm.mjs');
  writeFileSync(fakeNpmPath, fakeNpmSource);
  const hostileUserConfigPath = join(fixtureRoot, 'hostile-user.npmrc');
  const hostileGlobalConfigPath = join(fixtureRoot, 'hostile-global.npmrc');
  writeFileSync(hostileUserConfigPath, 'offline=true\nomit=dev optional peer\n');
  writeFileSync(hostileGlobalConfigPath, 'registry=https://invalid.example/\naudit=false\n');
  return {
    fixtureRoot,
    auditTempRoot,
    fakeNpmPath,
    hostileUserConfigPath,
    hostileGlobalConfigPath,
  };
}

function runWrapper(mode, extraEnvironment = {}, fixtureOptions = {}) {
  const fixture = makeFixture(fixtureOptions);
  try {
    const result = spawnSync(process.execPath, [wrapperPath], {
      cwd: fixture.fixtureRoot,
      env: {
        ...process.env,
        TMPDIR: fixture.auditTempRoot,
        npm_execpath: fixture.fakeNpmPath,
        NPM_CONFIG_USERCONFIG: fixture.hostileUserConfigPath,
        NPM_CONFIG_GLOBALCONFIG: fixture.hostileGlobalConfigPath,
        FAKE_AUDIT_MODE: mode,
        EXPECTED_DEPENDENCIES: '1',
        ...extraEnvironment,
      },
      encoding: 'utf8',
    });
    const leftovers = readdirSync(fixture.auditTempRoot).filter((name) =>
      name.startsWith('hermes-lock-audit-'),
    );
    return { ...result, leftovers };
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
}

test('isolates audit policy from hostile npm configuration and cleans temporary state', () => {
  const result = runWrapper('success', {
    NODE_ENV: 'production',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_AUDIT_LEVEL: 'none',
    NPM_CONFIG_DRY_RUN: 'true',
    NPM_CONFIG_INCLUDE: 'prod',
    NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_OMIT: 'dev optional peer',
    NPM_CONFIG_ONLY: 'prod',
    NPM_CONFIG_PACKAGE_LOCK_ONLY: 'false',
    NPM_CONFIG_PREFER_OFFLINE: 'true',
    NPM_CONFIG_PRODUCTION: 'true',
    NPM_CONFIG_REGISTRY: 'https://invalid.example/',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Audited all 1 locked dependencies; found 0 vulnerabilities\./);
  assert.deepEqual(result.leftovers, []);
});

test('fails when npm reports a vulnerability despite exiting zero', () => {
  const result = runWrapper('vulnerability');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /found 1 vulnerabilities/);
  assert.deepEqual(result.leftovers, []);
});

for (const mode of [
  'missing-vulnerability-total',
  'negative-vulnerability-total',
  'fractional-vulnerability-total',
  'contradictory-vulnerabilities',
  'contradictory-severities',
]) {
  test(`fails on invalid or contradictory vulnerability metadata: ${mode}`, () => {
    const result = runWrapper(mode);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /invalid vulnerability metadata/i);
    assert.deepEqual(result.leftovers, []);
  });
}

test('fails when npm reports fewer dependencies than the lockfile', () => {
  const result = runWrapper('incomplete');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Lockfile audit was incomplete/);
  assert.deepEqual(result.leftovers, []);
});

test('fails on malformed npm audit output', () => {
  const result = runWrapper('malformed');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Lockfile audit failed/);
  assert.deepEqual(result.leftovers, []);
});

test('propagates a nonzero npm audit exit when no vulnerability count explains it', () => {
  const result = runWrapper('nonzero');
  assert.equal(result.status, 3);
  assert.deepEqual(result.leftovers, []);
});

test('fails when npm audit terminates by signal', () => {
  const result = runWrapper('signal');
  assert.equal(result.status, 1);
  assert.deepEqual(result.leftovers, []);
});

test('fails and cleans up when the lockfile packages map is missing', () => {
  const result = runWrapper('success', {}, {
    lockfile: {
      name: 'audit-test',
      version: '1.0.0',
      lockfileVersion: 3,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Lockfile audit failed/);
  assert.deepEqual(result.leftovers, []);
});

test('fails and cleans up when the npm child process cannot be spawned', () => {
  const fixture = makeFixture();
  let stdout = '';
  let stderr = '';
  try {
    const status = runLockfileAudit({
      projectRoot: fixture.fixtureRoot,
      temporaryRoot: fixture.auditTempRoot,
      environment: { npm_execpath: fixture.fakeNpmPath },
      executablePath: process.execPath,
      spawn: () => ({
        error: new Error('injected spawn failure'),
        stdout: '',
        stderr: '',
        status: null,
        signal: null,
      }),
      stdout: { write: (chunk) => { stdout += String(chunk); } },
      stderr: { write: (chunk) => { stderr += String(chunk); } },
    });
    assert.equal(status, 1, stdout + stderr);
    assert.match(stderr, /injected spawn failure/);
    assert.deepEqual(readdirSync(fixture.auditTempRoot), []);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('fails before creating temporary state when npm_execpath is unavailable', () => {
  const fixture = makeFixture();
  try {
    const environment = { ...process.env, TMPDIR: fixture.auditTempRoot };
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === 'npm_execpath') delete environment[key];
    }
    const result = spawnSync(process.execPath, [wrapperPath], {
      cwd: fixture.fixtureRoot,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run this audit through `npm run audit`/);
    assert.deepEqual(readdirSync(fixture.auditTempRoot), []);
  } finally {
    rmSync(fixture.fixtureRoot, { recursive: true, force: true });
  }
});

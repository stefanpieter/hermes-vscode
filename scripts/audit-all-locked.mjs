import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const omittedConfigKeys = new Set([
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
const vulnerabilitySeverities = ['info', 'low', 'moderate', 'high', 'critical'];

function writeLine(stream, message) {
  stream.write(`${message}\n`);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function environmentValue(environment, wantedKey) {
  const entry = Object.entries(environment).find(
    ([key]) => key.toLowerCase() === wantedKey.toLowerCase(),
  );
  return entry?.[1];
}

function hasValidVulnerabilityMetadata(report) {
  const metadata = report?.metadata?.vulnerabilities;
  const vulnerabilities = report?.vulnerabilities;
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    !vulnerabilities ||
    typeof vulnerabilities !== 'object' ||
    Array.isArray(vulnerabilities)
  ) {
    return false;
  }

  const counts = [...vulnerabilitySeverities, 'total'].map((key) => metadata[key]);
  if (!counts.every(isNonNegativeInteger)) {
    return false;
  }

  const severityTotal = vulnerabilitySeverities.reduce(
    (total, severity) => total + metadata[severity],
    0,
  );
  return (
    severityTotal === metadata.total &&
    Object.keys(vulnerabilities).length === metadata.total
  );
}

export function runLockfileAudit({
  projectRoot = process.cwd(),
  temporaryRoot = tmpdir(),
  environment = process.env,
  executablePath = process.execPath,
  spawn = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const npmExecPath = environmentValue(environment, 'npm_execpath');
  if (!npmExecPath) {
    writeLine(stderr, 'Run this audit through `npm run audit` so the active npm CLI is known.');
    return 1;
  }

  const packagePath = join(projectRoot, 'package.json');
  const lockPath = join(projectRoot, 'package-lock.json');
  let auditRoot;

  try {
    auditRoot = mkdtempSync(join(temporaryRoot, 'hermes-lock-audit-'));
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
      throw new Error('package-lock.json must use a lockfile with a packages map');
    }

    const lockedPackageCount = Object.entries(lock.packages).filter(
      ([packagePath, metadata]) => packagePath !== '' && !metadata?.link,
    ).length;

    copyFileSync(packagePath, join(auditRoot, basename(packagePath)));
    copyFileSync(lockPath, join(auditRoot, basename(lockPath)));

    const isolatedUserConfigPath = join(auditRoot, 'user.npmrc');
    const isolatedGlobalConfigPath = join(auditRoot, 'global.npmrc');
    writeFileSync(isolatedUserConfigPath, '# Isolated user configuration for the lockfile audit.\n');
    writeFileSync(isolatedGlobalConfigPath, '# Isolated global configuration for the lockfile audit.\n');

    const auditEnvironment = { ...environment };
    for (const key of Object.keys(auditEnvironment)) {
      if (omittedConfigKeys.has(key.toLowerCase())) {
        delete auditEnvironment[key];
      }
    }

    const audit = spawn(
      executablePath,
      [
        npmExecPath,
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
        `--userconfig=${isolatedUserConfigPath}`,
        `--globalconfig=${isolatedGlobalConfigPath}`,
      ],
      {
        cwd: auditRoot,
        env: auditEnvironment,
        encoding: 'utf8',
      },
    );

    if (audit.error) {
      throw audit.error;
    }
    if (audit.stderr) {
      stderr.write(audit.stderr);
    }
    if (audit.stdout) {
      stdout.write(audit.stdout);
    }

    const report = JSON.parse(audit.stdout);
    const reportedPackageCount = report?.metadata?.dependencies?.total;
    if (!isNonNegativeInteger(reportedPackageCount) || reportedPackageCount !== lockedPackageCount) {
      writeLine(
        stderr,
        `Lockfile audit was incomplete: npm reported ${reportedPackageCount ?? 'unknown'} dependencies, ` +
          `but package-lock.json contains ${lockedPackageCount}.`,
      );
      return 1;
    }

    if (!hasValidVulnerabilityMetadata(report)) {
      writeLine(stderr, 'Lockfile audit reported invalid vulnerability metadata.');
      return 1;
    }

    const vulnerabilityCount = report.metadata.vulnerabilities.total;
    writeLine(
      stdout,
      `Audited all ${lockedPackageCount} locked dependencies; found ${vulnerabilityCount} vulnerabilities.`,
    );
    if (vulnerabilityCount > 0) {
      return 1;
    }
    return audit.status ?? 1;
  } catch (error) {
    writeLine(
      stderr,
      `Lockfile audit failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  } finally {
    if (auditRoot) {
      rmSync(auditRoot, { recursive: true, force: true });
    }
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  process.exitCode = runLockfileAudit();
}

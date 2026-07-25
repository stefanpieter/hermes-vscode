import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRoleRunActivities } from '../roleRunMonitor';

async function writeManifest(root: string, runId: string, data: Record<string, unknown>): Promise<void> {
  const dir = path.join(root, 'runs', runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    schema_version: '1.0.0',
    run_id: runId,
    execution_mode: 'standalone_fresh_session',
    ...data,
  }));
}

test('loads workspace-scoped standalone role names, statuses, and explicit context', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hermes-role-runs-'));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  await writeManifest(root, 'run-developer', {
    role_id: 'developer', role: 'Developer', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T21:15:15.298Z', context_used: 24_000, context_size: 128_000,
  });
  await writeManifest(root, 'run-validator', {
    role_id: 'technical-validator', role: 'Technical Validator', status: 'succeeded', repo_root: workspace,
    started_at: '2026-07-25T21:20:15.298Z', completed_at: '2026-07-25T21:30:15.298Z',
  });
  await writeManifest(root, 'other-repository', {
    role_id: 'planner', role: 'Planner', status: 'running', repo_root: path.join(root, 'other'),
    started_at: '2026-07-25T21:25:15.298Z',
  });

  const activities = await loadRoleRunActivities(root, {
    workspaceRoot: workspace,
    sessionCreatedAt: Date.parse('2026-07-25T21:00:00Z'),
  });

  assert.deepEqual(activities, [
    { id: 'role-run:run-developer', name: 'Developer', status: 'running', contextUsed: 24_000, contextSize: 128_000 },
    { id: 'role-run:run-validator', name: 'Technical Validator', status: 'completed' },
  ]);
});

test('excludes stale, malformed, and unsupported role manifests without guessing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hermes-role-runs-'));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  await writeManifest(root, 'before-session', {
    role_id: 'developer', role: 'Developer', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T20:00:00Z',
  });
  await writeManifest(root, 'invented-status', {
    role_id: 'planner', role: 'Planner', status: 'vibing', repo_root: workspace,
    started_at: '2026-07-25T22:00:00Z',
  });
  await writeManifest(root, 'unsupported-schema', {
    schema_version: '2.0.0', role_id: 'planner', role: 'Planner', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T22:00:00Z',
  });
  await writeManifest(root, 'unsafe-role-id', {
    role_id: '../planner', role: 'Planner', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T22:00:00Z',
  });
  await writeManifest(root, 'missing-run-id', {
    run_id: undefined,
    role_id: 'planner', role: 'Missing Run Identity', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T22:00:00Z',
  });
  await writeManifest(root, 'mismatched-run-id', {
    run_id: 'different-directory',
    role_id: 'planner', role: 'Mismatched Run Identity', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T22:00:00Z',
  });
  await writeManifest(root, 'whitespace-run-id', {
    run_id: 'whitespace-run-id ',
    role_id: 'planner', role: 'Noncanonical Run Identity', status: 'running', repo_root: workspace,
    started_at: '2026-07-25T22:00:00Z',
  });
  await mkdir(path.join(root, 'runs', 'oversized'), { recursive: true });
  await writeFile(path.join(root, 'runs', 'oversized', 'manifest.json'), ' '.repeat(65 * 1024));
  await mkdir(path.join(root, 'runs', 'broken-json'), { recursive: true });
  await writeFile(path.join(root, 'runs', 'broken-json', 'manifest.json'), '{');

  const activities = await loadRoleRunActivities(root, {
    workspaceRoot: workspace,
    sessionCreatedAt: Date.parse('2026-07-25T21:00:00Z'),
  });
  assert.deepEqual(activities, []);
});

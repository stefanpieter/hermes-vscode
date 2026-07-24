import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const manifestPath = resolve(__dirname, '../../package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  capabilities?: {
    untrustedWorkspaces?: {
      supported?: boolean | 'limited';
      description?: string;
    };
  };
};

test('disables Hermes agent activation in untrusted workspaces', () => {
  assert.equal(manifest.capabilities?.untrustedWorkspaces?.supported, false);
  assert.match(
    manifest.capabilities?.untrustedWorkspaces?.description ?? '',
    /launches.*agent.*workspace/i,
  );
});

import * as assert from 'assert';
import { buildHermesAcpArgs } from '../src/acpLaunchArgs';

assert.deepStrictEqual(buildHermesAcpArgs(''), ['acp']);
assert.deepStrictEqual(buildHermesAcpArgs(undefined), ['acp']);
assert.deepStrictEqual(buildHermesAcpArgs('noblepro'), ['--profile', 'noblepro', 'acp']);
assert.deepStrictEqual(buildHermesAcpArgs('  vscode-fast  '), ['--profile', 'vscode-fast', 'acp']);

console.log('acpLaunchArgs tests passed');

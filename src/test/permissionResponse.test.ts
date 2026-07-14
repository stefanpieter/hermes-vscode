import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedPermissionResponse } from '../permissionResponse';

test('wraps the selected ACP permission outcome inside the response outcome field', () => {
  assert.deepEqual(selectedPermissionResponse('allow_once'), {
    outcome: {
      outcome: 'selected',
      optionId: 'allow_once',
    },
  });
});

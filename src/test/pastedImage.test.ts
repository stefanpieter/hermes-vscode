import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePastedImageExtension } from '../pastedImage';

test('normalizes supported pasted-image extensions', () => {
  assert.equal(normalizePastedImageExtension('png'), 'png');
  assert.equal(normalizePastedImageExtension('JPEG'), 'jpg');
  assert.equal(normalizePastedImageExtension(' webp '), 'webp');
});

test('rejects pasted-image extensions containing path syntax or unsupported formats', () => {
  assert.equal(normalizePastedImageExtension('png/../../outside'), undefined);
  assert.equal(normalizePastedImageExtension('png\\..\\..\\outside'), undefined);
  assert.equal(normalizePastedImageExtension('/tmp/outside'), undefined);
  assert.equal(normalizePastedImageExtension('svg+xml'), undefined);
  assert.equal(normalizePastedImageExtension(''), undefined);
});

test('rejects non-string pasted-image extension values received at runtime', () => {
  assert.equal(normalizePastedImageExtension(42), undefined);
  assert.equal(normalizePastedImageExtension({ value: 'png' }), undefined);
});

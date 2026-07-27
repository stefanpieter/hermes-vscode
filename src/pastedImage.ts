const SUPPORTED_PASTED_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'gif',
  'webp',
]);

export function normalizePastedImageExtension(extension: unknown): string | undefined {
  if (typeof extension !== 'string') return undefined;

  const normalized = extension.trim().toLowerCase();
  if (!normalized) return undefined;

  const canonical = normalized === 'jpeg' ? 'jpg' : normalized;
  return SUPPORTED_PASTED_IMAGE_EXTENSIONS.has(canonical) ? canonical : undefined;
}

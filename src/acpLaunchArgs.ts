export function normalizeHermesProfile(profile: string | undefined | null): string {
  return (profile ?? '').trim();
}

export function buildHermesAcpArgs(profile?: string | null): string[] {
  const normalized = normalizeHermesProfile(profile);
  if (!normalized) {
    return ['acp'];
  }
  return ['--profile', normalized, 'acp'];
}

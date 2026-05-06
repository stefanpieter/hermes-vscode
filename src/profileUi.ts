export interface ProfileMenuItem {
  id: string;
  label: string;
  active: boolean;
}

export function normalizeProfileId(profile: string | undefined | null): string {
  return (profile ?? '').trim();
}

export function profileDisplayName(
  profile: string | undefined | null,
  defaultProfileName?: string | undefined | null,
): string {
  const normalized = normalizeProfileId(profile);
  return normalized || normalizeProfileId(defaultProfileName) || 'Default';
}

export function parseHermesProfileList(output: string): string[] {
  const profiles = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const withoutMarker = line.replace(/^[\s*›>•◆◇-]+/, '').trim();
    const match = withoutMarker.match(/^([A-Za-z0-9_.-]+)\b/);
    if (match && !['Profile', 'Model', 'Gateway', 'Alias'].includes(match[1])) profiles.add(match[1]);
  }
  return [...profiles].sort((a, b) => a.localeCompare(b));
}

export function buildProfileMenuItems(
  profiles: string[],
  currentProfile: string | undefined | null,
  defaultProfileName?: string | undefined | null,
): ProfileMenuItem[] {
  const current = normalizeProfileId(currentProfile);
  const defaultLabel = profileDisplayName('', defaultProfileName);
  const uniqueProfiles = Array.from(new Set(profiles.map(normalizeProfileId).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  return [
    { id: '', label: defaultLabel, active: current === '' },
    ...uniqueProfiles.map(id => ({ id, label: id, active: id === current })),
  ];
}

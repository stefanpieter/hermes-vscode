export interface ProfileMenuItem {
  id: string;
  label: string;
  active: boolean;
}

export function normalizeProfileId(profile: string | undefined | null): string {
  return (profile ?? '').trim();
}

export function profileDisplayName(profile: string | undefined | null): string {
  const normalized = normalizeProfileId(profile);
  return normalized || 'Default';
}

export function buildProfileMenuItems(profiles: string[], currentProfile: string | undefined | null): ProfileMenuItem[] {
  const current = normalizeProfileId(currentProfile);
  const uniqueProfiles = Array.from(new Set(profiles.map(normalizeProfileId).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  return [
    { id: '', label: 'Default', active: current === '' },
    ...uniqueProfiles.map(id => ({ id, label: id, active: id === current })),
  ];
}

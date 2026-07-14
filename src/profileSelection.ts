import { normalizeHermesProfile } from './acpLaunchArgs';

export interface ProfileSelectionDependencies {
  currentProfile(): string;
  persistProfile(profile: string): Promise<void>;
  setCurrentProfile(profile: string): void;
  setClientProfile(profile: string): void;
  isClientRunning(): boolean;
  stopClient(): void;
  resetSession(): void;
  ensureConnected(): Promise<void>;
  setDisconnected(): void;
}

export interface ProfileSelectionResult {
  changed: boolean;
  profile: string;
  restarted: boolean;
}

export async function applyProfileSelection(
  requestedProfile: string,
  dependencies: ProfileSelectionDependencies,
): Promise<ProfileSelectionResult> {
  const profile = normalizeHermesProfile(requestedProfile);
  if (profile === dependencies.currentProfile()) {
    return { changed: false, profile, restarted: false };
  }

  await dependencies.persistProfile(profile);
  dependencies.setCurrentProfile(profile);
  dependencies.setClientProfile(profile);

  if (dependencies.isClientRunning()) {
    dependencies.stopClient();
    dependencies.resetSession();
    await dependencies.ensureConnected();
    return { changed: true, profile, restarted: true };
  }

  dependencies.setDisconnected();
  return { changed: true, profile, restarted: false };
}

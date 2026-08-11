export const ORIGINAL_EXTENSION_ID = 'joaompfp.hermes-ai-agent';

export type ExtensionLookup = (extensionId: string) => unknown;

export function isOriginalExtensionInstalled(getExtension: ExtensionLookup): boolean {
  return getExtension(ORIGINAL_EXTENSION_ID) !== undefined;
}

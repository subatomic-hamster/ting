import type { Profile } from "../engine/types";
import { readDraft, saveDraft } from "./drafts";

/** Only a profile returned by the server may unlock a live account offline. */
export async function loadLiveProfile(
  persona: string,
  fetchProfile: () => Promise<Profile | null>,
): Promise<Profile | null> {
  const cached = () => readDraft<Profile>("server-profile", persona);
  if (navigator.onLine === false) {
    const profile = cached();
    if (profile) return profile;
  }
  const profile = await fetchProfile();
  if (profile) saveDraft("server-profile", persona, profile);
  return profile;
}

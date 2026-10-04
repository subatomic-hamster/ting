import { useAuth } from "../auth/auth";
const mockMode = () =>
  (typeof window === "undefined" ? true : window.TING_CONFIG?.useMocks) ??
  import.meta.env.VITE_USE_MOCKS !== "false";
function storageFor(area: string, persona: string) {
  if (typeof window === "undefined") return undefined;
  const mock = mockMode();
  const sub = useAuth.getState().claims?.sub;
  return {
    storage: mock ? localStorage : sessionStorage,
    key: `ting.draft.v2.${mock || !sub ? "sample." + persona : "member." + sub}.${area}`,
  };
}
export function readDraft<T>(area: string, persona: string): T | undefined {
  try {
    const target = storageFor(area, persona);
    const raw = target?.storage.getItem(target.key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
export function saveDraft(area: string, persona: string, data: unknown) {
  try {
    const target = storageFor(area, persona);
    if (!target) return false;
    target.storage.setItem(target.key, JSON.stringify(data));
    return true;
  } catch {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("ting:saveerror"));
    return false;
  }
}
export function clearDraft(area: string, persona: string) {
  try {
    const target = storageFor(area, persona);
    if (target) target.storage.removeItem(target.key);
  } catch {
    /* Unavailable storage is surfaced by the save path. */
  }
}

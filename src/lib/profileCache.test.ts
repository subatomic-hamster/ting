import { beforeEach, expect, test, vi } from "vitest";
import { loadLiveProfile } from "./profileCache";
import { readDraft, saveDraft } from "./drafts";
import { PERSONAS } from "../data/personas";
vi.mock("./drafts", () => ({ readDraft: vi.fn(), saveDraft: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
});
test("online requests use and cache the server profile", async () => {
  const profile = PERSONAS.dale.profile("2026-10-04");
  const fetchProfile = vi.fn().mockResolvedValue(profile);
  expect(await loadLiveProfile("dale", fetchProfile)).toBe(profile);
  expect(saveDraft).toHaveBeenCalledWith("server-profile", "dale", profile);
});
test("offline requests restore only the scoped server snapshot", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const profile = PERSONAS.dale.profile("2026-10-04");
  vi.mocked(readDraft).mockReturnValue(profile);
  const fetchProfile = vi.fn();
  expect(await loadLiveProfile("dale", fetchProfile)).toBe(profile);
  expect(fetchProfile).not.toHaveBeenCalled();
  expect(readDraft).toHaveBeenCalledWith("server-profile", "dale");
});
test("a missing offline snapshot does not invent an account", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const fetchProfile = vi.fn().mockRejectedValue(new Error("unavailable"));
  await expect(loadLiveProfile("dale", fetchProfile)).rejects.toThrow("unavailable");
});
test("an online server failure never substitutes a cached profile", async () => {
  vi.mocked(readDraft).mockReturnValue(PERSONAS.dale.profile("2026-10-04"));
  const fetchProfile = vi.fn().mockRejectedValue(new Error("unauthorized"));
  await expect(loadLiveProfile("dale", fetchProfile)).rejects.toThrow("unauthorized");
});

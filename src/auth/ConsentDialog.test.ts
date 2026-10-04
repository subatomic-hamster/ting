// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConsentDialog } from "./ConsentDialog";
import { useAuth } from "./auth";
import { api } from "../api";
import { useAppStore } from "../store";
const originalState = useAppStore.getState();
vi.mock("../api", () => ({
  api: { getConsent: vi.fn(), giveConsent: vi.fn(), deleteMyData: vi.fn() },
}));
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
let root: Root | undefined;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  useAuth.setState({ claims: undefined });
  useAppStore.setState(originalState);
  vi.resetAllMocks();
});
async function show() {
  vi.mocked(api.getConsent).mockResolvedValue({ version: "older" } as Awaited<
    ReturnType<typeof api.getConsent>
  >);
  useAuth.setState({
    claims: { sub: "test-member", groups: [], exp: 9999999999 },
  });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () => {
    root!.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ConsentDialog),
      ),
    );
    await settle();
  });
  await act(settle);
  return [
    ...document.querySelectorAll<HTMLButtonElement>("[role=dialog] button"),
  ];
}
describe("signed-in consent accessibility and failures", () => {
  it("clears cached claims and reminder state after successful server deletion", async () => {
    vi.mocked(api.deleteMyData).mockResolvedValue(undefined);
    const [, remove] = await show();
    await act(async () => {
      remove.click();
      await settle();
    });
    const state = useAppStore.getState();
    expect(state.liveClaims).toEqual([]);
    expect(state.claimChecks).toEqual([]);
    expect(state.scheduledReminders).toBeNull();
    expect(state.profile.ledger.history.every((h) => h.source === "user")).toBe(
      true,
    );
    expect(document.body.textContent).toContain(
      "Stored claims, current year-end reminders and consent were deleted.",
    );
  });
  it("initially focuses consent and contains forward/backward keyboard navigation", async () => {
    const [accept, remove] = await show();
    expect(document.activeElement).toBe(accept);
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(remove);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
    );
    expect(document.activeElement).toBe(accept);
  });
  it("shows a failed consent save and allows retry without reporting success", async () => {
    vi.mocked(api.giveConsent).mockRejectedValue(new Error("offline"));
    const [accept] = await show();
    await act(async () => {
      accept.click();
      await settle();
    });
    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "Could not save your consent",
    );
    expect(accept.disabled).toBe(false);
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  });
});

import { memberFor } from "../data/members";
import { useAppStore } from "../store";

/** The signed-up member's record (survey + shared brushing data), or undefined for a sample member. */
export const useMemberRecord = () =>
  useAppStore((s) => memberFor(s.personaId).record);

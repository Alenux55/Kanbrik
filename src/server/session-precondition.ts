import "server-only";
import { expectedAccountHeader } from "@/lib/session-contract";
export class SessionChanged extends Error {}
export function assertExpectedAccount(headers: Headers, userId: string) {
  const expected = headers.get(expectedAccountHeader);
  if (expected !== null && expected !== userId) throw new SessionChanged();
}

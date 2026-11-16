import "server-only";
import { verifiedSession } from "./auth";
import { database } from "./db";
import { appearanceInput, type Appearance } from "@/lib/settings-contracts";

// Read-only initialization, including on auth pages. Never bootstrap a workspace
// or renew a cookie merely to choose colors. Unavailable identity uses System.
export async function initialAppearance(headers: Headers): Promise<Appearance> {
  try {
    const session = await verifiedSession(headers);
    if (!session) return "system";
    const saved = await database().plannerPreference.findUnique({
      where: { userId: session.user.id },
      select: { appearance: true },
    });
    return appearanceInput.parse(saved?.appearance ?? "system");
  } catch {
    return "system";
  }
}

"use client";
export const sessionSignalKey = "kanbrik.auth.changed";
export function announceSessionChange() {
  // A non-secret invalidation pulse, never identity, credentials or draft text.
  try { localStorage.setItem(sessionSignalKey, crypto.randomUUID()); } catch { /* focus/navigation/actions also verify */ }
}

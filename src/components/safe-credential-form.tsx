"use client";
import {
  useSyncExternalStore,
  type FormEventHandler,
  type ReactNode,
} from "react";

const subscribe = () => () => {};
const hydrated = () => true;
const server = () => false;

// Safe HTML remains authoritative before React can intercept submission. The
// reject-only POST destination also covers native submit()/autofill bypasses.
export function SafeCredentialForm({
  children,
  onSubmit,
  pending,
  className = "space-y-5",
}: {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  className?: string;
}) {
  const ready = useSyncExternalStore(subscribe, hydrated, server);
  return (
    <form
      method="post"
      action="/auth/form-unavailable"
      aria-busy={!ready || pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !pending) onSubmit(event);
      }}
    >
      {!ready && (
        <p role="status">
          Preparing this form… Enable JavaScript and reload if it stays
          unavailable.
        </p>
      )}
      <noscript>
        JavaScript is required. Enable it and reload this page to continue.
      </noscript>
      <fieldset disabled={!ready || pending} className={className}>
        {children}
      </fieldset>
    </form>
  );
}

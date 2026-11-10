// Only one shared editor is active at a time. Keep its synthetic history entry
// separate from real route navigation, including effect replay/editor handoff.
type Owner = { token: string; url: string; active: boolean };
let owner: Owner | undefined;
let traversal: Promise<void> | undefined;

function traverse(delta: -1 | 1) {
  let finish!: () => void;
  const result = new Promise<void>(resolve => { finish = resolve; });
  traversal = result;
  const settled = () => {
    window.removeEventListener("popstate", settled);
    if (traversal === result) traversal = undefined;
    finish();
  };
  window.addEventListener("popstate", settled);
  window.history.go(delta);
  return result;
}

export function ownDialogHistory(
  token: string,
  currentAccount: () => boolean,
  // Return true to block dismissal (pending, dirty confirmation or session gate).
  back: () => boolean,
) {
  const mine: Owner = { token, url: window.location.href, active: true };
  owner = mine;
  const pop = () => {
    if (owner !== mine || !mine.active || !currentAccount()) return;
    if (window.history.state?.kanbrikDialog === token) return;
    // A real route traversal is owned by Next, not this same-URL editor entry.
    if (window.location.href !== mine.url) return;
    if (back()) void traverse(1);
  };
  const install = () => {
    if (owner !== mine || !mine.active || !currentAccount() || window.location.href !== mine.url) return;
    const state = { ...window.history.state, kanbrikDialog: token };
    if (typeof window.history.state?.kanbrikDialog === "string") {
      // A same-commit editor handoff/Strict Mode replay takes over the existing
      // owned slot. It must not push another entry above the old editor.
      window.history.replaceState(state, "", mine.url);
    } else window.history.pushState(state, "", mine.url);
    window.addEventListener("popstate", pop);
  };
  // History traversal is asynchronous. A rapidly opened replacement must wait
  // for the old editor's removal/restoration before acquiring its own slot.
  if (traversal) void traversal.then(install);
  else install();

  return () => {
    mine.active = false;
    window.removeEventListener("popstate", pop);
    const remove = () => {
      if (owner !== mine) return;
      owner = undefined;
      if (!currentAccount() || window.location.href !== mine.url || window.history.state?.kanbrikDialog !== token) return;
      // Native Back already consumed the entry, so only an ordinary close/save
      // still on our marker traverses once. Never strip Next's routing state.
      void traverse(-1);
    };
    // Let an immediate replacement/effect replay claim this slot first.
    queueMicrotask(() => {
      if (traversal) void traversal.then(remove);
      else remove();
    });
  };
}

// "Add to Home Screen" install-prompt helper.
//
// Chromium browsers fire `beforeinstallprompt` when the PWA install
// criteria are met; we capture that event so the UI can trigger the
// prompt later in response to a user gesture (the spec rejects calls
// outside an active gesture). iOS Safari does not fire this event —
// the user must use Share → Add to Home Screen manually, and on iOS
// 16.4+ that step is also a prerequisite for receiving web push.

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let cachedEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    cachedEvent = null;
    notify();
  });
}

export type InstallState =
  | { available: false; reason: "already-installed" | "not-supported" | "unknown" }
  | { available: true; prompt: () => Promise<"accepted" | "dismissed"> };

function readState(): InstallState {
  if (typeof window === "undefined") return { available: false, reason: "not-supported" };
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari adds .standalone to the navigator
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return { available: false, reason: "already-installed" };
  if (!cachedEvent) return { available: false, reason: "unknown" };
  return {
    available: true,
    prompt: async () => {
      const ev = cachedEvent;
      if (!ev) return "dismissed";
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      cachedEvent = null;
      notify();
      return outcome;
    },
  };
}

// React hook — re-renders when the install state changes (event arrives,
// app is installed, etc.). Components can show or hide an install button
// based on `state.available`. iOS users will always see `available: false`
// here; surface a separate "Add to Home Screen" hint for them via UA sniff
// or platform-detection if/when desired.
//
// TODO(ui): decide where to surface this. Candidates: a small banner on
// SubscribePage (push enrollment is the strongest install motivator), or
// a header button in Shell. Not wired into any page yet — this hook is
// the plumbing only.
export function useInstallPrompt(): InstallState {
  const [state, setState] = useState<InstallState>(readState);
  useEffect(() => {
    const update = () => setState(readState());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
}

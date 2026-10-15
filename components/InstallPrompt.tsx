"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "campus:install-dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem(DISMISS_KEY)) return;
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
  };

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[1200] flex items-center gap-3 rounded-xl bg-[#052e16] p-3 text-white shadow-2xl lg:left-auto lg:right-6 lg:max-w-sm">
      <Download className="h-5 w-5 shrink-0 text-[#4ade80]" />
      <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">Install Campus Navigator for faster access.</p>
      <button
        type="button"
        onClick={install}
        className="min-h-10 rounded-full bg-[#4ade80] px-4 text-xs font-black uppercase tracking-wider text-[#052e16]"
      >
        Install
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="flex h-10 w-10 items-center justify-center">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

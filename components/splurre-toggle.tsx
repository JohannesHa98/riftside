"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "splurre-theme";

/**
 * Runs before first paint so a stored light preference is applied without a
 * flash of the dark palette. Kept in sync with the toggle below.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

/*
 * The theme lives on <html>, written by the inline script above before React
 * exists. That makes it external state, so it is read with
 * useSyncExternalStore: the server snapshot is dark, and React re-reads the
 * real value after hydration rather than mismatching the markup.
 */
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((other) => other !== listener);
  };
}

function isLight() {
  return document.documentElement.dataset.theme === "light";
}

export function SplurreToggle() {
  const light = useSyncExternalStore(subscribe, isLight, () => false);

  function toggle() {
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage: the choice just will not stick.
    }

    for (const listener of listeners) listener();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={light}
      title="Splurre toggle"
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-ink-dim transition-colors hover:border-gold/50 hover:text-ink"
    >
      {light ? <MoonIcon /> : <SunIcon />}
      <span>Splurre toggle</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 fill-none stroke-current stroke-2"
    >
      <circle cx="12" cy="12" r="4.5" />
      <path
        strokeLinecap="round"
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 fill-none stroke-current stroke-2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
      />
    </svg>
  );
}

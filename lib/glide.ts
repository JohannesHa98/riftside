/**
 * Scrolling the page to something, under our own power.
 *
 * Not `scrollIntoView({ behavior: "smooth" })`. That is driven by animation
 * frames, and there are two common machines where those barely arrive: one
 * whose system asks for reduced motion (Windows turns that on with its
 * ordinary "animation effects" switch, and the browser then refuses to
 * animate a scroll at all), and one that is simply painting slowly. On both,
 * the native version silently becomes the jump it was meant to replace —
 * measured at three frames a second on the machine this was written on.
 *
 * So the position is a pure function of elapsed time, and two clocks drive
 * it: animation frames, which are smooth when they arrive, and a plain timer,
 * which keeps going when they do not. Whichever ticks first moves the page;
 * the other finds the work already done.
 *
 * It lasts a few hundred milliseconds and only ever runs because someone
 * clicked something — the kind of motion a reduced-motion preference is least
 * concerned with, since it is replacing a jump, not adding decoration.
 */

const DURATION_MS = 380;
/** A little air above the target, so it does not sit flush against the top. */
const BREATHING_ROOM = 16;
/** Roughly a frame at 60Hz, for when real frames are not coming. */
const TICK_MS = 16;

/**
 * Keys that scroll. Pressing one of these means "I am driving now", so the
 * glide gets out of the way.
 *
 * Deliberately not every key: the keypress that *started* the glide is often
 * still on its way up to the window when this runs — pressing Enter to pick
 * the tenth player, say — and a glide that cancels on any key would cancel
 * itself before it moved.
 */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/** Fast first, settling at the end: the ordinary ease-out. */
function eased(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function glideTo(element: HTMLElement): void {
  const from = window.scrollY;
  const wanted = element.getBoundingClientRect().top + from - BREATHING_ROOM;

  // Never past the bottom, or the last frames do nothing and it looks stuck.
  const furthest = document.documentElement.scrollHeight - window.innerHeight;
  const to = Math.max(0, Math.min(wanted, furthest));

  if (Math.abs(to - from) < 2) return;

  const started = performance.now();
  let running = true;

  function stop() {
    if (!running) return;
    running = false;
    window.clearInterval(timer);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stopOnScrollKey);
  }

  function stopOnScrollKey(event: KeyboardEvent) {
    if (SCROLL_KEYS.has(event.key)) stop();
  }

  function step(now: number) {
    if (!running) return;

    const t = Math.min(1, (now - started) / DURATION_MS);
    window.scrollTo(0, from + (to - from) * eased(t));

    if (t >= 1) stop();
  }

  // Someone taking over mid-flight wins; nothing is more annoying than a page
  // that keeps scrolling after you have grabbed it.
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stopOnScrollKey, { passive: true });

  const timer = window.setInterval(() => step(performance.now()), TICK_MS);

  requestAnimationFrame(function frame(now) {
    step(now);
    if (running) requestAnimationFrame(frame);
  });
}

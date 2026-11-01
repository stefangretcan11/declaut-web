// Native, progressively enhanced motion. Without JS or these APIs all content
// stays visible. CSS owns the first-paint entrance and interaction timings.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const TIMELINE = 1000;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

type Scene = {
  anchor: HTMLElement;
  visual: Animation;
  steps: { animation: Animation; start: number; end: number }[];
};

export function enhanceMotion(root: HTMLElement): () => void {
  if (!("IntersectionObserver" in window) || !root.animate) return () => {};

  const animations = new Set<Animation>();
  const pending = new Map<HTMLElement, Animation[]>();
  const activeScenes = new Set<Scene>();
  const scenes = new Map<Element, Scene>();
  const mobile = window.matchMedia("(max-width: 760px)");
  let frame = 0;
  let disposed = false;

  const animate = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(keyframes, options);
    animations.add(animation);
    return animation;
  };
  const cancel = (animation: Animation) => {
    animation.cancel();
    animations.delete(animation);
  };
  const reveal = (element: HTMLElement, immediate = false) => {
    if (disposed) return;
    const items = pending.get(element);
    if (!items) return;
    items.forEach((animation) => immediate ? cancel(animation) : animation.play());
    pending.delete(element);
    revealObserver.unobserve(element);
  };
  const revealObserver = new IntersectionObserver((entries) => {
    if (disposed) return;
    entries.forEach((entry) => {
      if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) {
        reveal(entry.target as HTMLElement, entry.boundingClientRect.bottom <= 0);
      }
    });
  }, { rootMargin: "0px 0px -32px 0px", threshold: 0 });

  // Read every active section first, then update compositor timelines together.
  // No continuous RAF loop, scroll interception, or React renders per frame.
  const updateScenes = () => {
    frame = 0;
    if (disposed) return;
    const height = window.innerHeight;
    const measurements = Array.from(activeScenes, (scene) => ({ scene, rect: scene.anchor.getBoundingClientRect() }));
    measurements.forEach(({ scene, rect }) => {
      const travel = clamp((height - rect.top) / (height + rect.height));
      scene.visual.currentTime = travel * TIMELINE;
      const progress = clamp((height * 0.92 - rect.top) / (height * 0.62));
      scene.steps.forEach(({ animation, start, end }) => {
        animation.currentTime = clamp((progress - start) / (end - start)) * TIMELINE;
      });
    });
  };
  const schedule = () => {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(updateScenes);
  };
  const visualKeyframes = () => {
    const distance = mobile.matches ? 6 : 16;
    return [
      { transform: `translate3d(0, ${distance}px, 0) scale(0.985)` },
      { transform: `translate3d(0, ${-distance}px, 0) scale(1)` },
    ];
  };
  const onBreakpoint = () => {
    scenes.forEach((scene) => (scene.visual.effect as KeyframeEffect).setKeyframes(visualKeyframes()));
    schedule();
  };
  const sceneObserver = new IntersectionObserver((entries) => {
    if (disposed) return;
    entries.forEach((entry) => {
      const scene = scenes.get(entry.target);
      if (scene) {
        if (entry.isIntersecting) activeScenes.add(scene);
        else activeScenes.delete(scene);
      }
    });
    schedule();
  }, { rootMargin: "120px 0px" });

  const resolveTarget = (target: Element, includeDescendants = false) => {
    for (const element of pending.keys()) {
      if (element.contains(target) || (includeDescendants && target.contains(element))) reveal(element, true);
    }
    // Focus may arrive after a reveal has started, rather than while pending.
    const group = target.closest("[data-motion-group], [data-motion-reveal]");
    group?.getAnimations({ subtree: true }).forEach((animation) => {
      if (animation.playState === "running" && animations.has(animation)) cancel(animation);
    });
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Element) resolveTarget(event.target);
  };
  const onHash = () => {
    try {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target && root.contains(target)) resolveTarget(target, true);
    } catch { /* A malformed URL fragment must not affect the page. */ }
  };
  const disclosureAnimations = new Map<HTMLElement, Animation>();
  const onToggle = (event: Event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    const content = details.querySelector<HTMLElement>("[data-motion-disclosure]");
    if (!content) return;
    const previous = disclosureAnimations.get(content);
    if (previous) cancel(previous);
    disclosureAnimations.delete(content);
    if (details.open) {
      const animation = animate(content, [
        { opacity: 0, transform: "translate3d(0, -5px, 0)" },
        { opacity: 1, transform: "none" },
      ], { duration: 320, easing: EASE });
      disclosureAnimations.set(content, animation);
      animation.onfinish = () => {
        cancel(animation);
        disclosureAnimations.delete(content);
      };
    }
    schedule();
  };
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    revealObserver.disconnect();
    sceneObserver.disconnect();
    animations.forEach((animation) => animation.cancel());
    animations.clear();
    pending.clear();
    activeScenes.clear();
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("hashchange", onHash);
    mobile.removeEventListener("change", onBreakpoint);
    document.removeEventListener("visibilitychange", onVisibility);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("toggle", onToggle, true);
  };

  try {
    const targets = root.querySelectorAll<HTMLElement>("[data-motion-group], [data-motion-reveal]");
    // Measure untransformed layout before preparing any reveal animations.
    const positions = Array.from(targets, (element) => ({ element, rect: element.getBoundingClientRect() }));
    positions.forEach(({ element, rect }) => {
      // Keep restored scroll positions, deep links, and focused controls readable.
      if (rect.bottom <= 0 || element.contains(document.activeElement)) return;
      const children = element.hasAttribute("data-motion-group") ? Array.from(element.children) : [element];
      const items = children.map((child, index) => {
        const animation = animate(child, [
          { opacity: 0, transform: `translate3d(0, ${mobile.matches ? 14 : 24}px, 0)` },
          { opacity: 1, transform: "none" },
        ], { duration: 780, delay: Math.min(index * 75, 225), easing: EASE, fill: "both" });
        animation.pause();
        animation.currentTime = 0;
        animation.onfinish = () => cancel(animation);
        return animation;
      });
      pending.set(element, items);
      if (rect.top < window.innerHeight - 32) reveal(element);
      else revealObserver.observe(element);
    });

    root.querySelectorAll<HTMLElement>("[data-motion-scene]").forEach((element) => {
      const anchor = element.closest<HTMLElement>("[data-motion-section]");
      if (!anchor) return;
      const visual = animate(element, visualKeyframes(), { duration: TIMELINE, fill: "both", easing: "linear" });
      visual.pause();
      const scene: Scene = { anchor, visual, steps: [] };
      const step = (selector: string, start: number, spacing = 0.1, scale = false) => {
        element.querySelectorAll(selector).forEach((child, index) => {
          const animation = animate(child, scale ? [
            { transform: "scaleX(0.08)" }, { transform: "scaleX(1)" },
          ] : [
            { opacity: 0.25, transform: "translate3d(0, 7px, 0)" },
            { opacity: 1, transform: "none" },
          ], { duration: TIMELINE, fill: "both", easing: EASE });
          animation.pause();
          scene.steps.push({ animation, start: start + index * spacing, end: start + index * spacing + 0.4 });
        });
      };
      // The hero keeps a complete matrix; subsequent scenes explain the task.
      if (element.dataset.motionScene === "matrix") step(".preview-table-row:not(.preview-table-head)", 0.05, 0.14);
      if (element.dataset.motionScene === "upload") {
        step(".preview-document", 0);
        step(".preview-progress > span", 0.05, 0, true);
        step(".preview-steps > span", 0.15, 0.13);
      }
      if (element.dataset.motionScene === "receipt") {
        step(".preview-receipt-status", 0);
        step(".preview-receipt-details > div", 0.15, 0.13);
      }
      scenes.set(anchor, scene);
      const rect = anchor.getBoundingClientRect();
      if (rect.top < window.innerHeight + 120 && rect.bottom > -120) activeScenes.add(scene);
      sceneObserver.observe(anchor);
      // Initialise before the first scroll, including history-restored views.
      const progress = clamp((window.innerHeight * 0.92 - rect.top) / (window.innerHeight * 0.62));
      visual.currentTime = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height)) * TIMELINE;
      scene.steps.forEach(({ animation, start, end }) => {
        animation.currentTime = clamp((progress - start) / (end - start)) * TIMELINE;
      });
    });

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("hashchange", onHash);
    mobile.addEventListener("change", onBreakpoint);
    document.addEventListener("visibilitychange", onVisibility);
    root.addEventListener("focusin", onFocus);
    root.addEventListener("toggle", onToggle, true);
    onHash();
  } catch {
    // Enhancement failure must restore the fully usable server-rendered page.
    dispose();
  }
  return dispose;
}

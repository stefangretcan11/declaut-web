import { frame, inView, stagger, type AnimationSequence, type useAnimate } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
type ScopedAnimate = ReturnType<typeof useAnimate>[1];
type Controls = ReturnType<ScopedAnimate>;
type Step = {
  elements: HTMLElement[];
  at?: number;
  duration?: number;
  stagger?: number;
  opacity?: number;
  transform?: string;
  targetTransform?: string;
};
type Entry = {
  trigger: HTMLElement;
  controls?: Controls;
  restore: () => void;
  unobserve: () => void;
};

function originalStyles(elements: HTMLElement[]) {
  const originals = Array.from(new Set(elements), (element) => ({
    element,
    properties: ["opacity", "transform"].map((name) => ({
      name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name),
    })),
  }));
  const restore = () => originals.forEach(({ element, properties }) => properties.forEach(({ name, value, priority }) => {
    if (value) element.style.setProperty(name, value, priority);
    else element.style.removeProperty(name);
  }));
  return () => {
    restore();
    // Motion can have a final style write queued after its completion promise.
    // Clear that write too, leaving no compositing transforms after settling.
    frame.postRender(restore);
  };
}

/** Enhance existing server markup; never hide content before JS is available. */
export function enhanceMotion(root: HTMLElement, animate: ScopedAnimate, seen: WeakSet<HTMLElement>): () => void {
  if (typeof IntersectionObserver !== "function" || typeof root.animate !== "function") return () => {};

  const entries = new Map<HTMLElement, Entry>();
  const disclosures = new Map<HTMLElement, { controls: Controls; restore: () => void }>();
  let disposed = false;
  const select = (parent: Element, selector: string) => Array.from(parent.querySelectorAll<HTMLElement>(selector));
  const finish = (entry: Entry) => {
    entry.unobserve();
    entry.controls?.cancel();
    entry.restore();
    entries.delete(entry.trigger);
    seen.add(entry.trigger);
  };
  const register = (trigger: HTMLElement, steps: Step[]) => {
    const rect = trigger.getBoundingClientRect();
    // Preserve history-restored views and content the user is already focusing.
    if (seen.has(trigger) || rect.bottom <= 0 || trigger.contains(document.activeElement)) return;
    const jobs = steps.filter((step) => step.elements.length);
    if (!jobs.length) return;
    const entry: Entry = {
      trigger,
      restore: originalStyles(jobs.flatMap((step) => step.elements)),
      unobserve: () => {},
    };
    entries.set(trigger, entry);
    const sequence: AnimationSequence = jobs.map((step) => [
      step.elements,
      { opacity: [step.opacity ?? 0, 1], transform: [step.transform ?? "translate3d(0, 20px, 0)", step.targetTransform ?? "none"] },
      { at: step.at ?? 0, duration: step.duration ?? 0.56, delay: stagger(step.stagger ?? 0.08), ease: EASE },
    ]);
    entry.controls = animate(sequence, { autoplay: false });
    entry.controls.time = 0;
    void entry.controls.then(() => { if (!disposed && entries.has(trigger)) finish(entry); });
    entry.unobserve = inView(trigger, () => {
      if (disposed || !entries.has(trigger)) return;
      seen.add(trigger);
      entry.controls?.play();
      // No exit callback: Motion observes each section only until first entry.
    }, { margin: "0px 0px -32px 0px" });
  };

  const previewSteps = (figure: HTMLElement, at = 0): Step[] => {
    const scene = figure.dataset.motionScene;
    if (scene === "hero" || scene === "matrix") return [
      { elements: select(figure, ".preview-table-row:not(.preview-table-head)"), at: at + 0.18, duration: 0.48, transform: "translate3d(0, 8px, 0)", opacity: 0.3 },
      { elements: select(figure, ".preview-status"), at: at + 0.26, duration: 0.4, stagger: 0.03, transform: "none", opacity: 0.5 },
    ];
    if (scene === "upload") return [
      { elements: select(figure, ".preview-document"), at: at + 0.16, transform: "translate3d(0, 8px, 0)" },
      { elements: select(figure, ".preview-progress > span"), at: at + 0.2, duration: 0.6, transform: "scaleX(0.08)", targetTransform: "scaleX(1)", opacity: 1 },
      { elements: select(figure, ".preview-steps > span"), at: at + 0.28, duration: 0.45, transform: "translate3d(0, 6px, 0)", opacity: 0.3 },
    ];
    return [
      { elements: select(figure, ".preview-receipt-status"), at: at + 0.16, transform: "translate3d(0, 8px, 0)", opacity: 0.3 },
      { elements: select(figure, ".preview-receipt-details > div"), at: at + 0.24, duration: 0.48, transform: "translate3d(0, 8px, 0)", opacity: 0.3 },
    ];
  };

  const resolveTarget = (target: Element, descendants = false) => {
    for (const entry of entries.values()) {
      if (entry.trigger.contains(target) || (descendants && target.contains(entry.trigger))) finish(entry);
    }
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Element) resolveTarget(event.target);
  };
  const onHash = () => {
    try {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target && root.contains(target)) resolveTarget(target, true);
    } catch { /* Malformed fragments must not affect page access. */ }
  };
  const onToggle = (event: Event) => {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    const content = event.target.querySelector<HTMLElement>("[data-motion-disclosure]");
    if (!content) return;
    const previous = disclosures.get(content);
    previous?.controls.cancel();
    previous?.restore();
    disclosures.delete(content);
    if (event.target.open) {
      const restore = originalStyles([content]);
      const controls = animate(content, { opacity: [0, 1], transform: ["translate3d(0, -4px, 0)", "none"] }, { duration: 0.22, ease: EASE });
      disclosures.set(content, { controls, restore });
      void controls.then(() => {
        if (disposed || disclosures.get(content)?.controls !== controls) return;
        controls.cancel();
        restore();
        disclosures.delete(content);
      });
    }
  };
  const dispose = () => {
    disposed = true;
    entries.forEach((entry) => {
      entry.unobserve();
      entry.controls?.cancel();
      entry.restore();
    });
    disclosures.forEach(({ controls, restore }) => { controls.cancel(); restore(); });
    entries.clear();
    disclosures.clear();
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("toggle", onToggle, true);
    window.removeEventListener("hashchange", onHash);
  };

  try {
    const hero = root.querySelector<HTMLElement>(".marketing-hero");
    if (hero) {
      const figure = hero.querySelector<HTMLElement>("[data-motion-scene]");
      register(hero, [
        { elements: select(hero, ".marketing-hero-copy > .eyebrow"), duration: 0.5 },
        { elements: select(hero, "[data-motion-line]"), at: 0.04, duration: 0.6 },
        { elements: select(hero, ".marketing-hero-copy > p:not(.eyebrow)"), at: 0.12 },
        // Keep the primary action fully opaque and usable from the first frame.
        { elements: select(hero, ".marketing-hero-actions"), opacity: 1, transform: "translate3d(0, 8px, 0)", duration: 0.45 },
        { elements: select(hero, ".marketing-release-note"), at: 0.18 },
        { elements: select(hero, ".marketing-hero-preview"), at: 0.16, duration: 0.6, transform: "translate3d(0, 16px, 0)" },
        ...(figure ? previewSteps(figure, 0.08) : []),
      ]);
    }
    root.querySelectorAll<HTMLElement>("[data-motion-heading]").forEach((heading) => {
      register(heading, [{ elements: Array.from(heading.children) as HTMLElement[] }]);
    });
    root.querySelectorAll<HTMLElement>("[data-motion-group], [data-motion-reveal]").forEach((element) => {
      // Each workflow stage has one coordinated timeline for its text + preview.
      if (element.closest(".marketing-workflow-row")) return;
      register(element, [{ elements: element.hasAttribute("data-motion-group") ? Array.from(element.children) as HTMLElement[] : [element] }]);
    });
    root.querySelectorAll<HTMLElement>(".marketing-workflow-row").forEach((stage, index) => {
      const figure = stage.querySelector<HTMLElement>("[data-motion-scene]");
      const at = index * 0.06;
      register(stage, [
        { elements: select(stage, ".marketing-workflow-copy > *"), at },
        { elements: figure ? [figure] : [], at: at + 0.12, transform: "translate3d(0, 16px, 0)" },
        ...(figure ? previewSteps(figure, at) : []),
      ]);
    });
    root.addEventListener("focusin", onFocus);
    root.addEventListener("toggle", onToggle, true);
    window.addEventListener("hashchange", onHash);
    onHash();
  } catch (error) {
    // Restore the original static document if enhancement cannot initialise.
    dispose();
    if (process.env.NODE_ENV !== "production") console.error("Motion enhancement unavailable", error);
  }
  return dispose;
}

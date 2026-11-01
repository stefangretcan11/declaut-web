"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAnimate, useReducedMotion } from "motion/react";
import { enhanceMotion } from "@/lib/motion";

/** Keeps content server-rendered; animation frames never update React state. */
export function MotionSurface({ children, className }: { children: React.ReactNode; className: string }) {
  const [scope, animate] = useAnimate<HTMLElement>();
  const reducedMotion = useReducedMotion();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(reducedMotion);
  const seen = useRef(new WeakSet<HTMLElement>());
  const pathname = usePathname();

  useEffect(() => {
    // Motion's hook provides the initial preference. Subscribe as well so an
    // OS preference change cancels opacity animations immediately, too.
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const dispose = prefersReducedMotion === false ? enhanceMotion(root, animate, seen.current) : () => {};
    root.dataset.motionReady = "true";
    return () => {
      dispose();
      delete root.dataset.motionReady;
    };
  }, [animate, pathname, prefersReducedMotion, scope]);

  return <main ref={scope} className={className}>{children}</main>;
}

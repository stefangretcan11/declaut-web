"use client";

import { useEffect, useRef } from "react";
import { enhanceMotion } from "@/lib/motion";

/** Keeps server-rendered content intact; motion never drives React state. */
export function MotionSurface({ children, className }: { children: React.ReactNode; className: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let dispose = () => {};
    const sync = () => {
      dispose();
      dispose = preference.matches ? () => {} : enhanceMotion(root);
    };
    sync();
    preference.addEventListener("change", sync);
    return () => {
      dispose();
      preference.removeEventListener("change", sync);
    };
  }, []);

  return <main ref={ref} className={className}>{children}</main>;
}

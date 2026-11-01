"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useInView, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useSiteReducedMotion } from "@/components/motion-surface";
import { Tick } from "@/components/marketing/workflow-previews";
import { MATRIX_ROW_REVEAL, MOTION_EASE } from "@/lib/motion";
import { workflowStages } from "@/lib/workflow-story";
import "@/app/workflow-story.css";

// These firms and receipt details belong only to this labelled illustration.
const firms = [
  { name: "Exemplu SRL", cui: "RO12345678" },
  { name: "Atelier Demo", cui: "RO23456789" },
  { name: "Firma de Test", cui: "RO34567890" },
];
const rowVariants = {
  hidden: { opacity: MATRIX_ROW_REVEAL.opacity, transform: MATRIX_ROW_REVEAL.transform },
  visible: { opacity: 1, transform: "none" },
};
const headingFrames = [
  { stops: [0, 0.26, 0.32, 1], opacity: [1, 1, 0, 0], y: [0, 0, -10, -10] },
  { stops: [0, 0.32, 0.38, 0.62, 0.68, 1], opacity: [0, 0, 1, 1, 0, 0], y: [10, 10, 0, 0, -10, -10] },
  { stops: [0, 0.68, 0.74, 1], opacity: [0, 0, 1, 1], y: [10, 10, 0, 0] },
];

type StatusMotion = { ready: MotionValue<number>; sending: MotionValue<number>; validated: MotionValue<number> };

function DemoStatus({ ready, sending, validated }: StatusMotion) {
  return <span className="story-status-stack">
    <motion.span data-demo-status="ready" style={{ opacity: ready }}>Pregătit</motion.span>
    <motion.span data-demo-status="sending" style={{ opacity: sending }}>În curs de trimitere</motion.span>
    <motion.span className="story-status-valid" data-demo-status="validated" style={{ opacity: validated }}><Tick />Validat</motion.span>
  </span>;
}

function StoryHeading({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const frames = headingFrames[index];
  const opacity = useTransform(progress, frames.stops, frames.opacity);
  const y = useTransform(progress, frames.stops, frames.y);
  const stage = workflowStages[index];
  return <motion.li className="story-heading" style={{ opacity, y }} data-story-heading={index + 1}>
    <span className="marketing-step-number">{stage.label}</span>
    <h2>{stage.title}</h2>
    <p>{stage.description}</p>
  </motion.li>;
}

function StoryExperience({ target }: { target: RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end end"] });
  // One damped value keeps the internal transitions together without scroll locks.
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 32, mass: 0.3, restDelta: 0.0001 });
  const opacity = useTransform(progress, [0, 0.12], [0.3, 1]);
  const y = useTransform(progress, [0, 0.12], [16, 0]);
  const focus = useTransform(progress, [0.12, 0.28], [0, 1]);
  const unrelated = useTransform(progress, [0.28, 0.46], [1, 0.55]);
  const ready = useTransform(progress, [0.32, 0.43], [1, 0]);
  const sending = useTransform(progress, [0.32, 0.43, 0.67, 0.77], [0, 1, 1, 0]);
  const validated = useTransform(progress, [0.67, 0.78], [0, 1]);
  const sendProgress = useTransform(progress, [0.45, 0.65], [0, 1]);
  const receiptOpacity = useTransform(progress, [0.70, 0.84], [0, 1]);
  const receiptY = useTransform(progress, [0.70, 0.84], [12, 0]);
  const receiptScale = useTransform(progress, [0.70, 0.84], [0.96, 1]);
  const preparation = useTransform(progress, [0.35, 0.45], [1, 0]);
  const submission = useTransform(progress, [0.35, 0.45, 0.68, 0.78], [0, 1, 1, 0]);
  const tableRef = useRef<HTMLTableElement>(null);
  const rowsVisible = useInView(tableRef, { once: true, amount: 0.2 });
  const statuses = { ready, sending, validated };

  return <div className="story-sticky" data-story-viewport>
    <ol className="story-headings" aria-label="Fluxul Declaut în trei etape">
      {workflowStages.map((stage, index) => <StoryHeading key={stage.id} index={index} progress={progress} />)}
    </ol>
    <motion.figure className="story-app" data-story-window style={{ opacity, y }} aria-labelledby="story-caption">
      <div className="preview-window-bar story-titlebar" aria-hidden="true"><span className="preview-window-dot" /><span>Declaut / Declarații</span><span>DEMO</span></div>
      <div className="story-app-body" aria-hidden="true">
        <aside className="story-sidebar">
          <span className="story-app-brand">declaut<span>.</span></span>
          <span className="story-sidebar-caption">SPAȚIUL DE LUCRU</span>
          <span className="story-sidebar-current">Declarații</span><span>Recipise</span><span>Arhivă</span>
          <span className="story-sidebar-bottom">Date fictive<br />Octombrie 2026</span>
        </aside>
        <div className="story-workspace">
          <div className="story-workspace-heading"><div><span>SITUAȚIE GLOBALĂ</span><h3>Declarațiile, în ordine.</h3></div><span className="story-period">Octombrie 2026</span></div>
          <table className="story-matrix" ref={tableRef} data-story-matrix>
            <thead><tr><th>Companie</th><th>D100</th><th>D112</th><th>D300</th></tr></thead>
            <tbody>{firms.map((firm, index) => <motion.tr key={firm.cui} data-story-row={index} variants={rowVariants} initial="hidden" animate={rowsVisible ? "visible" : "hidden"} transition={{ duration: MATRIX_ROW_REVEAL.duration, delay: index * MATRIX_ROW_REVEAL.stagger, ease: MOTION_EASE }}>
              <td><motion.div className="story-company" style={index ? { opacity: unrelated } : undefined}><i>{firm.name[0]}</i><span><strong>{firm.name}</strong><small>{firm.cui}</small></span></motion.div></td>
              <td><motion.span className="story-cell-check" style={index ? { opacity: unrelated } : undefined}><Tick /></motion.span></td>
              <td>{index === 0 ? <div className="story-selected-cell"><motion.span className="story-selection" style={{ opacity: focus }} /><DemoStatus {...statuses} /></div> : <motion.span className={index === 1 ? "story-cell-empty" : "story-cell-check"} style={{ opacity: unrelated }}>{index === 1 ? "—" : <Tick />}</motion.span>}</td>
              <td><motion.span className={index === 2 ? "story-cell-empty" : "story-cell-check"} style={index ? { opacity: unrelated } : undefined}>{index === 2 ? "—" : <Tick />}</motion.span></td>
            </motion.tr>)}</tbody>
          </table>
          <div className="story-matrix-footer"><span><i />3 companii · date fictive</span><motion.span style={{ opacity: focus }}>D112 selectată</motion.span></div>
          <div className="story-workspace-note">Declarațiile și recipisele rămân în același flux.</div>
        </div>
        <aside className="story-inspector">
          <span className="story-sidebar-caption">DECLARAȚIA SELECTATĂ</span>
          <div className="story-document"><span className="story-document-icon">PDF</span><div><strong>D112</strong><span>Exemplu SRL</span></div></div>
          <dl className="story-document-meta"><div><dt>Perioadă</dt><dd>Octombrie 2026</dd></div><div><dt>Stare</dt><dd><DemoStatus {...statuses} /></dd></div></dl>
          <div className="story-inspector-panels">
            <motion.div className="story-preparation" style={{ opacity: preparation }}>
              <span className="story-demo-action">Trimite la ANAF <span>↗</span></span><p>Document selectat.<br />Pregătit pentru transmitere.</p>
            </motion.div>
            <motion.div className="story-submission" style={{ opacity: submission }}>
              <span className="story-panel-label">Transmitere simulată</span><div className="story-send-track"><motion.span data-story-send-progress style={{ scaleX: sendProgress }} /></div><p>Declarația D112 este în curs de trimitere.</p>
            </motion.div>
            <motion.div className="story-receipt" data-story-receipt style={{ opacity: receiptOpacity, y: receiptY, scaleY: receiptScale }}>
              <div className="story-receipt-heading"><span><Tick /></span><strong>Recipisă verificată</strong></div>
              <dl><div><dt>Declarație</dt><dd>D112</dd></div><div><dt>Index demo</dt><dd>DEMO-00112</dd></div><div><dt>Rezultat</dt><dd>Validat</dd></div></dl>
              <p>Exemplu ilustrativ · date fictive</p>
            </motion.div>
          </div>
        </aside>
      </div>
      <figcaption id="story-caption">Demonstrație ilustrativă · date fictive · fără transmitere către ANAF<span className="sr-only">. Exemplu SRL, D112, octombrie 2026: declarația trece de la Pregătit la În curs de trimitere, apoi la Validat. Recipisa fictivă are indexul DEMO-00112.</span></figcaption>
    </motion.figure>
    <div className="story-rail" aria-hidden="true"><div className="story-rail-track"><motion.span style={{ scaleX: progress }} /></div><div className="story-rail-labels">{workflowStages.map((stage) => <span key={stage.id}>{stage.shortLabel}</span>)}</div></div>
  </div>;
}

export function WorkflowStory({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const reducedMotion = useSiteReducedMotion();
  const [hasSpace, setHasSpace] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1000px) and (min-height: 720px)");
    const sync = () => setHasSpace(query.matches && typeof Element.prototype.animate === "function" && typeof IntersectionObserver === "function");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const enhanced = hasSpace && !reducedMotion;
  return <section ref={root} className="workflow-story" data-workflow-story data-story-mode={enhanced ? "scroll" : "static"} aria-label="De la declarație la recipisă: demonstrație ilustrativă">
    {enhanced && <StoryExperience target={root} />}
    <div className="story-fallback" data-story-fallback hidden={enhanced}>{children}</div>
  </section>;
}

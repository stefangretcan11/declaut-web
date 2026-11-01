# Frontend direction

Keep the existing minimalist presentation: warm off-white background, dark green text, restrained borders, generous spacing and one clear primary action per form.

The auth pages apply the following principles from Apple's Human Interface Guidelines to the web:

- System typeface and a small number of text sizes/weights communicate hierarchy. Inputs use 16px text; form titles are prominent without overtaking the task.
- Persistent labels, vertically stacked fields and consistent widths make forms easy to scan. Email/password autofill and a password visibility toggle support familiar browser behavior.
- Primary controls are at least 50px tall. Focus has a visible outline, and errors include explanatory text alongside color. Inline errors connect to their fields and move focus to the first invalid control.
- The layout adapts to narrow screens without horizontal scrolling. Text can reflow, and motion respects the operating system's reduced-motion preference.
- Feedback uses concise Romanian copy and announces status/errors to assistive technology. Account-existence details and implementation diagnostics stay out of reset-email responses.

References: [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography), [text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields), [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

## Motion

The existing Next.js App Router/React site uses plain CSS. Motion adds no dependencies: `src/app/motion.css` owns first-paint entrances and interaction timing; `MotionSurface` enhances server-rendered marketing content using `src/lib/motion.ts`, the Web Animations API and IntersectionObserver.

- The homepage hero reveals its existing headline lines, supporting copy, actions and preview in a short sequence. Shared page headings and auth/account headings use the same easing.
- Mark a container with `data-motion-group` to stagger its immediate children, or use `data-motion-reveal` for a single element. Avoid nesting these markers: independently animating an ancestor and descendant compounds the movement.
- Workflow sections use `data-motion-section` as a stable measurement anchor. Their `data-motion-scene` figures receive restrained parallax and scale; matrix rows, illustrative upload progress and receipt details follow local scroll progress. The existing layout and normal document scrolling stay intact.
- Only intersecting scenes are measured, with reads batched before writes in one requested animation frame per scroll/resize. There is no continuous animation loop or React state update during scrolling. Finished reveal effects are removed.
- Buttons, navigation underlines, link arrows, cards and native disclosures share restrained interaction timing. Hover movement is restricted to precise pointers; keyboard focus keeps its existing outline and immediately resolves pending reveals.
- Reduced-motion changes cancel all imperative animations during the visit. Content is visible without JavaScript or supported APIs, fragment targets are revealed immediately, and print styles show the complete document. Legal and transactional content stays directly readable.

`tests/e2e/motion.spec.ts` covers scroll-linked illustration behavior, keyboard/deep-link access, live reduced-motion changes, responsive layout stability and native interactions without JavaScript. Full-page marketing screenshots run with reduced motion for deterministic layout captures.

API references: [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API), [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).

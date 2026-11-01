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

The existing Next.js App Router/React website uses plain CSS and Motion for React (`motion/react`). Public content remains server-rendered; the small `MotionSurface` client boundary calls `useAnimate` and `useReducedMotion`. `src/lib/motion.ts` supplies shared sequences, and `src/app/motion.css` handles pointer, focus and press feedback.

- Sections reveal once with 20px upward movement, a 0.56-second ease-out and 80ms staggering. Related headings, cards and FAQ disclosures use the same restrained language.
- The hero coordinates its existing headline, supporting text and preview. The main CTA stays fully opaque and usable from its first frame. Motion adds no server-rendered hidden styles, so content remains visible without JavaScript or animation APIs.
- The vertical workflow fallback keeps one timeline per stage for its copy and existing product preview. These illustrative values remain unchanged. The dedicated desktop story below uses separate, clearly labelled fictional state transitions.
- Completed viewport reveals do not replay. The desktop workflow story is the intentional exception: its internal demonstration follows scroll progress in both directions through Motion values. There are no custom scroll listeners, timers, scroll locks or decorative parallax.
- Hover lift is 2px for buttons and 3px for cards, with restrained shadows; press scale is 0.98. Feedback uses 150–250ms transitions, keeps visible keyboard focus and limits hover movement to precise pointers. Native disclosures remain functional without JavaScript.
- `useReducedMotion` supplies Motion's initial preference. A media-query subscription also handles live preference changes, cancelling all effects and restoring original inline styles immediately. Already visited sections stay settled if motion is re-enabled.
- Focus and fragment navigation immediately finish pending or running reveals. Motion cleans up its scoped animations on unmount; the enhancement also restores styles and removes viewport/event subscriptions on navigation and preference changes. Print styles show the complete document.

`tests/e2e/motion.spec.ts` covers the original one-time reveals, vertical workflow, keyboard/deep-link access, live reduced-motion changes, 320px/mobile/tablet/desktop stability, missing animation APIs and native navigation without JavaScript. Full-page marketing screenshots run with reduced motion so static appearance can be compared directly.

References: [Motion useAnimate](https://motion.dev/docs/react-use-animate), [Motion reduced-motion support](https://motion.dev/docs/react-use-reduced-motion), [Motion inView](https://motion.dev/docs/inview).


## Continuous workflow demonstration

`WorkflowStory` replaces only the three workflow rows on the homepage. At viewports of at least **1000 × 720**, with motion enabled and supported APIs, its 360svh container holds a 100svh sticky composition. A single application frame stays mounted with fixed geometry; the declaration matrix, sidebar and inspector remain in that same frame throughout all stages. Its width is 78vw up to 1120px, and its height adapts to the available viewport without changing between stages.

`useScroll` tracks the section from `start start` to `end end`; one damped `useSpring` value synchronizes `useTransform` mappings. No React state changes occur per scroll frame. Headings, D112 selection/status, the submission bar and receipt panel follow local progress and reverse naturally. The final state holds from about 85% to the end. Matrix row entrances reuse `MATRIX_ROW_REVEAL` and `MOTION_EASE` from the existing animation utility, with `useInView({ once: true })` so they do not replay on reverse scrolling.

| Progress | Demonstration |
| --- | --- |
| 0–12% | Gentle window entrance |
| 12–28% | Focus the fictional D112 declaration |
| 32–43% | Transition from Pregătit to În curs de trimitere |
| 45–65% | Advance the illustrative submission bar |
| 67–84% | Show Validat and reveal the fictional receipt |
| 85–100% | Hold the final result |

The desktop UI deliberately uses no `data-motion-group` or old workflow-row wrappers. Its scroll-linked values therefore do not compete with the existing viewport reveal controller. The hero entrance, navigation/button interactions, pricing, FAQ and update-card reveals retain their behavior. `WorkflowFallback` reuses the original Matrix/Upload/Receipt previews and their existing animation sequences in the compact vertical layout.

The reduced-motion context comes from the existing `MotionSurface` preference and live media subscription; the story does not add another motion preference mechanism. Small/short viewports, reduced-motion users, missing animation APIs and JavaScript-disabled visits receive the server-rendered fallback without the long scroll container. Print also uses the complete fallback. Only viewport-capacity changes use local React state.

All firms, CUI values, statuses and receipt details in the desktop frame are explicitly fictional. The apparent submission control is non-interactive illustration markup; the demo makes no ANAF/API requests and imports no business logic. The visible caption and screen-reader description identify the simulation, and the three stage headings retain a complete reading order without live status announcements.

`tests/e2e/workflow-story.spec.ts` verifies persistent frame identity/geometry, reversible states, matrix row entrances, no ANAF requests, internal clipping and horizontal overflow down to 1000 × 720, compact/short viewport fallbacks, printing, shared reduced-motion behavior and desktop no-JavaScript content. Screenshots are written to `.artifacts/story-*.png`.

References: [Motion useScroll](https://motion.dev/docs/react-use-scroll), [Motion useTransform](https://motion.dev/docs/react-use-transform), [Motion useSpring](https://motion.dev/docs/react-use-spring).

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
- Each of the three workflow stages has one timeline for its copy and product preview. Small stage offsets connect the progression on desktop and the existing vertical mobile layout. Matrix rows and status indicators settle once; the existing illustrative upload bar and receipt rows follow the same rhythm. Declaration values, labels and statuses never change.
- Completed stages do not scrub backwards or replay on scrolling. There are no scroll listeners, continuous frame loops, floating effects or parallax.
- Hover lift is 2px for buttons and 3px for cards, with restrained shadows; press scale is 0.98. Feedback uses 150–250ms transitions, keeps visible keyboard focus and limits hover movement to precise pointers. Native disclosures remain functional without JavaScript.
- `useReducedMotion` supplies Motion's initial preference. A media-query subscription also handles live preference changes, cancelling all effects and restoring original inline styles immediately. Already visited sections stay settled if motion is re-enabled.
- Focus and fragment navigation immediately finish pending or running reveals. Motion cleans up its scoped animations on unmount; the enhancement also restores styles and removes viewport/event subscriptions on navigation and preference changes. Print styles show the complete document.

`tests/e2e/motion.spec.ts` covers one-time workflow progression, unchanged illustrative statuses, keyboard/deep-link access, live reduced-motion changes, 320px/mobile/tablet/desktop stability, missing animation APIs and native navigation without JavaScript. Full-page marketing screenshots run with reduced motion so static appearance can be compared directly.

References: [Motion useAnimate](https://motion.dev/docs/react-use-animate), [Motion reduced-motion support](https://motion.dev/docs/react-use-reduced-motion), [Motion inView](https://motion.dev/docs/inview).

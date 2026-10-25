# Frontend direction

Keep the existing minimalist presentation: warm off-white background, dark green text, restrained borders, generous spacing and one clear primary action per form.

The auth pages apply the following principles from Apple's Human Interface Guidelines to the web:

- System typeface and a small number of text sizes/weights communicate hierarchy. Inputs use 16px text; form titles are prominent without overtaking the task.
- Persistent labels, vertically stacked fields and consistent widths make forms easy to scan. Email/password autofill and a password visibility toggle support familiar browser behavior.
- Primary controls are at least 50px tall. Focus has a visible outline, and errors include explanatory text alongside color. Inline errors connect to their fields and move focus to the first invalid control.
- The layout adapts to narrow screens without horizontal scrolling. Text can reflow, and motion respects the operating system's reduced-motion preference.
- Feedback uses concise Romanian copy and announces status/errors to assistive technology. Account-existence details and implementation diagnostics stay out of reset-email responses.

References: [Apple typography](https://developer.apple.com/design/human-interface-guidelines/typography), [text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields), [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

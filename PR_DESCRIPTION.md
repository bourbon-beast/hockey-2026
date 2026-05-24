💡 What
Added `aria-label` and `title` attributes to icon-only "Remove player" buttons in `TeamColumn.jsx`, and added `aria-label="Close modal"` to the close button in `PlayerModal.jsx`. Also added `aria-hidden="true"` to the inner decorative `<svg>` elements.

🎯 Why
These changes ensure that screen readers can correctly identify the purpose of icon-only buttons, improving overall keyboard and screen reader accessibility without changing the visual design.

📸 Before/After
No visual changes; purely structural semantic changes for accessibility.

♿ Accessibility
Screen readers will now read "Remove player" when focusing the trash icon buttons, and "Close modal" for the '×' button.

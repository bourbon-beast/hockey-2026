## 2024-05-16 - Ensure Focus States for Hover-Revealed Elements
**Learning:** Elements that are visually hidden until hovered over (e.g., using Tailwind's `sm:opacity-0 sm:group-hover:opacity-100`) become invisible and confusing to keyboard-only users navigating via Tab, as they gain focus but remain invisible.
**Action:** Always pair `group-hover:opacity-100` with `focus-visible:opacity-100` for interactive elements so that they are revealed when receiving keyboard focus.

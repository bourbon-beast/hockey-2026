## 2026-04-02 - Interactive Custom Toggles
**Learning:** Custom interactive components like switches built with non-semantic `div` elements require manual additions of accessibility attributes (`role="switch"`, `aria-checked`), keyboard operability (`tabIndex={0}`, `onKeyDown` for Space/Enter), and clear focus indicators (`focus-visible`).
**Action:** Always check custom toggles/switches during accessibility reviews to ensure they are fully keyboard-navigable and have proper ARIA states.

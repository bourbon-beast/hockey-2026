## 2024-05-11 - focus-visible:opacity-100 missed in hover visible elements
**Learning:** Interactive elements like buttons that use `opacity-0 group-hover:opacity-100` for clean UI become completely invisible to keyboard users trying to navigate the app, violating accessibility standards.
**Action:** Add `focus-visible:opacity-100` along with `group-hover:opacity-100` and ensure ARIA labels are added for icon buttons.

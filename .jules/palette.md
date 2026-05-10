## 2025-02-14 - Improve TeamColumn buttons accessibility
**Learning:** Icon-only SVG buttons lacking `aria-label`, leaving `aria-hidden` unset on SVGs, and using hover-dependent utilities like `group-hover:opacity-100` are prominent patterns hindering keyboard/screen-reader accessibility in lists.
**Action:** Always verify hover-state buttons have an explicit `focus-visible:opacity-100` rule and clear `.focus-visible:ring-2` rules to retain accessibility alongside mouse usage. Add contextual `aria-label`s directly to the interactive components.

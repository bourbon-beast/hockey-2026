## 2024-05-10 - Hover-only List Actions
**Learning:** Actions in list items that use `opacity-0 group-hover:opacity-100` are completely invisible to keyboard users navigating via Tab unless accompanied by a `focus-visible:opacity-100` class. Even if technically focusable, the user cannot see where their focus is.
**Action:** When hiding interactive elements until hover, always pair with `focus-visible:opacity-100` and `focus-visible:ring-2` to ensure the element becomes visibly active when focused via keyboard.

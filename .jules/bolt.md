## 2024-05-18 - Hooks Rules in React

**Learning:** When attempting to add `useMemo` for performance, placing it inside a conditionally rendered block or an Immediately Invoked Function Expression (IIFE) within the render tree causes a fatal Rules of Hooks violation and crashes the component.
**Action:** Always declare hooks at the top level of the component body, never inside conditionals, loops, or inline functions returned during render.
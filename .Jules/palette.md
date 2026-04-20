
## 2024-04-10 - Tight Focus Rings on SVG Buttons
**Learning:** Adding `focus-visible:ring-2` to raw `<button>` elements wrapping purely `<svg>` children often creates a very tight, sometimes misaligned focus ring that clips into other elements or looks unpolished, because the button has no inherent padding or border box dimensions beyond the SVG.
**Action:** When adding focus states to icon-only buttons, consistently include `p-0.5` or `p-1` and `rounded` along with `focus-visible:ring-2` to ensure the focus ring has breathing room and looks intentionally styled.

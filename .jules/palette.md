## 2025-03-09 - Contextual ARIA labels for dynamic lists
**Learning:** Icon-only actions within list loops (like "remove player" from a squad) are confusing for screen readers if they only say "remove". Since multiple instances exist on the page, context is lost.
**Action:** Always inject contextual variables into ARIA labels for list items (e.g., `aria-label={\`Remove \${player.name} from squad\`}`) and accompany them with `focus-visible` styles with a slight padding (`p-0.5`) to ensure a clear focus ring isn't uncomfortably tight around SVG icons.

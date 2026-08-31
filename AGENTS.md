<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# UI components: search the registry before writing one

This project uses shadcn/ui. The registry gains components faster than any
model's training data, so **assume you do not know what it contains.** `Empty`,
`Item`, `Field`, `ButtonGroup`, `InputGroup`, `Spinner` and `Kbd` all postdate
most training cutoffs.

Before writing any UI primitive:

1. Search it — `npx shadcn search @shadcn <term>`, or use the shadcn MCP server
   configured in `.mcp.json`.
2. Read its API — `npx shadcn docs <name>`.
3. Install with the namespace — `npx shadcn add @shadcn/<name>`.

Prefer a registry component over hand-written markup. Hand-rolling is allowed
when nothing fits, but **the reason goes in a comment at the top of the
component**, naming what you considered and why it lost. Two real examples in
this repo:

- `src/components/bottom-nav.tsx` — the registry has no bottom navigation.
  `Tabs` is in-page content switching and manages `aria-selected` panels, not
  routed links.
- `src/components/calorie-ring.tsx` — the only registry option is `Chart`, which
  would pull in recharts to draw one circle.

Do not install a component you are not using in the same change. `npm run
check:ui` scans for hand-rolled markup that has a registry equivalent; run it
before committing UI work.

Component style is pinned to `radix-nova` in `components.json`. Verify a
component ships in that style before adding it, or it will arrive looking
subtly different from everything else.

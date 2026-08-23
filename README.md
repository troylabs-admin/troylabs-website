# TroyLabs website

USC TroyLabs' site — a 1:1 implementation of the 2026 Figma redesign. Astro + Tailwind v4, fully static.

```bash
pnpm install
pnpm dev            # http://localhost:4321
pnpm build          # static output in dist/
pnpm test:fidelity  # diff every page against Figma's own render (see below)
```

## How this repo is organised
| Path | Purpose |
|---|---|
| `src/pages/` | `index`, `build`, `demo`, `ignite` |
| `src/components/sections/<page>/` | one component per design section; Figma node ids in each header |
| `src/components/nav/`, `ui/`, `space/` | shared nav/footer, small UI pieces, illustration layer (planets, stars, glow) |
| `src/content/` | data that feeds sections (board members, speakers…) — edit copy here, not in components |
| `src/styles/global.css` | tokens, design-unit scale, measured type scale |
| `src/assets/space/` · `src/assets/figma/` | optimized designer masters · vectors/renders exported from Figma |
| `design/` | the design source: Figma dump, per-page specs, 1:1 reference renders ([design/README.md](design/README.md)) |
| `scripts/` | `figma:pull`, `figma:spec`, `figma:vectors`, `assets` — how everything in `design/` and `src/assets/` was produced |
| `tests/fidelity/` | visual diff against Figma |

Read [CLAUDE.md](CLAUDE.md) before changing layout — it explains the design-unit system every number in the code uses.

## Updating from Figma
1. Put a Figma personal access token in `.env` (`cp .env.example .env`).
2. `pnpm figma:pull && pnpm figma:spec` — refreshes `design/`.
3. Change the affected section component using the numbers in `design/spec/<page>.txt`.
4. `pnpm test:fidelity -g <page>` and look at `test-results/fidelity/<page>.diff.png`.

## Raw design assets
The designer's master PNGs (121 MB) live in Google Drive ("TL Website Assets"). They are not committed;
drop the folder at the repo root as `TL Website Assets/` and run `pnpm assets` to regenerate `src/assets/space/`.

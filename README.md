# Ruinan-Ding.github.io

Study Timer — a minimalist black/white monospace timer app, deployed to GitHub Pages at https://ruinan-ding.github.io.

Built with React 19, Vite 7, Tailwind CSS v4, and shadcn/ui. Package manager is pnpm.

## Development

```sh
pnpm install
pnpm dev        # dev server on http://localhost:3000
```

## Build & preview

```sh
pnpm build      # outputs static site to dist/
pnpm preview    # serve the production build locally
```

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to the `gh-pages` branch via GitHub Pages.

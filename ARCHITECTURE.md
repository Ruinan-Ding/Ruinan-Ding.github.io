# Portfolio - Angular 19 Technical Architecture

## Overview
High-trust, technical systems-engineering portfolio built with Angular 19, featuring standalone components, SCSS styling, and Tailwind CSS v4.

## Technology Stack
- **Angular 19**: Latest framework with standalone components
- **TypeScript**: Strict type safety
- **SCSS**: Component-level styling
- **Tailwind CSS v4**: Utility-first CSS with custom theming
- **JetBrains Mono**: Monospaced typography for technical aesthetic

## Project Structure

```
src/app/
├── core/                      # Singleton services and app-wide utilities
│   ├── guards/               # Route guards
│   ├── interceptors/         # HTTP interceptors
│   ├── models/               # Shared data models
│   └── services/             # Singleton services
│
├── features/                 # Feature modules
│   └── hero/                 # Landing hero section
│       ├── hero.component.ts
│       ├── hero.component.html
│       └── hero.component.scss
│
├── app.component.ts          # Root component
├── app.config.ts             # Application configuration
└── app.routes.ts             # Routing configuration
```

## Design System

### Color Theme: void-black
A dark, high-contrast theme designed for technical systems:
- `--color-void-black`: #0a0a0a (primary background)
- `--color-void-black-50` through `--color-void-black-900`: Dark gradients

### Typography
Monospaced fonts for a technical, engineering-focused aesthetic:
- Primary: JetBrains Mono
- Fallbacks: Fira Code, Consolas, Monaco, Courier New

## Development

### Build
```bash
npm run build
```

### Serve
```bash
npm start
```

### Test
```bash
npm test
```

## Code Standards
- Follows official Angular Style Guide
- Standalone components architecture
- Minimal commenting (code should be self-documenting)
- Enterprise-ready structure with core/features separation

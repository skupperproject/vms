# VMS Console

A React web application built with IBM Carbon Design System, featuring a hierarchical navigation structure for managing network and composition resources.

This package lives in the **skupper-X** monorepo at **`components/console`**. In the pnpm workspace it is named **`vms-console`** (`package.json`).

## Features

- **Carbon Design System**: Professional UI components with IBM's design language
- **Hierarchical Navigation**: Organized menu structure with expandable sections
- **Responsive Layout**: Mobile-friendly design using Carbon's grid system
- **Custom Theming**: Configurable Carbon theme (currently using g100 dark theme)
- **React Router**: Clean URL structure with nested routes

## Project Structure

```
components/console/
├── public/                      # Static assets
├── src/
│   ├── components/
│   │   ├── Header/              # Application header with Carbon UI Shell
│   │   ├── Navigation/          # Side navigation with hierarchical menu
│   │   └── OwnerGroupSelect/    # Owner group selector
│   ├── pages/
│   │   ├── Dashboard/           # Main dashboard page
│   │   ├── Backbones/           # Backbone configurations
│   │   ├── VANs/                # Virtual Application Networks
│   │   └── TLS/                 # TLS certificates
│   ├── tools/
│   │   └── watch.js             # Watch code for live UI updates
│   ├── theme/                   # Custom Carbon theme configuration
│   ├── App.jsx                  # Main application component and routes
│   ├── App.simple.jsx
│   ├── App.test.jsx
│   ├── index.jsx                # Application entry point
│   └── index.css
├── eslint.config.js
├── index.html                   # Vite HTML entry
├── vite.config.js
├── package.json
└── README.md
```

Production builds emit static assets to **`dist/`** (Vite `outDir`).

## Navigation structure

- **Dashboard** — Main overview page
- **Backbones** — Backbone configurations, sites, deployment
- **VANs** — Virtual application networks
- **TLS** — TLS certificate-related pages

## Getting Started

### Prerequisites

- **Node.js** (current LTS recommended)
- **pnpm** — this monorepo uses pnpm workspaces; use pnpm, not npm or yarn, for installs at the repo root

### Installation

From the **repository root**:

```bash
pnpm install
pnpm --filter vms-console build
```

`pnpm install` pulls in all workspace packages. `pnpm --filter vms-console build` runs Vite and writes the static bundle to **`components/console/dist`**.

### Running the console (management controller)

Run the **management controller** from **`components/management-controller`**. Its HTTP server loads [ViteExpress](https://github.com/szymmis/vite-express) so the same process serves the UI and the API:

```bash
cd components/management-controller
node index.js
```

**`NODE_ENV`** selects how the UI is served:

- **`production`** — serve the **prebuilt static files** from `components/console/dist`. Run `pnpm --filter vms-console build` whenever you change the console so `dist` is up to date.
- **Anything else** (e.g. **`development`** or unset) — run the **Vite dev server** inside the controller process: **HMR** and live reload over WebSockets, while API routes still go through the same Express app.

**NOTE:** Running `pnpm dev` in `components/console` starts an isolated Vite dev server without the management API, so the UI **cannot talk to the backend** and will appear broken.

### Lint

```bash
pnpm --filter vms-console lint
```

## Dependencies

- **react** & **react-dom**: Core React libraries
- **react-router-dom**: Client-side routing
- **@carbon/react**: Carbon Design System React components
- **@carbon/icons-react**: Carbon icon library
- **sass**: CSS preprocessor for Carbon styles
- **vite**: Dev server and production bundling

## Customization

### Theme Configuration

The Carbon theme can be customized in `src/theme/theme.scss`. Currently using the g100 (dark) theme. Available themes:
- `white` - Light theme
- `g10` - Light gray theme
- `g90` - Dark gray theme
- `g100` - Dark theme (current)

To change the theme, modify the `$theme` parameter in `src/theme/theme.scss`:
```scss
@use '@carbon/react/scss/theme' with (
  $theme: themes.$white  // Change to desired theme
);
```

### Adding New Pages

1. Create a new component in `src/pages/`
2. Import and add a route in `src/App.jsx`
3. Add navigation link in `src/components/Navigation/Navigation.jsx`

## Development Status

All core features are implemented:
- ✅ Project initialization
- ✅ Carbon Design System integration
- ✅ Navigation structure
- ✅ All page components with blank panels
- ✅ Routing configuration
- ✅ Custom theme setup
- ✅ Responsive layout

## Future Development

Each page includes a blank panel ready for content development:
- Dashboard metrics and widgets
- Network configuration interfaces
- TLS certificate management
- Composition library browser
- Application deployment tools

## Browser Support

Supports all modern browsers:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

This project is part of the VMS Console application.

## Contributing

When adding new features:
1. Follow Carbon Design System guidelines
2. Maintain consistent component structure
3. Update navigation as needed
4. Test responsive behavior
5. Update this README

## Resources

- [Carbon Design System](https://carbondesignsystem.com/)
- [Carbon React Components](https://react.carbondesignsystem.com/)
- [React Router Documentation](https://reactrouter.com/)
- [Vite](https://vite.dev/)

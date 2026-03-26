# VMS Console

A React web application built with IBM Carbon Design System, featuring a hierarchical navigation structure for managing network and composition resources.

## Features

- **Carbon Design System**: Professional UI components with IBM's design language
- **Hierarchical Navigation**: Organized menu structure with expandable sections
- **Responsive Layout**: Mobile-friendly design using Carbon's grid system
- **Custom Theming**: Configurable Carbon theme (currently using g100 dark theme)
- **React Router**: Clean URL structure with nested routes

## Project Structure

```
console/
├── public/                 # Static assets
├── src/
│   ├── components/
│   │   ├── Header/        # Application header with Carbon UI Shell
│   │   └── Navigation/    # Side navigation with hierarchical menu
│   ├── pages/
│   │   ├── Dashboard/     # Main dashboard page
│   │   ├── Network/       # Network management pages
│   │   │   ├── Backbones/ # Backbone configurations
│   │   │   ├── VANs/      # Virtual Area Networks
│   │   │   └── TLS/       # TLS certificates
│   │   └── Compose/       # Composition pages
│   │       ├── Library/   # Template library
│   │       └── Applications/ # Application management
│   ├── theme/             # Custom Carbon theme configuration
│   ├── App.js             # Main application component
│   └── index.js           # Application entry point
├── package.json
└── README.md
```

## Navigation Structure

- **Dashboard** - Main overview page
- **Network** - Network management
  - Backbones - Network backbone configurations
  - VANs - Virtual Area Networks
  - TLS - Transport Layer Security
- **Compose** - Application composition
  - Library - Template library
  - Applications - Application management

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository or navigate to the project directory:
   ```bash
   cd console
   ```

2. Install dependencies (already done):
   ```bash
   npm install
   ```

### Running the Application

Start the development server:
```bash
npm start
```

The application will open in your browser at [http://localhost:3000](http://localhost:3000).

### Building for Production

Create an optimized production build:
```bash
npm run build
```

The build files will be in the `build/` directory.

## Dependencies

- **react** & **react-dom**: Core React libraries
- **react-router-dom**: Client-side routing
- **@carbon/react**: Carbon Design System React components
- **@carbon/icons-react**: Carbon icon library
- **sass**: CSS preprocessor for Carbon styles

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
2. Import and add a route in `src/App.js`
3. Add navigation link in `src/components/Navigation/Navigation.js`

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
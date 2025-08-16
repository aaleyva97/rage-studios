# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RageStudios is an Angular v20 application with Server-Side Rendering (SSR) support, built using:
- **Angular CLI**: Latest v20 with zoneless change detection
- **UI Framework**: PrimeNG with Aura theme and TailwindCSS
- **Backend**: Supabase integration for data management
- **Package Manager**: Uses Bun (bun.lockb present)
- **Styling**: SCSS with TailwindCSS and PrimeUI plugin

## Development Commands

### Core Development
```bash
# Start development server (default port 4200)
ng serve

# Build for production
ng build

# Build and watch for changes during development
ng build --watch --configuration development

# Run unit tests with Karma
ng test

# Start development server with ng serve shortcut
npm start
```

### SSR Commands
```bash
# Serve SSR build
npm run serve:ssr:rage-studios
```

### Code Generation
```bash
# Generate new component
ng generate component component-name

# Generate other schematics
ng generate --help
```

## Architecture

### Project Structure
- **Core Architecture**: Feature-based with core/shared separation
- **SSR Configuration**: Full SSR setup with hydration and event replay
- **State Management**: Service-based architecture with Supabase integration

### Key Directories
```
src/app/
├── core/                    # App-wide services, guards, interceptors
│   ├── constants/          # Application constants
│   ├── functions/          # Utility functions
│   ├── guards/             # Route guards
│   ├── interceptors/       # HTTP interceptors
│   └── services/           # Core services (including SupabaseService)
├── features/               # Feature modules
│   ├── account/           # User account functionality
│   └── landing/           # Landing page feature
│       ├── components/    # Feature-specific components
│       ├── models/        # Data models
│       ├── pages/         # Page components
│       └── services/      # Feature services
└── shared/                # Shared components, directives, pipes
    ├── components/
    ├── directives/
    └── pipes/
```

## Development Standards

### Language and Naming Conventions
- **ALL CODE MUST BE IN ENGLISH**: Folders, files, variables, functions, classes, comments
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces
- Use kebab-case for file names and folder names

### Modern Angular Practices (v20+)
- **Use New Control Flow**: Always use `@if`, `@for`, `@switch` instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- **Signals-First Approach**: Prefer signals over traditional reactive patterns where applicable
- **Modern Input/Output**: ALWAYS use `input()` and `output()` signals instead of `@Input()` and `@Output()` decorators
- **Standalone Components**: Use standalone components by default
- **Zoneless Change Detection**: Already configured in app.config.ts
- **Specific Imports Only**: NEVER import CommonModule in standalone components. Import only specific modules needed (e.g., NgIf, NgFor, etc.)

### Mobile-First Development
- **Design mobile-first**: Start with mobile layouts and scale up
- **Responsive breakpoints**: Use TailwindCSS breakpoints (sm:, md:, lg:, xl:, 2xl:)
- **Touch-friendly interfaces**: Ensure adequate touch targets (44px minimum)

### Styling Hierarchy
1. **PrimeNG components ALWAYS**: Use PrimeNG components for ALL UI elements (buttons, menus, etc.)
2. **TailwindCSS classes second**: Use utility classes for layout and spacing
3. **SCSS only when necessary**: For complex custom styles that can't be achieved with utilities
4. **NEVER use @apply in SCSS**: Use regular CSS properties instead of @apply directives

### HTML and SEO Standards
- **Semantic HTML**: Use proper semantic elements (`<article>`, `<section>`, `<nav>`, `<header>`, `<footer>`, etc.)
- **SEO Optimization**: 
  - Proper heading hierarchy (h1 → h2 → h3)
  - Meta tags and structured data
  - Alt attributes for images
  - Descriptive link text
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

## Technology Stack Details
- **Angular 20**: Uses latest features including zoneless change detection and new control flow
- **PrimeNG**: UI component library with custom theming
- **TailwindCSS**: Utility-first CSS with PrimeUI plugin integration
- **Supabase**: Backend-as-a-Service for authentication and database
- **TypeScript**: Strict configuration across the project

## Code Examples

### Modern Angular Control Flow
```typescript
// ✅ Correct - New control flow
@if (isLoading) {
  <app-loading-spinner />
} @else if (hasError) {
  <app-error-message />
} @else {
  @for (item of items; track item.id) {
    <app-item-card [item]="item" />
  }
}
```

### Mobile-First Styling
```html
<!-- ✅ Correct - Mobile-first with TailwindCSS -->
<div class="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- Content -->
</div>
```

### Modern Input/Output Signals
```typescript
// ✅ Correct - Modern signals-based approach
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-my-component',
  template: '...'
})
export class MyComponent {
  // Input signals
  data = input<string>('');
  config = input.required<Config>();
  
  // Output signals
  valueChange = output<string>();
  action = output<void>();
  
  onAction() {
    this.action.emit();
  }
}

// ❌ Avoid - Legacy decorators
// @Input() data: string = '';
// @Output() valueChange = new EventEmitter<string>();
```

### Semantic HTML
```html
<!-- ✅ Correct - Semantic and SEO-friendly -->
<article class="bg-white rounded-lg shadow-md p-6">
  <header>
    <h2 class="text-xl font-bold text-gray-900">Article Title</h2>
    <time datetime="2024-01-01" class="text-sm text-gray-600">January 1, 2024</time>
  </header>
  <section class="mt-4">
    <p class="text-gray-700">Article content...</p>
  </section>
</article>
```
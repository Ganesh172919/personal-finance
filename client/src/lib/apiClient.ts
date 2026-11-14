// Re-exports all core API methods, modules, and domain services.
// Provides a unified root entry point for legacy and existing API consumers.
// Simplifies import paths across client components accessing backend endpoints.
export * from "./api";

// Exposes public content API interfaces for blog posts and growth stories.
// Supplies educational media fetching helpers to client reader interfaces.
// Ensures complete export coverage for content-driven application views.
export * from "./api/content";


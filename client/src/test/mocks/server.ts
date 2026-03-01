import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW server instance for Node.js (vitest / jsdom).
 * Intercepts fetch requests during tests and responds with mock data.
 */
export const server = setupServer(...handlers);

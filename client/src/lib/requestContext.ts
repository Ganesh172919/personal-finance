// A monotonic marker keeps retired requests from acting on a newer session,
// including an A -> B -> A workspace transition. No identifiers are stored.
let revision = 0;

// Retrieves the current monotonically increasing client request context revision number.
// Informs in-flight network requests whether the workspace session context has shifted.
// Prevents obsolete asynchronous callback responses from overwriting newer session states.
export const getRequestContextRevision = () => revision;

// Increments the global request context generation counter to retire active requests.
// Triggered whenever the user switches organizations, workspaces, or active accounts.
// Invalidates lingering promises and background effects belonging to previous contexts.
export const retireRequestContext = () => { revision += 1; };

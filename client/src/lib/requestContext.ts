// A monotonic marker keeps retired requests from acting on a newer session,
// including an A -> B -> A workspace transition. No identifiers are stored.
let revision = 0;
export const getRequestContextRevision = () => revision;
export const retireRequestContext = () => { revision += 1; };

export function requireFixtureDatabase(env: NodeJS.ProcessEnv = process.env): string {
  const uri = env.MOCK_CONTENT_MONGO_URI?.trim();
  if (env.NODE_ENV === "production" || !uri || !/^mongodb:\/\/127\.0\.0\.1(?::\d{1,5})?\/finwise-fixtures$/.test(uri)) {
    throw new Error("Sample content requires MOCK_CONTENT_MONGO_URI pointing to the local finwise-fixtures database.");
  }
  return uri;
}

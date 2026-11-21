const tokenRoute = /^(\/api(?:\/v1)?\/(?:tasks\/webhook|workflows\/webhook|newsletter\/unsubscribe|public\/shares\/financial-story))\/[^/]+/i;

export function safeHttpPath(url: string): string {
  return (url.split("?", 1)[0] || "/").replace(tokenRoute, "$1/:token");
}

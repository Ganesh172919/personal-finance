import type { Components } from "react-markdown";

export const modelMarkdownComponents = {
  // Display the description without fetching a URL supplied by the model.
  img: ({ alt }) => alt ? <span>{alt}</span> : null,
  a: ({ children, href, title }) => (
    <a href={href} title={title} referrerPolicy="no-referrer" rel="noreferrer">{children}</a>
  ),
} satisfies Components;

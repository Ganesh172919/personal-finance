# FinWise — Dashboard, Theming, and Media

This guide documents the current dashboard structure, the dual light/dark theme system, and the media-loading rules used by blogs and growth stories.

## Dashboard intent

The dashboard is intentionally focused on the highest-signal information:

- Hero area with quick launch actions
- AI command bar
- Financial vitals
- AI-generated insights

Lower-priority operational widgets were removed from the main dashboard surface to reduce noise and keep the page aligned with the AI-first workspace.

Main file:

- `client/src/pages/Dashboard.tsx`

## Dashboard building blocks

### Financial vitals

`client/src/components/FinancialVitals.tsx`

Responsibilities:

- Query dashboard summary data
- Render four key financial metrics
- Present metrics in the monochrome card system

### AI-generated insights

`client/src/components/ActionableInsights.tsx`

Responsibilities:

- Fetch user insights
- Render insight priority and action buttons
- Open detail modal for deeper inspection

The dashboard keeps this component central because it is the main "what should I do next?" surface.

## Theme model

The project now uses a dark-first monochrome token system.

Primary theme files:

- `client/src/index.css`
- `client/src/components/ThemeProvider.tsx`

Behavior:

- The app boots in dark mode
- The provider keeps the root element in `dark`
- Light mode is intentionally disabled for now
- Design tokens use black, white, and grayscale values instead of colorful accents

If light mode returns later, it should be implemented deliberately instead of partially re-enabling the previous palette.

## Media loading rules

Media normalization is centralized in:

- `client/src/lib/media.ts`

Helpers:

- `resolveMediaUrl`
- `resolveBlogCoverImage`
- `resolveGrowthStoryCoverImage`
- `resolveAuthorAvatar`

What these helpers do:

- accept absolute URLs
- accept data/blob URLs
- preserve root-relative paths
- convert Mongo-style media ids to `/api/v1/media/:id`
- provide safe fallback images for missing content

## Image rendering behavior

Image rendering is handled by:

- `client/src/components/LazyImage.tsx`

Behavior:

- lazy-load images with `IntersectionObserver`
- support a placeholder image
- retry once with a fallback source
- show a neutral fallback surface if loading still fails

This is used in blog and growth-story UI so missing or broken images fail gracefully instead of collapsing the layout.

## Content pages using media helpers

Blog UI:

- `client/src/components/BlogCard.tsx`
- `client/src/pages/BlogDetail.tsx`

Growth-story UI:

- `client/src/components/GrowthStoryCard.tsx`
- `client/src/pages/GrowthStoryDetail.tsx`

## Server-side support

External images are allowed by the Express content security policy in:

- `server/src/app.ts`

The image CSP now allows:

- `self`
- `data:`
- `blob:`
- `https:`
- `http:`

Without that, external blog and growth-story images may resolve correctly in the client but still be blocked by the browser.

## Realtime updates

Dashboard freshness depends on:

- `client/src/hooks/useRealtimeEvents.ts`

The hook listens to server-sent domain events and invalidates query keys for:

- transactions
- dashboard summary
- analytics
- profile summaries
- portfolio summary
- receipts
- tasks
- workflow runs
- insights
- activity feed

If a dashboard card looks stale after a user action, this file is the first place to inspect.

## Recommended maintenance rules

- Keep the dashboard focused on summary and decision support, not every operational widget.
- Prefer the shared media helpers instead of embedding raw image URL logic in page components.
- Route new theme changes through `index.css` tokens first, then component-level overrides only when needed.
- Extend realtime invalidation centrally in `useRealtimeEvents.ts` instead of scattering manual refetch logic across pages.

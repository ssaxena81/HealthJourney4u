// [2024-08-01] COMMENT: This file acts as a server-side redirect to resolve a routing conflict.
// [2024-08-01] COMMENT: Next.js can be confused by having two root pages: `src/app/page.tsx` and `src/app/(app)/page.tsx`.
// [2024-08-01] COMMENT: While `src/app/page.tsx` handles the initial redirect for logged-in users, this file acts as a failsafe.
// [2024-08-01] COMMENT: Any authenticated user somehow routed here will be immediately and correctly redirected to the dashboard, preventing a 404 error.
import { redirect } from 'next/navigation';

export default function AppRootPage() {
  // This server-side redirect is the most reliable way to handle this routing edge case.
  redirect('/dashboard');
}

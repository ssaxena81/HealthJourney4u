// [2024-08-01] COMMENT: This file's redirect logic is being disabled to resolve a routing conflict with the main `src/app/page.tsx`.
// [2024-08-01] COMMENT: Having two redirecting pages for the same URL path ('/') was causing a 404 error. The main `src/app/page.tsx` will now be the single source of truth for handling this route.
// [2024-08-01] COMMENT: This component now returns null to act as a 'do-nothing' page, effectively removing its conflicting behavior while keeping the file for structural integrity.

// [2024-08-01] COMMENT: The original redirect import is commented out.
// import { redirect } from 'next/navigation';

export default function AppRootPage() {
  // [2024-08-01] COMMENT: The original redirect logic has been commented out to prevent routing conflicts.
  /*
  // This server-side redirect is the most reliable way to handle this routing edge case.
  redirect('/dashboard');
  */

  // [2024-08-01] COMMENT: The original comment block explaining the purpose of this file is preserved below.
  /*
  // [2024-08-01] COMMENT: This file acts as a server-side redirect to resolve a routing conflict.
  // [2024-08-01] COMMENT: Next.js can be confused by having two root pages: `src/app/page.tsx` and `src/app/(app)/page.tsx`.
  // [2024-08-01] COMMENT: While `src/app/page.tsx` handles the initial redirect for logged-in users, this file acts as a failsafe.
  // [2024-08-01] COMMENT: Any authenticated user somehow routed here will be immediately and correctly redirected to the dashboard, preventing a 404 error.
  */
  
  // [2024-08-01] COMMENT: Returning null makes this page render nothing, resolving the ambiguity for the Next.js router.
  return null;
}

// [2024-08-01] COMMENT: The original client-side component comment has been preserved.
/*
'use client';
*/

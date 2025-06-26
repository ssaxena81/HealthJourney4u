// [2025-06-26] COMMENT: This file is being created as a server-side redirect.
// [2025-06-26] COMMENT: The purpose is to resolve a routing conflict with the main public landing page at `src/app/page.tsx`.
// [2025-06-26] COMMENT: Any authenticated user landing on the root path `/` within this route group will be immediately and correctly redirected to the dashboard.
import { redirect } from 'next/navigation';

export default function AppRootPage() {
  // [2025-06-26] COMMENT: The redirect function from Next.js provides a clean, server-side redirect, preventing the 404 error.
  redirect('/dashboard');
}

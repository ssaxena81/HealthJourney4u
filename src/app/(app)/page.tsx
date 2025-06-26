// [2024-08-01] ADD: Importing the redirect function from next/navigation for server-side redirection.
import { redirect } from 'next/navigation';

// [2024-08-01] UPDATE: This component is now a simple, server-side redirector.
// [2024-08-01] ADD: This ensures that any authenticated user landing on the root path is immediately sent to the dashboard.
// [2024-08-01] ADD: This is more robust than a client-side redirect and resolves routing conflicts definitively.
export default function AuthenticatedRootPage() {
  // [2024-08-01] ADD: Perform an immediate server-side redirect to the dashboard.
  redirect('/dashboard');

  // [2024-08-01] DELETE: All previous client-side logic (hooks, useEffect, JSX) has been removed.
  // [2024-08-01] ADD: Returning null as the redirect will happen before any rendering.
  return null;
}

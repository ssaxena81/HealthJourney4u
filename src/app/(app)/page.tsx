
import { redirect } from 'next/navigation';

// This is a server component that immediately redirects any authenticated user
// who happens to land on the root URL ('/') to their dashboard.
// This resolves the routing conflict with the public-facing src/app/page.tsx.
export default function AuthenticatedRootRedirectPage() {
  redirect('/dashboard');
  // This return is technically unreachable but required by React's component signature.
  return null;
}


import { redirect } from 'next/navigation';

// This is a server component that immediately redirects any authenticated user
// who happens to land on the root URL ('/') inside the (app) group to their dashboard.
// This resolves routing conflicts by ensuring this path doesn't try to render a page.
export default function AuthenticatedRootRedirectPage() {
  redirect('/dashboard');
}


import { redirect } from 'next/navigation';

// This page acts as a server-side redirect.
// If an authenticated user ever lands on the root path ('/'), which this file handles
// within the (app) route group, they will be immediately redirected to the dashboard.
// This resolves the routing conflict with the public src/app/page.tsx.
export default function AuthenticatedRootPage() {
  redirect('/dashboard');
}

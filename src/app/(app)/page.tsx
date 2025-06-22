
import { redirect } from 'next/navigation';

export default function AuthenticatedRootPage() {
  // This page exists to resolve a routing conflict with the public-facing home page.
  // It immediately redirects any authenticated traffic targeting the root URL ('/')
  // to the main user dashboard, which is the correct destination.
  redirect('/dashboard');
}

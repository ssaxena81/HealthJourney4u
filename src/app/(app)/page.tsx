
import { redirect } from 'next/navigation';

export default function AuthenticatedRootPage() {
  // This page is for users who are already logged in and land on the root URL.
  // We redirect them to their dashboard immediately.
  redirect('/dashboard');
}

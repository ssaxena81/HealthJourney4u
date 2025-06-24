
import { redirect } from 'next/navigation';

export default function AuthenticatedRootPage() {
  redirect('/dashboard');
}

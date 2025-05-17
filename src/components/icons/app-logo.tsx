import { HeartPulse } from 'lucide-react';

export function AppLogo() {
  return (
    <div className="flex items-center gap-2 text-primary" aria-label="Health Timeline">
      <HeartPulse className="h-7 w-7" />
      <h1 className="text-xl font-semibold tracking-tight">Health Timeline</h1>
    </div>
  );
}

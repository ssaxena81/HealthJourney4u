import HealthDashboard from '@/components/health/health-dashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Health Timeline',
    description: 'A chronological view of your health records and events.',
};

export default function TimelinePage() {
    return <HealthDashboard />;
}

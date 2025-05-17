import type { HealthMetricType } from '@/types';
import {
  Footprints,
  PersonStanding,
  Wind,
  HeartPulse,
  TestTube2,
  CalendarDays,
  Pill,
  ClipboardList,
  Activity,
  Shield,
  LucideProps,
  FileText,
} from 'lucide-react';

interface HealthIconProps extends LucideProps {
  type: HealthMetricType | 'quest' | 'uhc' | 'default';
}

export function HealthIcon({ type, ...props }: HealthIconProps) {
  switch (type) {
    case 'walking':
      return <Footprints {...props} />;
    case 'standing':
      return <PersonStanding {...props} />;
    case 'breathing':
      return <Wind {...props} />;
    case 'pulse':
      return <HeartPulse {...props} />;
    case 'lipidPanel':
      return <TestTube2 {...props} />;
    case 'appointment':
      return <CalendarDays {...props} />;
    case 'medication':
      return <Pill {...props} />;
    case 'condition':
      return <ClipboardList {...props} />;
    case 'quest':
      return <Activity {...props} />; // Placeholder for QUEST
    case 'uhc':
      return <Shield {...props} />; // Placeholder for UHC
    default:
      return <FileText {...props} />;
  }
}


import type { HealthEntry, LipidPanelData } from '@/types';
import { formatISO, subDays, subHours, subMonths } from 'date-fns';

const now = new Date();

const createLipidPanel = (total: number, ldl: number, hdl: number, trig: number): LipidPanelData => ({
  totalCholesterol: total,
  ldl,
  hdl,
  triglycerides: trig,
});

export const mockHealthEntries: HealthEntry[] = [
  {
    id: '1',
    date: formatISO(subHours(now, 2)),
    type: 'pulse',
    title: 'Resting Pulse',
    value: 65,
    unit: 'bpm',
    notes: 'Measured after waking up.',
    source: 'manual',
  },
  {
    id: '2',
    date: formatISO(subDays(now, 1)),
    type: 'walking',
    title: 'Morning Walk',
    value: 5000,
    unit: 'steps',
    notes: 'Walked around the park.',
    source: 'manual',
  },
  {
    id: '3',
    date: formatISO(subDays(now, 2)),
    type: 'appointment',
    title: 'Annual Check-up',
    doctor: 'Dr. Emily Carter',
    location: 'City Clinic',
    reason: 'Routine annual physical exam.',
    source: 'uhc',
    visitNotes: 'Patient is in good health. Discussed diet and exercise. Blood pressure normal. All vitals stable. Recommended continuing current lifestyle. Follow up in one year or as needed.',
  },
  {
    id: '4',
    date: formatISO(subDays(now, 7)),
    type: 'lipidPanel',
    title: 'Lipid Panel Results',
    value: createLipidPanel(180, 100, 50, 150),
    notes: 'Fasting blood sample taken.',
    source: 'quest',
  },
  {
    id: '5',
    date: formatISO(subDays(now, 10)),
    type: 'standing',
    title: 'Work Standing Desk',
    value: 2,
    unit: 'hours',
    notes: 'Used standing desk for a portion of the workday.',
    source: 'manual',
  },
  {
    id: '6',
    date: formatISO(subDays(now, 15)),
    type: 'breathing',
    title: 'Morning Breathing Exercise',
    value: 12,
    unit: 'breaths/min',
    quality: 'normal',
    notes: 'Deep breathing exercises for 5 minutes.',
    source: 'manual',
  },
  {
    id: '7',
    date: formatISO(subMonths(now, 1)),
    type: 'medication',
    title: 'Vitamin D Supplement', // This will be overridden by medicationName
    medicationName: 'Vitamin D3 2000 IU',
    dosage: '1 capsule',
    frequency: 'Once daily',
    notes: 'Started on recommendation.',
    source: 'manual',
  },
  {
    id: '8',
    date: formatISO(subMonths(now, 2)),
    type: 'condition',
    title: 'Seasonal Allergies', // This will be overridden by conditionName
    conditionName: 'Seasonal Allergic Rhinitis',
    diagnosisDate: formatISO(subMonths(now, 24)), // Diagnosed 2 years ago
    status: 'active',
    notes: 'Symptoms flare up during spring.',
    source: 'uhc',
  },
  {
    id: '9',
    date: formatISO(subMonths(now, 3)),
    type: 'appointment',
    title: 'Dentist Appointment',
    doctor: 'Dr. Alan Grant',
    location: 'Dental Care Center',
    reason: 'Routine cleaning and check-up.',
    visitNotes: 'No cavities found. Gums are healthy. Advised to continue regular flossing.',
    source: 'manual',
  },
  {
    id: '10',
    date: formatISO(subDays(now, 5)),
    type: 'pulse',
    title: 'Post-Workout Pulse',
    value: 120,
    unit: 'bpm',
    notes: 'Measured 5 minutes after moderate intensity cardio.',
    source: 'manual',
  },
];

// Ensure data is sorted by date descending for timeline view
mockHealthEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

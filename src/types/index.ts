
export type HealthMetricCategory = 'vital' | 'lab' | 'activity' | 'event' | 'medication' | 'condition';

export type HealthMetricType =
  | 'walking'
  | 'standing'
  | 'breathing'
  | 'pulse'
  | 'lipidPanel'
  | 'appointment'
  | 'medication'
  | 'condition';

export interface LipidPanelData {
  totalCholesterol: number; // mg/dL
  ldl: number; // mg/dL
  hdl: number; // mg/dL
  triglycerides: number; // mg/dL
}

export interface BaseHealthEntry {
  id: string;
  date: string; // ISO 8601 format
  type: HealthMetricType;
  title: string;
  notes?: string;
  source?: 'manual' | 'quest' | 'uhc'; // To represent integrations
}

export interface WalkingEntry extends BaseHealthEntry {
  type: 'walking';
  value: number; // steps or distance
  unit: 'steps' | 'km' | 'miles';
}

export interface StandingEntry extends BaseHealthEntry {
  type: 'standing';
  value: number; // duration
  unit: 'minutes' | 'hours';
}

export interface BreathingEntry extends BaseHealthEntry {
  type: 'breathing';
  value: number; // rate
  unit: 'breaths/min';
  quality?: string; // e.g., 'normal', 'labored'
}

export interface PulseEntry extends BaseHealthEntry {
  type: 'pulse';
  value: number; // bpm
  unit: 'bpm';
}

export interface LipidPanelEntry extends BaseHealthEntry {
  type: 'lipidPanel';
  value: LipidPanelData;
}

export interface AppointmentEntry extends BaseHealthEntry {
  type: 'appointment';
  doctor?: string;
  location?: string;
  reason?: string;
  visitNotes?: string; // For UHC deep dive
}

export interface MedicationEntry extends BaseHealthEntry {
  type: 'medication';
  medicationName: string; // Overrides title for specific use
  dosage: string;
  frequency: string;
}

export interface ConditionEntry extends BaseHealthEntry {
  type: 'condition';
  conditionName: string; // Overrides title
  diagnosisDate?: string; // ISO 8601
  status?: 'active' | 'resolved' | 'chronic';
}

export type HealthEntry =
  | WalkingEntry
  | StandingEntry
  | BreathingEntry
  | PulseEntry
  | LipidPanelEntry
  | AppointmentEntry
  | MedicationEntry
  | ConditionEntry;

export const healthMetricCategories: HealthMetricType[] = [
  'walking',
  'standing',
  'breathing',
  'pulse',
  'lipidPanel',
  'appointment',
  'medication',
  'condition',
];

export const healthMetricDisplayNames: Record<HealthMetricType, string> = {
  walking: 'Walking',
  standing: 'Standing',
  breathing: 'Breathing',
  pulse: 'Pulse',
  lipidPanel: 'LIPID Panel',
  appointment: 'Appointment',
  medication: 'Medication',
  condition: 'Condition',
};

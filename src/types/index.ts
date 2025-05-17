
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
  lipidPanel: 'Lipid Panel',
  appointment: 'Appointment',
  medication: 'Medication',
  condition: 'Condition',
};

// --- New Types for Profile and Authentication ---

export type SubscriptionTier = 'free' | 'silver' | 'gold' | 'platinum';

export interface UserProfile {
  id: string; // Firebase Auth UID
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  dateOfBirth?: string; // ISO 8601
  email: string; // Login ID, should match Auth email
  cellPhone?: string;
  mfaMethod?: 'email' | 'sms'; // For sending codes

  lastPasswordChangeDate: string; // ISO 8601
  acceptedLatestTerms: boolean;
  termsVersionAccepted?: string; // To track specific T&C version

  subscriptionTier: SubscriptionTier;
  paymentDetails?: any; // Placeholder for payment info

  // Part 2: Fitness Connections
  connectedFitnessApps: Array<{
    id: string; // e.g., 'fitbit', 'strava'
    name: string; // e.g., 'Fitbit'
    // OAuth tokens or connection details would be stored securely, likely not directly in this profile doc for client access
    connectedAt: string; // ISO 8601
  }>;

  // Part 3: Diagnostics Connections
  connectedDiagnosticsServices: Array<{
    id: string; // e.g., 'quest', 'labcorp'
    name: string; // e.g., 'Quest Diagnostics'
    connectedAt: string; // ISO 8601
  }>;

  // Part 4: Insurance Connections
  connectedInsuranceProviders: Array<{
    id: string; // Internal ID or insurer's API identifier
    name: string; // e.g., 'United Healthcare'
    memberId: string;
    groupId?: string;
    connectedAt: string; // ISO 8601
  }>;
}

export const subscriptionTiers: SubscriptionTier[] = ['free', 'silver', 'gold', 'platinum'];

export interface TierFeatureComparison {
  feature: string;
  free: string | boolean;
  silver: string | boolean;
  gold: string | boolean;
  platinum: string | boolean;
}

// Example data for "Compare Plans"
export const featureComparisonData: TierFeatureComparison[] = [
  { feature: "Fitness App Connections", free: "1", silver: "2", gold: "3", platinum: "All" },
  { feature: "Diagnostic Service Connections", free: "None", silver: "None", gold: "1", platinum: "All" },
  { feature: "Insurance Provider Connections", free: "1", silver: "2", gold: "3", platinum: "All" },
  { feature: "Advanced Data Analysis", free: false, silver: true, gold: true, platinum: true },
  { feature: "Detailed Reports", free: "Basic", silver: "Standard", gold: "Advanced", platinum: "Premium" },
];

// For admin-managed dropdowns (mocked for now)
export interface SelectableService {
  id: string;
  name: string;
}

export const mockFitnessApps: SelectableService[] = [
  { id: 'apple_health', name: 'Apple Health' },
  { id: 'fitbit', name: 'Fitbit' },
  { id: 'nike_run_club', name: 'Nike Run Club' },
  { id: 'myfitnesspal', name: 'MyFitnessPal' },
  { id: 'fiton', name: 'FitOn Workouts' },
  { id: 'strava', name: 'Strava' },
];

export const mockDiagnosticServices: SelectableService[] = [
  { id: 'quest', name: 'Quest Diagnostics' },
  { id: 'labcorp', name: 'LabCorp of America' },
  { id: 'sonic', name: 'Sonic Healthcare' },
];

export const mockInsuranceProviders: SelectableService[] = [
  { id: 'uhc', name: 'United Healthcare' },
  { id: 'aetna', name: 'Aetna' },
  { id: 'cigna', name: 'Cigna' },
  { id: 'blueshield', name: 'Blue Cross Blue Shield' },
];

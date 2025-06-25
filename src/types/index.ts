
import { z } from 'zod';

// --- Password Policy ---
export const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
  .regex(/[0-9]/, { message: "Password must contain at least one number." })
  .regex(/[^A-Za-z0-9]/, { message: "Password must contain at least one special character." });


// --- Standardized Activity Data Types ---
export enum NormalizedActivityType {
  Walking = 'walking',
  Running = 'running',
  Hiking = 'hiking',
  Swimming = 'swimming',
  Cycling = 'cycling',
  Workout = 'workout', // General workout category
  Other = 'other',
}

export const normalizedActivityTypeDisplayNames: Record<NormalizedActivityType, string> = {
  [NormalizedActivityType.Walking]: 'Walking',
  [NormalizedActivityType.Running]: 'Running',
  [NormalizedActivityType.Hiking]: 'Hiking',
  [NormalizedActivityType.Swimming]: 'Swimming',
  [NormalizedActivityType.Cycling]: 'Cycling',
  [NormalizedActivityType.Workout]: 'Workout',
  [NormalizedActivityType.Other]: 'Other Activity',
};


export interface NormalizedActivityFirestore {
  id: string; // Unique ID in our database (e.g., dataSource-originalId)
  userId: string;
  originalId: string; // ID from the source platform
  dataSource: 'fitbit' | 'strava' | 'google-fit' | 'apple_health' | 'manual' | 'withings' | string; 
  
  type: NormalizedActivityType;
  name?: string; // User-defined name/title if available
  
  startTimeUtc: string; // ISO 8601 format (UTC)
  startTimeLocal?: string; // ISO 8601 format (local time of activity, if available)
  timezone?: string; // e.g., "America/Los_Angeles"
  
  durationMovingSec?: number; // Active duration in seconds
  durationElapsedSec?: number; // Total duration in seconds
  
  distanceMeters?: number;
  calories?: number;
  steps?: number;
  
  averageHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  
  elevationGainMeters?: number;
  
  mapPolyline?: string;
  
  date: string; // YYYY-MM-DD format (derived from startTimeLocal or startTimeUtc)
  lastFetched: string; // ISO 8601 string
}


// --- Health Metric Types for Manual Entry & Timeline (Example) ---
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
  source?: 'manual' | 'quest' | 'uhc' | 'fitbit' | 'strava' | 'google-fit' | 'withings';
}

export interface WalkingEntry extends BaseHealthEntry {
  type: 'walking';
  value: number;
  unit: 'steps' | 'km' | 'miles';
}

export interface StandingEntry extends BaseHealthEntry {
  type: 'standing';
  value: number;
  unit: 'minutes' | 'hours';
}

export interface BreathingEntry extends BaseHealthEntry {
  type: 'breathing';
  value: number;
  unit: 'breaths/min';
  quality?: string;
}

export interface PulseEntry extends BaseHealthEntry {
  type: 'pulse';
  value: number;
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
  visitNotes?: string; 
}

export interface MedicationEntry extends BaseHealthEntry {
  type: 'medication';
  medicationName: string; 
  dosage: string;
  frequency: string;
}

export interface ConditionEntry extends BaseHealthEntry {
  type: 'condition';
  conditionName: string; 
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


// --- User Profile and Authentication Types ---
// This is a simplified UserProfile for stabilization.
// We can add back the more complex fields once the app is stable.
export interface UserProfile {
  id: string; 
  email: string; 
  firstName?: string; 
  lastName?: string; 
  dateOfBirth?: string;
  createdAt: string; // ISO 8601 string
  lastLoggedInDate?: string; // ISO 8601 string
  lastPasswordChangeDate?: string; // ISO 8601 string
}

// --- LoginResult Type ---
export interface LoginResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
}
// --- End LoginResult Type ---

export type SubscriptionTier = 'free' | 'silver' | 'gold' | 'platinum';
export const subscriptionTiers: SubscriptionTier[] = ['free', 'silver', 'gold', 'platinum'];


// --- Placeholder types for now, can be expanded later ---
export interface FitbitApiCallStats {}
export interface StravaApiCallStats {}
export interface GoogleFitApiCallStats {}
export interface WithingsApiCallStats {}
export interface WalkingRadarGoals {}
export interface RunningRadarGoals {}
export interface HikingRadarGoals {}
export interface SwimmingRadarGoals {}
export interface SleepRadarGoals {}
export type DashboardMetricIdValue = string;

// --- Dashboard Metric Selection Types ---
export const DashboardMetricId = {
  AVG_DAILY_STEPS: 'avgDailySteps',
  AVG_SLEEP_DURATION: 'avgSleepDuration',
  AVG_ACTIVE_MINUTES: 'avgActiveMinutes',
  RESTING_HEART_RATE: 'restingHeartRate',
  AVG_WORKOUT_DURATION: 'avgWorkoutDuration', 
  TOTAL_WORKOUTS: 'totalWorkouts',        
} as const;

export interface DashboardMetricConfig {
  id: DashboardMetricIdValue;
  label: string; 
  unit?: string; 
  defaultMaxValue: number; 
}

export const AVAILABLE_DASHBOARD_METRICS: DashboardMetricConfig[] = [
  { id: DashboardMetricId.AVG_DAILY_STEPS, label: 'Average Daily Steps', unit: 'steps', defaultMaxValue: 15000 },
  { id: DashboardMetricId.AVG_SLEEP_DURATION, label: 'Average Sleep Duration', unit: 'hours', defaultMaxValue: 10 },
  { id: DashboardMetricId.AVG_ACTIVE_MINUTES, label: 'Average Active Minutes', unit: 'min', defaultMaxValue: 120 },
  { id: DashboardMetricId.RESTING_HEART_RATE, label: 'Average Resting Heart Rate', unit: 'bpm', defaultMaxValue: 100 }, 
  { id: DashboardMetricId.AVG_WORKOUT_DURATION, label: 'Average Workout Duration', unit: 'min', defaultMaxValue: 90 },
  { id: DashboardMetricId.TOTAL_WORKOUTS, label: 'Total Workouts in Period', unit: 'sessions', defaultMaxValue: 10 },
];
// --- End Dashboard Metric Selection Types ---

// --- Radar Chart Data Point Type ---
export interface RadarDataPoint { 
  metric: string; 
  value: number; 
  actualFormattedValue: string; 
  fullMark: number; 
}

export interface SelectableService {
  id: string;
  name: string;
}

export const mockFitnessApps: SelectableService[] = [
  { id: 'fitbit', name: 'Fitbit' },
  { id: 'strava', name: 'Strava' },
  { id: 'google-fit', name: 'Google Fit' },
  { id: 'withings', name: 'Withings' },
];

export const mockDiagnosticServices: SelectableService[] = [
  { id: 'quest', name: 'Quest Diagnostics' },
  { id: 'labcorp', name: 'LabCorp of America' },
];

export const mockInsuranceProviders: SelectableService[] = [
  { id: 'uhc', name: 'United Healthcare' },
  { id: 'aetna', name: 'Aetna' },
  { id: 'cigna', name: 'Cigna' },
];

// Firestore specific data structures (examples)
export interface FitbitActivitySummaryFirestore {
    date: string; 
    steps?: number; 
    distance?: number; // km
    caloriesOut?: number; 
    activeMinutes?: number; 
    lastFetched: string; // ISO string
    dataSource: 'fitbit';
}

export interface FitbitHeartRateFirestore {
  date: string; 
  restingHeartRate?: number;
  heartRateZones?: Array<{
    name: string;
    min: number;
    max: number;
    minutes: number;
    caloriesOut?: number;
  }>;
  intradaySeries?: {
    dataset: Array<{ time: string; value: number }>;
    datasetInterval: number;
    datasetType: string;
  };
  lastFetched: string; // ISO string
  dataSource: 'fitbit';
}

export interface FitbitSleepLogFirestore {
  dateOfSleep: string; 
  logId: number; 
  startTime: string; 
  endTime: string; 
  duration: number; // milliseconds
  isMainSleep: boolean;
  minutesToFallAsleep: number;
  minutesAsleep: number;
  minutesAwake: number;
  timeInBed: number;
  efficiency: number;
  type: 'stages' | 'classic';
  levels?: {
    summary: {
      deep?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      light?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      rem?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      wake?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      asleep?: { count: number; minutes: number };
      awake?: { count: number; minutes: number };
      restless?: { count: number; minutes: number };
    };
    data: Array<{
      dateTime: string;
      level: 'deep' | 'light' | 'rem' | 'wake' | 'asleep' | 'awake' | 'restless';
      seconds: number;
    }>;
    shortData?: Array<{
        dateTime: string;
        level: 'wake' | 'deep' | 'light' | 'rem' | 'asleep' | 'awake' | 'restless';
        seconds: number;
    }>;
  };
  lastFetched: string; // ISO string
  dataSource: 'fitbit';
}

// --- Admin Configuration Types ---
export interface ConnectableServicesConfig {
  fitnessApps: SelectableService[];
  diagnosticServices: SelectableService[];
  insuranceProviders: SelectableService[];
  lastUpdated?: string; // ISO Timestamp
}

export interface TermsAndConditionsConfig {
  currentVersion: string;
  text: string;
  publishedAt?: string; // ISO Timestamp
}


import { z } from 'zod';

// --- Password Policy ---
export const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
  .regex(/[0-9]/, { message: "Password must contain at least one number." })
  .regex(/[^A-Za-z0-9]/, { message: "Password must contain at least one special character." });


// --- User Profile and Authentication Types ---
export interface UserProfile {
  id: string; 
  email: string; 
  firstName?: string; 
  lastName?: string; 
  dateOfBirth?: string; // [2025-06-29] COMMENT: ISO 8601 string for consistency
  createdAt: string; // [2025-06-29] COMMENT: ISO 8601 string
  lastLoggedInDate?: string; // [2025-06-29] COMMENT: ISO 8601 string
  lastPasswordChangeDate?: string; // [2025-06-29] COMMENT: ISO 8601 string
  
  // [2025-06-29] COMMENT: Simplified service connections
  connectedFitnessApps?: SelectableService[];
  connectedDiagnosticsServices?: SelectableService[];
  connectedInsuranceProviders?: (SelectableService & { memberId: string; groupId?: string })[];

  // [2025-06-29] COMMENT: Simplified subscription tier
  subscriptionTier: SubscriptionTier;

  // [2025-06-29] COMMENT: Simplified API call stats
  fitbitApiCallStats?: FitbitApiCallStats;
  stravaApiCallStats?: StravaApiCallStats;
  googleFitApiCallStats?: GoogleFitApiCallStats;
  // [2025-06-29] COMMENT: Added Withings API call stats to the user profile type.
  withingsApiCallStats?: WithingsApiCallStats;
  
  // [2025-06-29] COMMENT: Simplified goals
  walkingRadarGoals?: WalkingRadarGoals;
  runningRadarGoals?: RunningRadarGoals;
  hikingRadarGoals?: HikingRadarGoals;
  swimmingRadarGoals?: SwimmingRadarGoals;
  sleepRadarGoals?: SleepRadarGoals;
  
  // [2025-06-29] COMMENT: Dashboard metrics
  dashboardRadarMetrics?: DashboardMetricIdValue[];
  
  profileSetupComplete?: boolean;
  acceptedLatestTerms?: boolean;
  termsVersionAccepted?: string;

  // [2025-06-29] COMMENT: Last sync timestamps
  fitbitLastSuccessfulSync?: string;
  stravaLastSyncTimestamp?: number;
  googleFitLastSuccessfulSync?: string;
}

export interface SelectableService {
  id: string;
  name: string;
  connectedAt?: string;
}

export type SubscriptionTier = 'free' | 'silver' | 'gold' | 'platinum';
export const subscriptionTiers: SubscriptionTier[] = ['free', 'silver', 'gold', 'platinum'];

export interface TierFeatureComparison {
    feature: string;
    free: string | boolean;
    silver: string | boolean;
    gold: string | boolean;
    platinum: string | boolean;
}

export const featureComparisonData: TierFeatureComparison[] = [
    { feature: "Basic Dashboard", free: true, silver: true, gold: true, platinum: true },
    { feature: "Manual Data Entry", free: true, silver: true, gold: true, platinum: true },
    { feature: "Fitness App Connections", free: 1, silver: 2, gold: 4, platinum: 'All' },
    { feature: "Insurance Connections", free: 0, silver: 1, gold: 2, platinum: 'All' },
];


// --- Standardized Activity Data Types ---
export enum NormalizedActivityType {
  Walking = 'walking',
  Running = 'running',
  Hiking = 'hiking',
  Swimming = 'swimming',
  Cycling = 'cycling',
  Workout = 'workout', // [2025-06-29] COMMENT: General workout category
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
  id: string;
  userId: string;
  originalId: string;
  dataSource: 'fitbit' | 'strava' | 'google-fit' | 'apple_health' | 'manual' | 'withings' | string; 
  type: NormalizedActivityType;
  name?: string;
  startTimeUtc: string;
  startTimeLocal?: string;
  timezone?: string;
  durationMovingSec?: number;
  durationElapsedSec?: number;
  distanceMeters?: number;
  calories?: number;
  steps?: number;
  averageHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  elevationGainMeters?: number;
  mapPolyline?: string;
  date: string;
  lastFetched: string;
}


// --- Health Metric Types for Manual Entry & Timeline ---
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
  totalCholesterol: number;
  ldl: number;
  hdl: number;
  triglycerides: number;
}

export interface BaseHealthEntry {
  id: string;
  date: string;
  type: HealthMetricType;
  title: string;
  notes?: string;
  // [2025-06-29] COMMENT: Added 'withings' to the list of possible data sources for a health entry.
  source?: 'manual' | 'quest' | 'uhc' | 'fitbit' | 'strava' | 'google-fit' | 'withings';
}

export interface WalkingEntry extends BaseHealthEntry { type: 'walking'; value: number; unit: 'steps' | 'km' | 'miles'; }
export interface StandingEntry extends BaseHealthEntry { type: 'standing'; value: number; unit: 'minutes' | 'hours'; }
export interface BreathingEntry extends BaseHealthEntry { type: 'breathing'; value: number; unit: 'breaths/min'; quality?: string; }
export interface PulseEntry extends BaseHealthEntry { type: 'pulse'; value: number; unit: 'bpm'; }
export interface LipidPanelEntry extends BaseHealthEntry { type: 'lipidPanel'; value: LipidPanelData; }
export interface AppointmentEntry extends BaseHealthEntry { type: 'appointment'; doctor?: string; location?: string; reason?: string; visitNotes?: string; }
export interface MedicationEntry extends BaseHealthEntry { type: 'medication'; medicationName: string; dosage: string; frequency: string; }
export interface ConditionEntry extends BaseHealthEntry { type: 'condition'; conditionName: string; diagnosisDate?: string; status?: 'active' | 'resolved' | 'chronic'; }

export type HealthEntry =
  | WalkingEntry | StandingEntry | BreathingEntry | PulseEntry | LipidPanelEntry
  | AppointmentEntry | MedicationEntry | ConditionEntry;

export const healthMetricCategories: HealthMetricType[] = [
  'walking', 'standing', 'breathing', 'pulse', 'lipidPanel', 'appointment', 'medication', 'condition'
];

export const healthMetricDisplayNames: Record<HealthMetricType, string> = {
  walking: 'Walking', standing: 'Standing', breathing: 'Breathing', pulse: 'Pulse',
  lipidPanel: 'Lipid Panel', appointment: 'Appointment', medication: 'Medication', condition: 'Condition'
};


// --- Auth & API Related Types ---

export interface LoginResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
}

export type ApiCallStat = {
    lastCalledAt?: string;
    callCountToday?: number;
}
export type FitbitApiCallStats = {
    [key in 'dailyActivitySummary' | 'heartRateTimeSeries' | 'sleepData' | 'swimmingData' | 'loggedActivities']?: ApiCallStat;
};
export type StravaApiCallStats = { activities?: ApiCallStat };
export type GoogleFitApiCallStats = { sessions?: ApiCallStat, aggregateData?: ApiCallStat };
// [2025-06-29] COMMENT: Added a generic type for Withings API call stats.
export type WithingsApiCallStats = { [key: string]: ApiCallStat };


// --- Goal Configuration Types ---
export interface WalkingRadarGoals {
  maxDailySteps?: number; maxDailyDistanceMeters?: number; maxDailyDurationSec?: number; maxDailySessions?: number;
  minDailySteps?: number; minDailyDistanceMeters?: number; minDailyDurationSec?: number; minDailySessions?: number;
}
export interface RunningRadarGoals {
  maxDailyDistanceMeters?: number; maxDailyDurationSec?: number; maxDailySessions?: number;
  minDailyDistanceMeters?: number; minDailyDurationSec?: number; minDailySessions?: number;
}
export interface HikingRadarGoals {
  maxDailyDistanceMeters?: number; maxDailyDurationSec?: number; maxDailySessions?: number; maxDailyElevationGainMeters?: number;
  minDailyDistanceMeters?: number; minDailyDurationSec?: number; minDailySessions?: number; minDailyElevationGainMeters?: number;
}
export interface SwimmingRadarGoals {
  maxDailyDistanceMeters?: number; maxDailyDurationSec?: number; maxDailySessions?: number;
  minDailyDistanceMeters?: number; minDailyDurationSec?: number; minDailySessions?: number;
}
export interface SleepRadarGoals {
  targetSleepDurationHours?: number; minSleepEfficiencyPercent?: number; minTimeInDeepSleepMinutes?: number; minTimeInRemSleepMinutes?: number;
}


// --- Dashboard Types ---
export const DashboardMetricId = {
  AVG_DAILY_STEPS: 'avgDailySteps',
  AVG_SLEEP_DURATION: 'avgSleepDuration',
  AVG_ACTIVE_MINUTES: 'avgActiveMinutes',
  RESTING_HEART_RATE: 'restingHeartRate',
  AVG_WORKOUT_DURATION: 'avgWorkoutDuration', 
  TOTAL_WORKOUTS: 'totalWorkouts',        
} as const;

export type DashboardMetricIdValue = typeof DashboardMetricId[keyof typeof DashboardMetricId];

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

export interface RadarDataPoint { 
  metric: string; 
  value: number; 
  actualFormattedValue: string; 
  fullMark: number; 
}

// [2025-06-29] COMMENT: Mock Connectable Services
export const mockFitnessApps: SelectableService[] = [
  { id: 'fitbit', name: 'Fitbit' },
  { id: 'strava', name: 'Strava' },
  { id: 'googlefit', name: 'Google Fit' },
  // [2025-06-29] COMMENT: Added Withings to the list of available fitness apps.
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


// --- Firestore specific data structures (examples from Fitbit) ---
export interface FitbitActivitySummaryFirestore {
    date: string; 
    steps?: number; 
    distance?: number; // [2025-06-29] COMMENT: km
    caloriesOut?: number; 
    activeMinutes?: number; 
    lastFetched: string; // [2025-06-29] COMMENT: ISO string
    dataSource: 'fitbit';
}

export interface FitbitHeartRateFirestore {
  date: string; 
  restingHeartRate?: number;
  heartRateZones?: Array<{ name: string; min: number; max: number; minutes: number; caloriesOut?: number; }>;
  intradaySeries?: { dataset: Array<{ time: string; value: number }>; datasetInterval: number; datasetType: string; };
  lastFetched: string;
  dataSource: 'fitbit';
}

export interface FitbitSleepLogFirestore {
  dateOfSleep: string; 
  logId: number; 
  startTime: string; 
  endTime: string; 
  duration: number; // [2025-06-29] COMMENT: ms
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
      asleep?: { count: number; minutes: number; };
      awake?: { count: number; minutes: number; };
      restless?: { count: number; minutes: number; };
    };
    data: Array<{ dateTime: string; level: 'deep' | 'light' | 'rem' | 'wake' | 'asleep' | 'awake' | 'restless'; seconds: number; }>;
    shortData?: Array<{ dateTime: string; level: 'wake' | 'deep' | 'light' | 'rem' | 'asleep' | 'awake' | 'restless'; seconds: number; }>;
  };
  lastFetched: string;
  dataSource: 'fitbit';
}


// --- Admin Configuration Types ---
export interface ConnectableServicesConfig {
  fitnessApps: SelectableService[];
  diagnosticServices: SelectableService[];
  insuranceProviders: SelectableService[];
  lastUpdated?: string;
}

export interface TermsAndConditionsConfig {
  currentVersion: string;
  text: string;
  publishedAt?: string;
}

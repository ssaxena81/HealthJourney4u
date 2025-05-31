
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

export type SubscriptionTier = 'free' | 'silver' | 'gold' | 'platinum';

export interface FitbitApiCallStatDetail {
  lastCalledAt?: string; // ISO string
  callCountToday?: number;
}

export interface FitbitApiCallStats {
  dailyActivitySummary?: FitbitApiCallStatDetail;
  heartRateTimeSeries?: FitbitApiCallStatDetail;
  sleepData?: FitbitApiCallStatDetail;
  swimmingData?: FitbitApiCallStatDetail; 
  loggedActivities?: FitbitApiCallStatDetail; 
}

export interface StravaApiCallStatDetail {
  lastCalledAt?: string; // ISO string
  callCountToday?: number;
}

export interface StravaApiCallStats {
  activities?: StravaApiCallStatDetail;
}

export interface GoogleFitApiCallStatDetail {
  lastCalledAt?: string; // ISO string
  callCountToday?: number;
}

export interface GoogleFitApiCallStats {
  sessions?: GoogleFitApiCallStatDetail; 
  aggregateData?: GoogleFitApiCallStatDetail; 
}

export interface WithingsApiCallStatDetail {
  lastCalledAt?: string; // ISO string
  callCountToday?: number;
}
export interface WithingsApiCallStats {
  measurements?: WithingsApiCallStatDetail; // For things like weight, heart rate
  activity?: WithingsApiCallStatDetail;    // For activities
  sleep?: WithingsApiCallStatDetail;       // For sleep data
}


export interface WalkingRadarGoals {
  maxDailySteps?: number | null;
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null; 
  maxDailySessions?: number | null;
  minDailySteps?: number | null;
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null; 
  minDailySessions?: number | null;
}

export interface RunningRadarGoals {
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null;
  maxDailySessions?: number | null;
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null;
  minDailySessions?: number | null;
}

export interface HikingRadarGoals {
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null;
  maxDailySessions?: number | null;
  maxDailyElevationGainMeters?: number | null;
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null;
  minDailySessions?: number | null;
  minDailyElevationGainMeters?: number | null;
}

export interface SwimmingRadarGoals {
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null;
  maxDailySessions?: number | null;
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null;
  minDailySessions?: number | null;
}

export interface SleepRadarGoals {
  targetSleepDurationHours?: number | null;
  minSleepEfficiencyPercent?: number | null;
  minTimeInDeepSleepMinutes?: number | null;
  minTimeInRemSleepMinutes?: number | null;
}

// --- Dashboard Metric Selection Types ---
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
// --- End Dashboard Metric Selection Types ---

// --- Radar Chart Data Point Type ---
export interface RadarDataPoint { 
  metric: string; 
  value: number; 
  actualFormattedValue: string; 
  fullMark: number; 
}

export interface PerformanceRadarChartDataPoint {
  metric: string;
  minGoalNormalized?: number;
  actualNormalized: number;  
  maxGoalNormalized: number;  
  minGoalFormatted?: string;  
  actualFormatted: string;    
  maxGoalFormatted?: string;  
  isOverGoal?: boolean;       
  isBelowMinGoal?: boolean;   
}


export interface UserProfile {
  id: string; 
  firstName?: string; 
  middleInitial?: string; 
  lastName?: string; 
  dateOfBirth?: string; 
  email: string; 
  cellPhone?: string; 
  mfaMethod?: 'email' | 'sms'; 
  mfaCodeAttempt?: { code: string; expiresAt: string; };
  passwordResetCodeAttempt?: { code: string; expiresAt: string; }; 
  isAgeCertified?: boolean; 

  lastPasswordChangeDate: string; 
  acceptedLatestTerms: boolean;
  termsVersionAccepted?: string; 

  subscriptionTier: SubscriptionTier;
  paymentDetails?: any; 

  connectedFitnessApps: Array<{
    id: string; 
    name: string; 
    connectedAt: string; 
  }>;

  connectedDiagnosticsServices: Array<{
    id: string; 
    name: string; 
    connectedAt: string; 
  }>;

  connectedInsuranceProviders: Array<{
    id: string; 
    name: string; 
    memberId: string; 
    groupId?: string; 
    connectedAt: string; 
  }>;

  fitbitApiCallStats?: FitbitApiCallStats;
  stravaApiCallStats?: StravaApiCallStats;
  googleFitApiCallStats?: GoogleFitApiCallStats;
  withingsApiCallStats?: WithingsApiCallStats; // Added for Withings

  fitbitLastSuccessfulSync?: string; 
  stravaLastSyncTimestamp?: number; 
  googleFitLastSuccessfulSync?: string; 
  withingsLastSuccessfulSync?: string; // Added for Withings
  withingsUserId?: string; // Store Withings specific user ID

  walkingRadarGoals?: WalkingRadarGoals;
  runningRadarGoals?: RunningRadarGoals;
  hikingRadarGoals?: HikingRadarGoals;
  swimmingRadarGoals?: SwimmingRadarGoals;
  sleepRadarGoals?: SleepRadarGoals;
  dashboardRadarMetrics?: DashboardMetricIdValue[]; 
}

export const subscriptionTiers: SubscriptionTier[] = ['free', 'silver', 'gold', 'platinum'];

export interface TierFeatureComparison {
  feature: string;
  free: string | boolean;
  silver: string | boolean;
  gold: string | boolean;
  platinum: string | boolean;
}

export const featureComparisonData: TierFeatureComparison[] = [
  { feature: "Fitness App Connections", free: "1", silver: "2", gold: "3", platinum: "All" },
  { feature: "Diagnostic Service Connections", free: "None", silver: "None", gold: "1", platinum: "All" },
  { feature: "Insurance Provider Connections", free: "1", silver: "2", gold: "3", platinum: "All" },
  { feature: "Advanced Data Analysis", free: false, silver: true, gold: true, platinum: true },
  { feature: "Detailed Reports", free: "Basic", silver: "Standard", gold: "Advanced", platinum: "Premium" },
  { feature: "Password Expiry (90 days)", free: true, silver: true, gold: true, platinum: true },
  { feature: "Terms & Conditions Acceptance", free: true, silver: true, gold: true, platinum: true },
  { feature: "Multi-Factor Authentication", free: true, silver: true, gold: true, platinum: true },
  { feature: "Fitbit Daily Summary Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Heart Rate Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Sleep Data Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Swimming Data Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Logged Activities Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Strava Activity Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Google Fit Session Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Google Fit Metric Aggregation", free: "5/day", silver: "5/day", gold: "10/day", platinum: "20/day" },
  { feature: "Withings Data Fetch (Activity, Sleep, Measurements)", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" }, // Placeholder for Withings
  { feature: "Sync Connected Apps", free: "Auto (1/24h) + Manual", silver: "Auto (1/24h) + Manual", gold: "Auto (1/24h) + Manual", platinum: "Auto (1/24h) + Manual" },
];

export interface SelectableService {
  id: string;
  name: string;
}

export const mockFitnessApps: SelectableService[] = [
  { id: 'fitbit', name: 'Fitbit' },
  { id: 'strava', name: 'Strava' },
  { id: 'google-fit', name: 'Google Fit' },
  { id: 'withings', name: 'Withings' },
  { id: 'garmin', name: 'Garmin Connect' },
  { id: 'oura', name: 'Oura Ring' },
  { id: 'whoop', name: 'WHOOP' },
  { id: 'polar', name: 'Polar Flow' },
  { id: 'apple_health', name: 'Apple Health (Companion App Needed)' },
  { id: 'samsung_health', name: 'Samsung Health (Platform Integration)' },
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

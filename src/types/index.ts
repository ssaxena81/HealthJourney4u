
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
  originalId: string; // ID from the source platform (e.g., Fitbit logId, Strava activity id, Google Fit session id)
  dataSource: 'fitbit' | 'strava' | 'google-fit' | 'apple_health' | 'manual' | string; // Extensible
  
  type: NormalizedActivityType; // Standardized type
  name?: string; // User-defined name/title if available
  
  startTimeUtc: string; // ISO 8601 format (UTC)
  startTimeLocal?: string; // ISO 8601 format (local time of activity, if available)
  timezone?: string; // e.g., "America/Los_Angeles" (if available)
  
  durationMovingSec?: number; // Active duration in seconds
  durationElapsedSec?: number; // Total duration in seconds (including pauses)
  
  distanceMeters?: number; // Distance in meters
  calories?: number;
  steps?: number; // Optional, mainly for step-based activities
  
  averageHeartRateBpm?: number; // Optional
  maxHeartRateBpm?: number; // Optional
  
  elevationGainMeters?: number; // Optional
  
  mapPolyline?: string; // Optional, for map display (summary polyline)
  
  // For easy daily grouping/querying, derived from startTimeLocal or startTimeUtc
  date: string; // YYYY-MM-DD format 
  
  lastFetched: string; // ISO 8601 string (when this record was created/last updated in our DB)
}

// --- Health Metric Types for Manual Entry & Timeline (Example) ---
export type HealthMetricTypeTimeline =
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
  type: HealthMetricTypeTimeline;
  title: string;
  notes?: string;
  source?: 'manual' | 'quest' | 'uhc' | 'fitbit' | 'strava' | 'google-fit'; // To represent integrations
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

export const healthMetricCategories: HealthMetricTypeTimeline[] = [
  'walking',
  'standing',
  'breathing',
  'pulse',
  'lipidPanel',
  'appointment',
  'medication',
  'condition',
];

export const healthMetricDisplayNames: Record<HealthMetricTypeTimeline, string> = {
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
  sessions?: GoogleFitApiCallStatDetail; // For listing sessions
  aggregateData?: GoogleFitApiCallStatDetail; // For fetching specific metrics like steps, distance for sessions
}


export interface WalkingRadarGoals {
  // Maximums
  maxDailySteps?: number | null;
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null; 
  maxDailySessions?: number | null;
  // Minimums
  minDailySteps?: number | null;
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null; 
  minDailySessions?: number | null;
}

export interface RunningRadarGoals {
  // Maximums
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null;
  maxDailySessions?: number | null;
  // Minimums
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null;
  minDailySessions?: number | null;
}

export interface HikingRadarGoals {
  // Maximums
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null;
  maxDailySessions?: number | null;
  maxDailyElevationGainMeters?: number | null;
  // Minimums
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null;
  minDailySessions?: number | null;
  minDailyElevationGainMeters?: number | null;
}

export interface SwimmingRadarGoals {
  // Maximums
  maxDailyDistanceMeters?: number | null;
  maxDailyDurationSec?: number | null;
  maxDailySessions?: number | null;
  // Minimums
  minDailyDistanceMeters?: number | null;
  minDailyDurationSec?: number | null;
  minDailySessions?: number | null;
}

export interface SleepRadarGoals {
  targetSleepDurationHours?: number | null; // Target for sleep duration
  minSleepEfficiencyPercent?: number | null; // Minimum acceptable sleep efficiency
  minTimeInDeepSleepMinutes?: number | null; // Minimum time in deep sleep
  minTimeInRemSleepMinutes?: number | null; // Minimum time in REM sleep
}


export interface UserProfile {
  id: string; // Firebase Auth UID - This will be the document ID in Firestore

  // Part 1: Demographics
  firstName?: string; 
  middleInitial?: string; 
  lastName?: string; 
  dateOfBirth?: string; 
  email: string; 
  cellPhone?: string; 
  mfaMethod?: 'email' | 'sms'; 
  isAgeCertified?: boolean; 

  // Password and Terms Management
  lastPasswordChangeDate: string; 
  acceptedLatestTerms: boolean;
  termsVersionAccepted?: string; 

  // Subscription and Payment
  subscriptionTier: SubscriptionTier;
  paymentDetails?: any; 

  // Part 2: Fitness Connections
  connectedFitnessApps: Array<{
    id: string; 
    name: string; 
    connectedAt: string; 
  }>;

  // Part 3: Diagnostics Connections
  connectedDiagnosticsServices: Array<{
    id: string; 
    name: string; 
    connectedAt: string; 
  }>;

  // Part 4: Insurance Connections
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

  walkingRadarGoals?: WalkingRadarGoals;
  runningRadarGoals?: RunningRadarGoals;
  hikingRadarGoals?: HikingRadarGoals;
  swimmingRadarGoals?: SwimmingRadarGoals;
  sleepRadarGoals?: SleepRadarGoals;
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
  { feature: "Strava Activity Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Google Fit Activity Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Centralized App Sync", free: "Auto (1/24h)", silver: "Auto (1/24h)", gold: "Auto (1/24h)", platinum: "Auto (1/24h) + Manual (up to 3/day)" },
];

export interface SelectableService {
  id: string;
  name: string;
}

export const mockFitnessApps: SelectableService[] = [
  { id: 'fitbit', name: 'Fitbit' },
  { id: 'strava', name: 'Strava' },
  { id: 'google-fit', name: 'Google Fit' },
  // { id: 'apple_health', name: 'Apple Health (Via Companion App)' },
  // { id: 'nike_run_club', name: 'Nike Run Club' },
  // { id: 'myfitnesspal', name: 'MyFitnessPal' },
  // { id: 'fiton', name: 'FitOn Workouts' },
  // { id: 'garmin', name: 'Garmin Connect' },
  // { id: 'oura', name: 'Oura Ring' },
  // { id: 'whoop', name: 'WHOOP' },
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
    date: string; // YYYY-MM-DD, also the document ID
    steps?: number; 
    distance?: number; // In km (as per current implementation, ensure consistency)
    caloriesOut?: number; 
    activeMinutes?: number; 
    lastFetched: string; // ISO string
    dataSource: 'fitbit';
}

export interface FitbitHeartRateFirestore {
  date: string; // YYYY-MM-DD, also the document ID
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
  dateOfSleep: string; // YYYY-MM-DD
  logId: number; // Use as document ID in fitbit_sleep subcollection
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
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

// This type was previously named FitbitSwimmingActivityFirestore, renamed for generality
// It aligns with NormalizedActivityFirestore
export interface StravaActivityFirestore extends NormalizedActivityFirestore {
  dataSource: 'strava';
  // Any Strava-specific fields can be added here if needed,
  // but the goal is to primarily use NormalizedActivityFirestore fields.
}

// This type can be used for Google Fit specific normalized data too
export interface GoogleFitActivityFirestore extends NormalizedActivityFirestore {
  dataSource: 'google-fit';
}

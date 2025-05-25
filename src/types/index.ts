
import { z } from 'zod';

// --- Password Policy ---
export const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
  .regex(/[0-9]/, { message: "Password must contain at least one number." })
  .regex(/[^A-Za-z0-9]/, { message: "Password must contain at least one special character." });


export type HealthMetricCategory = 'vital' | 'lab' | 'activity' | 'event' | 'medication' | 'condition';

// Deprecating HealthMetricType in favor of more specific types or direct use of NormalizedActivityType
// export type HealthMetricType =
//   | 'walking'
//   | 'standing'
//   | 'breathing'
//   | 'pulse'
//   | 'lipidPanel'
//   | 'appointment'
//   | 'medication'
//   | 'condition';

export interface LipidPanelData {
  totalCholesterol: number; // mg/dL
  ldl: number; // mg/dL
  hdl: number; // mg/dL
  triglycerides: number; // mg/dL
}

// Keeping BaseHealthEntry for non-activity types that might still be manually entered or from other specific sources
export interface BaseHealthEntry {
  id: string;
  date: string; // ISO 8601 format
  type: string; // More generic now, can be 'lipidPanel', 'appointment', 'medication', 'condition' or a NormalizedActivityType
  title: string;
  notes?: string;
  source?: 'manual' | 'quest' | 'uhc' | 'fitbit' | 'strava'; // Added fitbit & strava generally
}

// Specific entry types for non-activity data (if needed, or can be merged into a generic one with value object)
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
  diagnosisDate?: string;
  status?: 'active' | 'resolved' | 'chronic';
}

// For manual entries that were simple like pulse, breathing - these might become NormalizedActivity if applicable or stay simple
export interface SimpleValueEntry extends BaseHealthEntry {
  type: 'pulse' | 'breathing' | 'standing'; // Example
  value: number;
  unit: string;
}


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
  id: string; // Unique ID in our database (e.g., Firestore auto-ID or dataSource-originalId)
  userId: string;
  originalId: string; // ID from the source platform (e.g., Fitbit logId, Strava activity id)
  dataSource: 'fitbit' | 'strava' | 'apple_health' | 'manual' | string; // Extensible
  
  type: NormalizedActivityType; // Standardized type
  name?: string; // User-defined name/title if available (e.g., Strava activity name)
  
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
  
  // Source-specific raw data snippet, optional, for debugging or future re-processing
  // Be mindful of size if storing large raw objects.
  // rawDataSnippet?: Record<string, any>; 
}


// Deprecated list, NormalizedActivityType should be used
export const healthMetricCategoriesOld: string[] = [
  'walking',
  'standing',
  'breathing',
  'pulse',
  'lipidPanel',
  'appointment',
  'medication',
  'condition',
];

// Deprecated map, use normalizedActivityTypeDisplayNames
export const healthMetricDisplayNamesOld: Record<string, string> = {
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
  // Potentially a general 'activities' if we fetch other logged activities from Fitbit
  loggedActivities?: FitbitApiCallStatDetail; 
}

export interface StravaApiCallStatDetail {
  lastCalledAt?: string; // ISO string
  callCountToday?: number;
}

export interface StravaApiCallStats {
  activities?: StravaApiCallStatDetail;
}

export interface UserProfile {
  id: string; // Firebase Auth UID

  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  dateOfBirth?: string; // ISO 8601
  email: string;
  cellPhone?: string;
  mfaMethod?: 'email' | 'sms';
  isAgeCertified?: boolean;

  lastPasswordChangeDate: string; // ISO 8601
  acceptedLatestTerms: boolean;
  termsVersionAccepted?: string;

  subscriptionTier: SubscriptionTier;
  paymentDetails?: any;

  connectedFitnessApps: Array<{
    id: string;
    name: string;
    connectedAt: string; // ISO 8601
  }>;

  connectedDiagnosticsServices: Array<{
    id: string;
    name: string;
    connectedAt: string; // ISO 8601
  }>;

  connectedInsuranceProviders: Array<{
    id: string;
    name: string;
    memberId: string;
    groupId?: string;
    connectedAt: string; // ISO 8601
  }>;

  fitbitApiCallStats?: FitbitApiCallStats;
  stravaApiCallStats?: StravaApiCallStats;
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
  { feature: "Fitbit Swimming Data Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" }, // Or general "Logged Activities"
  { feature: "Strava Activity Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
];

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

// Firestore specific data structures (examples)
export interface FitbitActivitySummaryFirestore {
    date: string; // YYYY-MM-DD, also the document ID
    steps: number;
    distance: number; // In km (as per current implementation, ensure consistency)
    caloriesOut: number;
    activeMinutes: number;
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
// FitbitSwimmingActivityFirestore is now superseded by NormalizedActivityFirestore
// export interface FitbitSwimmingActivityFirestore {
//   logId: number;
//   activityName: string;
//   startTime: string;
//   duration: number;
//   calories: number;
//   distance?: number;
//   distanceUnit?: 'Meter' | 'Yard' | 'Kilometer' | 'Mile';
//   pace?: number;
//   lastFetched: string;
//   dataSource: 'fitbit';
// }

// StravaActivityFirestore is now superseded by NormalizedActivityFirestore
// export interface StravaActivityFirestore {
//   id: number;
//   type: 'Walk' | 'Run' | 'Hike' | 'Swim' | string;
//   name: string;
//   distance: number;
//   movingTime: number;
//   elapsedTime: number;
//   totalElevationGain?: number;
//   startDate: string;
//   startDateLocal: string;
//   timezone?: string;
//   mapPolyline?: string;
//   averageSpeed?: number;
//   maxSpeed?: number;
//   averageHeartrate?: number;
//   calories?: number;
//   lastFetched: string;
//   dataSource: 'strava';
// }

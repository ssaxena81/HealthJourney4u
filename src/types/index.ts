import { z } from 'zod';

// --- Password Policy ---
export const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter." })
  .regex(/[0-9]/, { message: "Password must contain at least one number." })
  .regex(/[^A-Za-z0-9]/, { message: "Password must contain at least one special character." });


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
  source?: 'manual' | 'quest' | 'uhc' | 'fitbit';
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

export interface FitbitApiCallStatDetail {
  lastCalledAt?: string; // ISO string
  callCountToday?: number;
}

export interface FitbitApiCallStats {
  dailyActivitySummary?: FitbitApiCallStatDetail;
  heartRateTimeSeries?: FitbitApiCallStatDetail;
  sleepData?: FitbitApiCallStatDetail;
  swimmingData?: FitbitApiCallStatDetail;
  // Add other Fitbit endpoints here if they need rate limiting
}

export interface UserProfile {
  id: string; // Firebase Auth UID - This will be the document ID in Firestore

  // Part 1: Demographics
  firstName?: string; // Mandatory during profile setup
  middleInitial?: string; // Optional
  lastName?: string; // Mandatory during profile setup
  dateOfBirth?: string; // ISO 8601 format, Mandatory during profile setup
  email: string; // Login ID, matches Auth email, effectively mandatory
  cellPhone?: string; // Optional, but one of email/cellPhone needed for MFA
  mfaMethod?: 'email' | 'sms'; // User's preferred/configured MFA method
  isAgeCertified?: boolean; // User certifies they are 18 or older

  // Password and Terms Management
  lastPasswordChangeDate: string; // ISO 8601 format
  acceptedLatestTerms: boolean;
  termsVersionAccepted?: string; // Version identifier of T&C accepted

  // Subscription and Payment
  subscriptionTier: SubscriptionTier;
  paymentDetails?: any; // Placeholder for payment system identifiers (e.g., Stripe customer ID)

  // Part 2: Fitness Connections
  connectedFitnessApps: Array<{
    id: string; // e.g., 'fitbit', 'strava' (identifier for the service)
    name: string; // e.g., 'Fitbit', 'Strava' (display name)
    // OAuth tokens or sensitive connection details are stored securely on the server,
    // not directly in this client-accessible profile.
    connectedAt: string; // ISO 8601 format - when the connection was established
  }>;

  // Part 3: Diagnostics Connections
  connectedDiagnosticsServices: Array<{
    id: string; // e.g., 'quest', 'labcorp'
    name: string; // e.g., 'Quest Diagnostics'
    connectedAt: string; // ISO 8601 format
  }>;

  // Part 4: Insurance Connections
  connectedInsuranceProviders: Array<{
    id: string; // Identifier for the insurance provider
    name: string; // e.g., 'United Healthcare'
    memberId: string; // User's member ID for that insurer
    groupId?: string; // User's group ID (optional)
    connectedAt: string; // ISO 8601 format
  }>;

  // Fitbit API Call Statistics for Rate Limiting
  fitbitApiCallStats?: FitbitApiCallStats;
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
  { feature: "Password Expiry (90 days)", free: true, silver: true, gold: true, platinum: true },
  { feature: "Terms & Conditions Acceptance", free: true, silver: true, gold: true, platinum: true },
  { feature: "Multi-Factor Authentication", free: true, silver: true, gold: true, platinum: true },
  { feature: "Fitbit Daily Summary Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Heart Rate Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Sleep Data Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
  { feature: "Fitbit Swimming Data Fetch", free: "1/day", silver: "1/day", gold: "1/day", platinum: "3/day" },
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

// Firestore specific data structures (examples)
export interface FitbitActivitySummaryFirestore {
    date: string; // YYYY-MM-DD, also the document ID
    steps: number;
    distance: number; // In km or miles, be consistent
    caloriesOut: number;
    activeMinutes: number; // Sum of fairlyActiveMinutes and veryActiveMinutes
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
    dataset: Array<{ time: string; value: number }>; // time in HH:MM:SS
    datasetInterval: number; // e.g., 1 for 1 minute
    datasetType: string; // e.g., "minute"
  };
  lastFetched: string; // ISO string
  dataSource: 'fitbit';
}

export interface FitbitSleepLogFirestore {
  dateOfSleep: string; // YYYY-MM-DD, document ID for the sleep log
  logId: number; // Fitbit's unique ID for this sleep log
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  duration: number; // Total duration in milliseconds
  minutesToFallAsleep: number;
  minutesAsleep: number;
  minutesAwake: number;
  timeInBed: number; // Fitbit API provides this (corrected from minutesInBed)
  efficiency: number; // Sleep efficiency score (0-100)
  type: 'stages' | 'classic'; // Type of sleep log
  levels?: { // Present if type is 'stages'
    summary: {
      deep?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      light?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      rem?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      wake?: { count: number; minutes: number; thirtyDayAvgMinutes?: number };
      // For classic sleep (if needed)
      asleep?: { count: number; minutes: number };
      awake?: { count: number; minutes: number };
      restless?: { count: number; minutes: number };
    };
    data: Array<{
      dateTime: string; // ISO 8601 timestamp of the level
      level: 'deep' | 'light' | 'rem' | 'wake' | 'asleep' | 'awake' | 'restless';
      seconds: number; // Duration of this stage in seconds
    }>;
    shortData?: Array<{ // Sometimes present for short sleep periods
        dateTime: string;
        level: 'wake' | 'deep' | 'light' | 'rem' | 'asleep' | 'awake' | 'restless'; // Ensure all possible levels are covered
        seconds: number;
    }>;
  };
  lastFetched: string; // ISO string
  dataSource: 'fitbit';
}

export interface FitbitSwimmingActivityFirestore {
  logId: number; // Fitbit's unique activity log ID, also the document ID in Firestore subcollection
  activityName: string; // Should be "Swim"
  startTime: string; // ISO 8601
  duration: number; // milliseconds
  calories: number;
  distance?: number; // meters or yards, if available
  distanceUnit?: 'Meter' | 'Yard' | 'Kilometer' | 'Mile'; // if available
  pace?: number; // seconds per 100m or 100yd, if available
  lastFetched: string; // ISO string
  dataSource: 'fitbit';
  // You might add more fields like poolLengths, swimStrokes if Fitbit API provides them for specific activities
}
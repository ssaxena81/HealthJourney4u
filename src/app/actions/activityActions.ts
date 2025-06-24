
'use server';

import { db } from '@/lib/firebase/serverApp';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import type { NormalizedActivityFirestore, NormalizedActivityType } from '@/types';
import { format, parseISO } from 'date-fns';

interface GetActivitiesResponse {
  success: boolean;
  data?: NormalizedActivityFirestore[];
  error?: string;
}

export async function getNormalizedActivitiesForDateRangeAndType(
  userId: string,
  dateRange: { from: string; to: string }, // Dates in 'yyyy-MM-dd' format
  activityType: NormalizedActivityType
): Promise<GetActivitiesResponse> {
  if (!userId) {
    return { success: false, error: 'User not authenticated.' };
  }

  try {
    console.log(`[ActivityActions] Fetching ${activityType} activities for user ${userId} from ${dateRange.from} to ${dateRange.to}`);

    const activitiesCollectionRef = collection(db, 'users', userId, 'activities');
    
    // Firestore queries on string fields for ranges require the values to be lexicographically sortable.
    // Our 'date' field is 'YYYY-MM-DD', which is sortable.
    const firestoreQuery = query(
      activitiesCollectionRef,
      where('type', '==', activityType),
      where('date', '>=', dateRange.from),
      where('date', '<=', dateRange.to),
      orderBy('date', 'desc'), // Order by the date field itself
      orderBy('startTimeUtc', 'desc') // Then by UTC start time for same-day activities
    );

    const querySnapshot = await getDocs(firestoreQuery);
    const activities: NormalizedActivityFirestore[] = [];
    querySnapshot.forEach((docSnap) => {
      activities.push(docSnap.data() as NormalizedActivityFirestore);
    });

    console.log(`[ActivityActions] Fetched ${activities.length} ${activityType} activities from Firestore for user ${userId}.`);
    return { success: true, data: activities };
  } catch (error: any) {
    console.error(`[ActivityActions] Error fetching ${activityType} activities from Firestore for user ${userId}:`, error);
    return { success: false, error: `Failed to fetch ${activityType} activities: ${String(error.message || 'Unknown Firestore error')}` };
  }
}

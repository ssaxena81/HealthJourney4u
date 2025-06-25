
'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DemographicsForm from '@/components/profile/demographics-form';
import ChangePasswordForm from '@/components/profile/change-password-form';
import FitnessConnections from '@/components/profile/fitness-connections';
import DiagnosticsConnections from '@/components/profile/diagnostics-connections';
import InsuranceConnections from '@/components/profile/insurance-connections';
import DashboardMetricsForm from '@/components/profile/dashboard-metrics-form';
import WalkingGoalsForm from '@/components/profile/walking-goals-form';
import RunningGoalsForm from '@/components/profile/running-goals-form';
import HikingGoalsForm from '@/components/profile/hiking-goals-form';
import SwimmingGoalsForm from '@/components/profile/swimming-goals-form';
import SleepGoalsForm from '@/components/profile/sleep-goals-form';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { UserProfile } from '@/types';

export default function ProfilePage() {
  const { user, userProfile, loading, setUserProfile } = useAuth();
  
  // Optimistically update the UI after a successful form submission
  const handleProfileUpdate = (updatedData: Partial<UserProfile>) => {
    if (setUserProfile) {
      setUserProfile(prev => prev ? { ...prev, ...updatedData } : null);
    }
  };

  if (loading || !user) { 
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!userProfile) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="ml-4">Loading profile details...</p>
        </div>
      );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <Card className="mb-8 shadow-md rounded-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">User Profile</CardTitle>
          <CardDescription className="text-muted-foreground">Manage your personal information, connections, and account settings.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="demographics" className="w-full" orientation="vertical">
        <TabsList className="w-full md:w-48 shrink-0 mb-6 md:mb-0 md:mr-6 grid-cols-2 md:grid-cols-1">
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="goals">Activity Goals</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics" className="flex-grow">
          <DemographicsForm userProfile={userProfile} />
        </TabsContent>
        <TabsContent value="connections" className="flex-grow">
           <div className="space-y-6">
            <FitnessConnections userProfile={userProfile} />
            <DiagnosticsConnections userProfile={userProfile} />
            <InsuranceConnections userProfile={userProfile} />
           </div>
        </TabsContent>
         <TabsContent value="goals" className="flex-grow">
          <div className="space-y-6">
             <WalkingGoalsForm userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />
             <RunningGoalsForm userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />
             <HikingGoalsForm userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />
             <SwimmingGoalsForm userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />
             <SleepGoalsForm userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />
          </div>
        </TabsContent>
        <TabsContent value="dashboard" className="flex-grow">
          <DashboardMetricsForm userProfile={userProfile} onProfileUpdate={handleProfileUpdate} />
        </TabsContent>
        <TabsContent value="security" className="flex-grow">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
      
    </div>
  );
}


'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DemographicsForm from '@/components/profile/demographics-form';
import FitnessConnections from '@/components/profile/fitness-connections';
import DiagnosticsConnections from '@/components/profile/diagnostics-connections';
import InsuranceConnections from '@/components/profile/insurance-connections';
import ChangePasswordForm from '@/components/profile/change-password-form';
import WalkingGoalsForm from '@/components/profile/walking-goals-form';
import RunningGoalsForm from '@/components/profile/running-goals-form';
import HikingGoalsForm from '@/components/profile/hiking-goals-form';
import SwimmingGoalsForm from '@/components/profile/swimming-goals-form';
import SleepGoalsForm from '@/components/profile/sleep-goals-form';
import DashboardMetricsForm from '@/components/profile/dashboard-metrics-form'; // New import
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { UserProfile } from '@/types'; // Ensure UserProfile is imported

export default function ProfilePage() {
  const { user, userProfile, loading, setUserProfile } = useAuth();
  const { toast } = useToast();

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

  const handleProfilePartUpdate = (updatedData: Partial<UserProfile>) => {
    if (setUserProfile) {
      setUserProfile(prev => prev ? ({ ...prev, ...updatedData }) : null);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <Card className="mb-8 shadow-md rounded-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold tracking-tight">User Profile</CardTitle>
          <CardDescription className="text-muted-foreground">Manage your personal information, connections, activity goals, and account settings.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="demographics" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-8 mb-6">
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="fitness">Fitness Apps</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="activity_goals">Activity Goals</TabsTrigger>
          <TabsTrigger value="sleep_goals">Sleep Goals</TabsTrigger>
          <TabsTrigger value="dashboard_metrics">Dashboard</TabsTrigger> 
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics">
          <DemographicsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
        </TabsContent>
        <TabsContent value="fitness">
          <FitnessConnections userProfile={userProfile} onConnectionsUpdate={handleProfilePartUpdate} />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsConnections userProfile={userProfile} onConnectionsUpdate={handleProfilePartUpdate} />
        </TabsContent>
        <TabsContent value="insurance">
          <InsuranceConnections userProfile={userProfile} onConnectionsUpdate={handleProfilePartUpdate} />
        </TabsContent>
        <TabsContent value="activity_goals" className="space-y-6">
          <WalkingGoalsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
          <Separator />
          <RunningGoalsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
          <Separator />
          <HikingGoalsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
          <Separator />
          <SwimmingGoalsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
        </TabsContent>
        <TabsContent value="sleep_goals"> 
          <SleepGoalsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
        </TabsContent>
         <TabsContent value="dashboard_metrics">
          <DashboardMetricsForm userProfile={userProfile} onProfileUpdate={handleProfilePartUpdate} />
        </TabsContent>
         <TabsContent value="security">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
      
    </div>
  );
}
    

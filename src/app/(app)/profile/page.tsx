
'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DemographicsForm from '@/components/profile/demographics-form';
import FitnessConnections from '@/components/profile/fitness-connections';
import DiagnosticsConnections from '@/components/profile/diagnostics-connections';
import InsuranceConnections from '@/components/profile/insurance-connections';
import ChangePasswordForm from '@/components/profile/change-password-form';
import WalkingGoalsForm from '@/components/profile/walking-goals-form'; // Import new form
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user, userProfile, loading, setUserProfile } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // This handleSaveProfile is a placeholder as each form now saves itself.
  // It could be repurposed for a "Save All" if forms manage their state locally
  // and expose data, but that's more complex.
  const handleSaveProfile = async () => {
    setIsSaving(true);
    toast({ title: "Profile Update", description: "Each section now saves individually. This button is a placeholder." });
    setTimeout(() => setIsSaving(false), 1000); 
  };


  if (loading || !user) { // Check for user only, userProfile might take a moment after user is available
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user is loaded but userProfile is still null, show loading for profile
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
          <CardDescription className="text-muted-foreground">Manage your personal information, connections, activity goals, and account settings.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="demographics" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-6">
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="fitness">Fitness Apps</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="activity_goals">Activity Goals</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics">
          <DemographicsForm userProfile={userProfile} onProfileUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="fitness">
          <FitnessConnections userProfile={userProfile} onConnectionsUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsConnections userProfile={userProfile} onConnectionsUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="insurance">
          <InsuranceConnections userProfile={userProfile} onConnectionsUpdate={setUserProfile} />
        </TabsContent>
        <TabsContent value="activity_goals">
          <WalkingGoalsForm userProfile={userProfile} onProfileUpdate={setUserProfile} />
        </TabsContent>
         <TabsContent value="security">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
      
      {/* The global save button is less relevant now as forms save individually */}
      {/* <div className="mt-8 flex justify-end">
        <Button onClick={handleSaveProfile} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save All Profile Changes (Placeholder)'}
        </Button>
      </div> */}
    </div>
  );
}

    
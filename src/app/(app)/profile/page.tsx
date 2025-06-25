
'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DemographicsForm from '@/components/profile/demographics-form';
import ChangePasswordForm from '@/components/profile/change-password-form';
import FitnessConnections from '@/components/profile/fitness-connections';
import DiagnosticsConnections from '@/components/profile/diagnostics-connections';
import InsuranceConnections from '@/components/profile/insurance-connections';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user, userProfile, loading } = useAuth();

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

      <Tabs defaultValue="demographics" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6">
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="fitness">Fitness Apps</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="insurance">Insurance</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics">
          <DemographicsForm userProfile={userProfile} />
        </TabsContent>
        <TabsContent value="fitness">
           <FitnessConnections userProfile={userProfile} />
        </TabsContent>
        <TabsContent value="diagnostics">
           <DiagnosticsConnections userProfile={userProfile} />
        </TabsContent>
        <TabsContent value="insurance">
           <InsuranceConnections userProfile={userProfile} />
        </TabsContent>
        <TabsContent value="security">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
      
    </div>
  );
}

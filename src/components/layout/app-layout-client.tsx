
'use client';

import React from 'react';
import { SidebarInset, useSidebar } from '@/components/ui/sidebar';
import AppHeader from './header'; // Assuming AppHeader has onAddEntryClick prop
import SidebarNav from './sidebar-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ManualEntryForm from '@/components/health/manual-entry-form'; // Assuming this form is still relevant
import type { HealthEntry } from '@/types'; // Assuming this type is still relevant
import { VerticalTimelinePlaceholder } from './vertical-timeline-placeholder'; // New component

// Props for AppHeader and ManualEntryForm might need adjustment based on overall app data flow
// For now, keeping similar structure and adding placeholder for vertical timeline.

interface AppLayoutClientProps {
  children: React.ReactNode;
  // Props for filter panel, add entry are removed as they are not directly part of current requirements
  // onAddEntry: (entry: HealthEntry) => void; // Example, if Add Entry is still a feature
}

export default function AppLayoutClient({
  children,
}: AppLayoutClientProps) {
  const { isMobile } = useSidebar();
  const [isSheetOpen, setIsSheetOpen] = React.useState(false); // For "Add Entry" if kept

  const handleAddEntry = (entry: HealthEntry) => {
    // onAddEntry(entry); // Call prop if passed
    // Potentially show a toast notification here
    console.log("New entry added (placeholder):", entry);
    setIsSheetOpen(false);
  };

  return (
    <div className="flex min-h-screen w-full">
      <SidebarNav /> {/* SidebarNav will contain the new icon-based navigation */}
      
      <SidebarInset className="flex flex-col flex-grow"> {/* Ensure flex-grow for main content area */}
        <AppHeader onAddEntryClick={() => setIsSheetOpen(true)} /> {/* Keep Add Entry for now */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>

      {/* Right sidebar area for Vertical Timeline */}
      <aside className="hidden md:block w-72 lg:w-80 border-l bg-card p-0 overflow-y-auto sticky top-0 h-screen">
         {/* The sticky top-0 h-screen makes it stay */}
        <VerticalTimelinePlaceholder />
      </aside>

      {/* Sheet for "Add Entry" - kept for now, can be removed if not part of core flow */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full max-w-md sm:max-w-lg p-0" side={isMobile ? "bottom" : "right"}>
          <SheetHeader className="p-6 pb-2">
            <SheetTitle>Add New Health Entry</SheetTitle>
          </SheetHeader>
          {/* <ManualEntryForm onAddEntry={handleAddEntry} onClose={() => setIsSheetOpen(false)} /> */}
          <div className="p-6"><p>Manual Entry Form Placeholder</p></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

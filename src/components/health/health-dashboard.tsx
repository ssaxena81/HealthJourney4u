
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { HealthEntry, HealthMetricType } from '@/types';
import { mockHealthEntries } from '@/lib/mock-data';
import TimelineList from './timeline-list';
import FilterPanel from './filter-panel';
import ManualEntryForm from './manual-entry-form';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSidebar } from '@/components/ui/sidebar'; // For sheet side based on mobile

export default function HealthDashboard() {
  const [allEntries, setAllEntries] = useState<HealthEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<HealthEntry[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<HealthMetricType[]>([]);
  const [isEntrySheetOpen, setIsEntrySheetOpen] = useState(false);
  const { toast } = useToast();
  const { isMobile } = useSidebar();

  useEffect(() => {
    setAllEntries(mockHealthEntries);
    setSelectedCategories(mockHealthEntries.map(entry => entry.type).filter((value, index, self) => self.indexOf(value) === index));
  }, []);

  useEffect(() => {
    if (selectedCategories.length === 0) {
      setFilteredEntries([]);
    } else {
      const newFilteredEntries = allEntries
        .filter(entry => selectedCategories.includes(entry.type))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setFilteredEntries(newFilteredEntries);
    }
  }, [allEntries, selectedCategories]);

  const handleCategoryChange = (category: HealthMetricType, checked: boolean) => {
    setSelectedCategories(prev =>
      checked ? [...prev, category] : prev.filter(c => c !== category)
    );
  };

  const handleAddEntry = (newEntry: HealthEntry) => {
    setAllEntries(prevEntries => {
      const updatedEntries = [...prevEntries, newEntry].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      // Update filtered entries as well
      if (selectedCategories.includes(newEntry.type) || selectedCategories.length === 0) {
        setFilteredEntries(prevFiltered => [...prevFiltered, newEntry].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
      return updatedEntries;
    });
    toast({
      title: "Entry Added",
      description: `Successfully added "${newEntry.type === 'medication' ? newEntry.medicationName : newEntry.type === 'condition' ? newEntry.conditionName : newEntry.title}" to your timeline.`,
    });
    setIsEntrySheetOpen(false); // Close sheet after adding
  };

  return (
    <div className="container mx-auto py-6 px-0 md:px-6"> {/* Added container for better spacing */}
      <div className="grid md:grid-cols-[280px_1fr] gap-6 lg:gap-8">
        {/* Filter Panel Area - sticky on larger screens */}
        <div className="md:sticky md:top-20 h-fit"> {/* Adjusted top for sticky header */}
          {/* Button to toggle filter panel on mobile, actual FilterPanel shown in Sheet */}
          <Sheet>
              <SheetTrigger asChild>
                  <Button variant="outline" className="md:hidden w-full mb-4">Filter Categories</Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-full max-w-xs p-0">
                  <FilterPanel
                    selectedCategories={selectedCategories}
                    onCategoryChange={handleCategoryChange}
                  />
              </SheetContent>
          </Sheet>
          <div className="hidden md:block"> {/* Filter panel visible directly on larger screens */}
              <FilterPanel
                selectedCategories={selectedCategories}
                onCategoryChange={handleCategoryChange}
              />
          </div>
        </div>

        {/* Timeline List Area */}
        <div className="min-w-0">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-semibold">Health Timeline</h1>
            {/* Local Add Entry Button for this dashboard context */}
            <Button onClick={() => setIsEntrySheetOpen(true)} size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Entry to Timeline
            </Button>
          </div>
          <TimelineList entries={filteredEntries} />
        </div>
      </div>

      {/* Sheet for Manual Entry */}
      <Sheet open={isEntrySheetOpen} onOpenChange={setIsEntrySheetOpen}>
        <SheetContent className="w-full max-w-md sm:max-w-lg p-0" side={isMobile ? "bottom" : "right"}>
          <SheetHeader className="p-6 pb-2">
            <SheetTitle>Add New Health Entry</SheetTitle>
          </SheetHeader>
          <ManualEntryForm onAddEntry={handleAddEntry} onClose={() => setIsEntrySheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

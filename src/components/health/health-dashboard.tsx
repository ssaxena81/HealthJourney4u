
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { HealthEntry, HealthMetricType } from '@/types';
import { mockHealthEntries } from '@/lib/mock-data';
import TimelineList from './timeline-list';
import AppLayout from '@/components/layout/app-layout'; // For the overall page structure including sidebar and header
import { useToast } from '@/hooks/use-toast';

export default function HealthDashboard() {
  const [allEntries, setAllEntries] = useState<HealthEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<HealthEntry[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<HealthMetricType[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Simulate fetching data
    setAllEntries(mockHealthEntries);
    setSelectedCategories(mockHealthEntries.map(entry => entry.type).filter((value, index, self) => self.indexOf(value) === index)); // Initially select all available categories
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
      return updatedEntries;
    });
    toast({
      title: "Entry Added",
      description: `Successfully added "${newEntry.type === 'medication' ? newEntry.medicationName : newEntry.type === 'condition' ? newEntry.conditionName : newEntry.title}" to your timeline.`,
    });
  };
  
  return (
    <AppLayout
      selectedCategories={selectedCategories}
      onCategoryChange={handleCategoryChange}
      onAddEntry={handleAddEntry}
    >
      <TimelineList entries={filteredEntries} />
    </AppLayout>
  );
}

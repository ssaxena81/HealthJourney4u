
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function VerticalTimelinePlaceholder() {
  // TODO: Implement actual data fetching and rendering for doctor visits.
  // TODO: Implement resizable dialog for visit notes.

  return (
    <Card className="h-full shadow-none border-0 rounded-none flex flex-col">
      <CardHeader className="border-b">
        <CardTitle className="text-lg">Doctor Visits</CardTitle>
        <CardDescription className="text-xs">Your clinical encounters.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-0 relative overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-6 relative">
            {/* Example of a vertical line */}
            <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-border -z-10"></div>
            
            {/* Placeholder dots - these would be dynamically generated */}
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center space-x-3 relative pl-12 group">
                <div 
                    className="absolute left-6 top-1/2 -translate-y-1/2 h-3 w-3 bg-primary rounded-full border-2 border-card cursor-pointer group-hover:scale-125 transition-transform"
                    title={`Visit: 2023-0${index + 1}-15`}
                    onClick={() => alert(`Show notes for visit on 2023-0${index + 1}-15 (placeholder)`)}
                 />
                <div className="text-sm">
                  <p className="font-medium">Dr. Placeholder</p>
                  <p className="text-xs text-muted-foreground">2023-0{index + 1}-15</p>
                </div>
              </div>
            ))}
             <p className="text-center text-xs text-muted-foreground pt-4">
              {Array(8).length > 0 ? "Scroll for more" : "No visits found."}
            </p>
          </div>
        </ScrollArea>
      </CardContent>
      <div className="p-3 border-t">
        <Button variant="outline" size="sm" className="w-full">
          Refresh Visits
        </Button>
      </div>
    </Card>
  );
}

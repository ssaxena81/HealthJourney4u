'use client';

import type { HealthMetricType } from '@/types';
import { healthMetricCategories, healthMetricDisplayNames } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HealthIcon } from '@/components/icons/health-icons';

interface FilterPanelProps {
  selectedCategories: HealthMetricType[];
  onCategoryChange: (category: HealthMetricType, checked: boolean) => void;
}

export default function FilterPanel({ selectedCategories, onCategoryChange }: FilterPanelProps) {
  return (
    <Card className="shadow-none border-0 md:border md:shadow-sm bg-transparent md:bg-card">
      <CardHeader className="px-3 pt-3 pb-2 md:px-4 md:pt-4 md:pb-2">
        <CardTitle className="text-base md:text-lg">Filter by Category</CardTitle>
      </CardHeader>
      <CardContent className="px-1 py-0 md:px-4 md:pb-4">
        <ScrollArea className="h-[calc(100vh-200px)] md:h-auto md:max-h-[300px]">
          <div className="space-y-3 p-2 md:p-0">
            {healthMetricCategories.map((category) => (
              <div key={category} className="flex items-center space-x-3 rounded-md p-2 hover:bg-muted/50 transition-colors">
                <Checkbox
                  id={`filter-${category}`}
                  checked={selectedCategories.includes(category)}
                  onCheckedChange={(checked) => onCategoryChange(category, !!checked)}
                  aria-labelledby={`label-filter-${category}`}
                />
                <HealthIcon type={category} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`filter-${category}`} id={`label-filter-${category}`} className="cursor-pointer text-sm font-normal flex-1">
                  {healthMetricDisplayNames[category]}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

'use client';

import type { HealthEntry } from '@/types';
import TimelineItem from './timeline-item';
import { format, parseISO, isSameDay, isToday, isYesterday } from 'date-fns';

interface TimelineListProps {
  entries: HealthEntry[];
}

const groupEntriesByDate = (entries: HealthEntry[]) => {
  const grouped: Record<string, HealthEntry[]> = {};
  entries.forEach(entry => {
    const dateKey = format(parseISO(entry.date), 'yyyy-MM-dd');
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(entry);
  });
  return grouped;
};

const formatDateGroupHeader = (dateStr: string): string => {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
};

export default function TimelineList({ entries }: TimelineListProps) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground py-10">No health entries found. Try adjusting filters or adding a new entry.</p>;
  }

  const groupedEntries = groupEntriesByDate(entries);
  const dateKeys = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="space-y-8">
      {dateKeys.map(dateKey => (
        <section key={dateKey} aria-labelledby={`date-group-${dateKey}`}>
          <h2 id={`date-group-${dateKey}`} className="text-lg font-semibold text-foreground mb-4 pb-2 border-b sticky top-16 bg-background/80 py-2 z-10 backdrop-blur-sm">
            {formatDateGroupHeader(dateKey)}
          </h2>
          <div className="space-y-6">
            {groupedEntries[dateKey].map(entry => (
              <TimelineItem key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

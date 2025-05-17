'use client';

import type { HealthEntry, LipidPanelData } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthIcon } from '@/components/icons/health-icons';
import { healthMetricDisplayNames } from '@/types';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface TimelineItemProps {
  entry: HealthEntry;
}

const renderValue = (entry: HealthEntry) => {
  switch (entry.type) {
    case 'walking':
    case 'standing':
    case 'breathing':
    case 'pulse':
      return <p className="text-2xl font-semibold">{entry.value} <span className="text-sm font-normal text-muted-foreground">{entry.unit}</span></p>;
    case 'lipidPanel':
      const lp = entry.value as LipidPanelData;
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>Total Cholesterol: <span className="font-medium">{lp.totalCholesterol} mg/dL</span></div>
          <div>LDL: <span className="font-medium">{lp.ldl} mg/dL</span></div>
          <div>HDL: <span className="font-medium">{lp.hdl} mg/dL</span></div>
          <div>Triglycerides: <span className="font-medium">{lp.triglycerides} mg/dL</span></div>
        </div>
      );
    case 'appointment':
      return (
        <div className="text-sm space-y-1">
          {entry.doctor && <p>Doctor: <span className="font-medium">{entry.doctor}</span></p>}
          {entry.location && <p>Location: <span className="font-medium">{entry.location}</span></p>}
          {entry.reason && <p>Reason: <span className="font-medium">{entry.reason}</span></p>}
        </div>
      );
    case 'medication':
      return (
        <div className="text-sm space-y-1">
          <p>Dosage: <span className="font-medium">{entry.dosage}</span></p>
          <p>Frequency: <span className="font-medium">{entry.frequency}</span></p>
        </div>
      );
    case 'condition':
      return (
        <div className="text-sm space-y-1">
          {entry.diagnosisDate && <p>Diagnosis Date: <span className="font-medium">{format(parseISO(entry.diagnosisDate), 'PP')}</span></p>}
          {entry.status && <p>Status: <Badge variant={entry.status === 'active' ? 'destructive' : 'secondary'} className="capitalize">{entry.status}</Badge></p>}
        </div>
      );
    default:
      return null;
  }
};

export default function TimelineItem({ entry }: TimelineItemProps) {
  const title = entry.type === 'medication' ? entry.medicationName : entry.type === 'condition' ? entry.conditionName : entry.title;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
        <HealthIcon type={entry.type} className="h-8 w-8 text-primary mt-1" />
        <div className="flex-1">
          <CardTitle className="text-lg mb-0.5">{title}</CardTitle>
          <CardDescription className="text-xs">
            {healthMetricDisplayNames[entry.type]} &bull; {format(parseISO(entry.date), 'PPpp')}
          </CardDescription>
        </div>
        {entry.source && (
          <Badge variant={entry.source === 'manual' ? 'outline' : 'default'} className="capitalize text-xs">
            {entry.source}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="pb-3">
        {renderValue(entry)}
      </CardContent>
      {(entry.notes || (entry.type === 'appointment' && entry.visitNotes)) && (
        <CardFooter className="text-sm text-muted-foreground pt-0 pb-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-b-0">
              {(entry.notes && !(entry.type === 'appointment' && entry.visitNotes)) && (
                <>
                  <AccordionTrigger className="py-1 text-xs hover:no-underline justify-start gap-1">View Notes</AccordionTrigger>
                  <AccordionContent className="pt-1 pb-0 text-xs">{entry.notes}</AccordionContent>
                </>
              )}
              {entry.type === 'appointment' && entry.visitNotes && (
                 <>
                  <AccordionTrigger className="py-1 text-xs hover:no-underline justify-start gap-1">
                    {entry.source === 'uhc' ? 'View Visit Summary (UHC)' : 'View Notes'}
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-0 text-xs whitespace-pre-wrap">
                    {entry.visitNotes}
                    {entry.notes && <><br /><br /><strong>Personal Notes:</strong> {entry.notes}</>}
                  </AccordionContent>
                </>
              )}
            </AccordionItem>
          </Accordion>
        </CardFooter>
      )}
    </Card>
  );
}

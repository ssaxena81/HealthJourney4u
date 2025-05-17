
'use client';

import type { HealthEntry, HealthMetricType, LipidPanelData } from '@/types';
import { healthMetricCategories, healthMetricDisplayNames } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import React from 'react';


const baseSchema = z.object({
  date: z.date({ required_error: "Date is required." }),
  type: z.custom<HealthMetricType>((val) => healthMetricCategories.includes(val as HealthMetricType), {
    message: "Invalid health metric type.",
  }),
  notes: z.string().optional(),
});

// Schemas for each type, refine as needed for specific validation
const walkingSchema = baseSchema.extend({ title: z.string().min(1, "Title is required."), value: z.number().positive(), unit: z.enum(['steps', 'km', 'miles']) });
const standingSchema = baseSchema.extend({ title: z.string().min(1, "Title is required."), value: z.number().positive(), unit: z.enum(['minutes', 'hours']) });
const breathingSchema = baseSchema.extend({ title: z.string().min(1, "Title is required."), value: z.number().positive(), unit: z.literal('breaths/min'), quality: z.string().optional() });
const pulseSchema = baseSchema.extend({ title: z.string().min(1, "Title is required."), value: z.number().positive(), unit: z.literal('bpm') });
const lipidPanelSchema = baseSchema.extend({
  title: z.string().min(1, "Title is required."),
  value: z.object({
    totalCholesterol: z.number().positive(),
    ldl: z.number().positive(),
    hdl: z.number().positive(),
    triglycerides: z.number().positive(),
  }),
});
const appointmentSchema = baseSchema.extend({ title: z.string().min(1, "Title is required."), doctor: z.string().optional(), location: z.string().optional(), reason: z.string().optional(), visitNotes: z.string().optional() });
const medicationSchema = baseSchema.extend({ medicationName: z.string().min(1, "Medication name is required."), dosage: z.string().min(1, "Dosage is required."), frequency: z.string().min(1, "Frequency is required.") });
const conditionSchema = baseSchema.extend({ conditionName: z.string().min(1, "Condition name is required."), diagnosisDate: z.date().optional(), status: z.enum(['active', 'resolved', 'chronic']).optional() });


// This combined schema approach is tricky with react-hook-form conditional fields.
// A simpler approach is to have a generic form and then conditionally show fields.
// For validation, it might be easier to validate in the onSubmit based on type.
// Or use discriminated unions if react-hook-form supports them well with zod.
// For now, let's use a simpler schema and handle structure in onSubmit.

const formSchema = baseSchema.extend({
  // Common fields here, specific fields will be handled dynamically
  title: z.string().optional(), // Title is optional as medicationName/conditionName might be used
  value: z.any().optional(), // Number or object like LipidPanelData
  unit: z.string().optional(),
  // Appointment specific
  doctor: z.string().optional(),
  location: z.string().optional(),
  reason: z.string().optional(),
  visitNotes: z.string().optional(),
  // Medication specific
  medicationName: z.string().optional(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  // Condition specific
  conditionName: z.string().optional(),
  diagnosisDate: z.date().optional(),
  status: z.string().optional(), // For enum: z.enum(['active', 'resolved', 'chronic']).optional()

  // Lipid Panel specific
  totalCholesterol: z.number().optional(),
  ldl: z.number().optional(),
  hdl: z.number().optional(),
  triglycerides: z.number().optional(),
});


type FormValues = z.infer<typeof formSchema>;

interface ManualEntryFormProps {
  onAddEntry: (entry: HealthEntry) => void;
  onClose: () => void;
}

export default function ManualEntryForm({ onAddEntry, onClose }: ManualEntryFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      type: 'pulse', // Default type
      notes: '',
    },
  });

  const selectedType = form.watch('type');

  const onSubmit = (data: FormValues) => {
    // Construct the specific HealthEntry object based on selectedType
    // This is where you'd apply more specific validation if needed, or ensure correct structure
    let newEntry: HealthEntry;
    const baseEntryData = {
      id: crypto.randomUUID(),
      date: formatISO(data.date),
      type: data.type,
      notes: data.notes,
      source: 'manual' as const,
    };

    switch (data.type) {
      case 'walking':
        newEntry = { ...baseEntryData, type: 'walking', title: data.title!, value: Number(data.value), unit: data.unit as 'steps' | 'km' | 'miles' };
        break;
      case 'standing':
        newEntry = { ...baseEntryData, type: 'standing', title: data.title!, value: Number(data.value), unit: data.unit as 'minutes' | 'hours' };
        break;
      case 'breathing':
        newEntry = { ...baseEntryData, type: 'breathing', title: data.title!, value: Number(data.value), unit: 'breaths/min', quality: data.quality };
        break;
      case 'pulse':
        newEntry = { ...baseEntryData, type: 'pulse', title: data.title!, value: Number(data.value), unit: 'bpm' };
        break;
      case 'lipidPanel':
        newEntry = {
          ...baseEntryData,
          type: 'lipidPanel',
          title: data.title!,
          value: {
            totalCholesterol: Number(data.totalCholesterol),
            ldl: Number(data.ldl),
            hdl: Number(data.hdl),
            triglycerides: Number(data.triglycerides),
          },
        };
        break;
      case 'appointment':
        newEntry = { ...baseEntryData, type: 'appointment', title: data.title!, doctor: data.doctor, location: data.location, reason: data.reason, visitNotes: data.visitNotes };
        break;
      case 'medication':
        newEntry = { ...baseEntryData, type: 'medication', title: data.medicationName!, medicationName: data.medicationName!, dosage: data.dosage!, frequency: data.frequency! };
        break;
      case 'condition':
        newEntry = { ...baseEntryData, type: 'condition', title: data.conditionName!, conditionName: data.conditionName!, diagnosisDate: data.diagnosisDate ? formatISO(data.diagnosisDate) : undefined, status: data.status as 'active' | 'resolved' | 'chronic' | undefined };
        break;
      default:
        console.error('Invalid type for submission');
        return;
    }
    
    // Basic validation for required fields based on type before calling onAddEntry
    // This is a simplified validation. For robust validation, discriminated unions with Zod are better.
    if ((data.type === 'walking' || data.type === 'standing' || data.type === 'breathing' || data.type === 'pulse' || data.type === 'lipidPanel' || data.type === 'appointment') && !data.title) {
        form.setError("title", { type: "manual", message: "Title is required for this entry type." });
        return;
    }
    if (data.type === 'medication' && !data.medicationName) {
        form.setError("medicationName", { type: "manual", message: "Medication name is required." });
        return;
    }
     if (data.type === 'condition' && !data.conditionName) {
        form.setError("conditionName", { type: "manual", message: "Condition name is required." });
        return;
    }


    onAddEntry(newEntry);
    onClose();
  };
  
  const renderSpecificFields = () => {
    const commonTitleField = (label = "Title") => (
      <div>
        <Label htmlFor="title">{label}</Label>
        <Input id="title" {...form.register('title')} />
        {form.formState.errors.title && <p className="text-sm text-destructive mt-1">{form.formState.errors.title.message}</p>}
      </div>
    );

    switch (selectedType) {
      case 'walking':
        return <>
          {commonTitleField()}
          <div><Label htmlFor="value">Value</Label><Input id="value" type="number" {...form.register('value', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="unit">Unit</Label>
            <Controller name="unit" control={form.control} render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent><SelectItem value="steps">Steps</SelectItem><SelectItem value="km">Kilometers</SelectItem><SelectItem value="miles">Miles</SelectItem></SelectContent>
              </Select> )} />
          </div>
        </>;
      case 'standing':
         return <>
          {commonTitleField()}
          <div><Label htmlFor="value">Duration</Label><Input id="value" type="number" {...form.register('value', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="unit">Unit</Label>
            <Controller name="unit" control={form.control} render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent><SelectItem value="minutes">Minutes</SelectItem><SelectItem value="hours">Hours</SelectItem></SelectContent>
              </Select> )} />
          </div>
        </>;
      case 'breathing':
        return <>
          {commonTitleField()}
          <div><Label htmlFor="value">Rate (breaths/min)</Label><Input id="value" type="number" {...form.register('value', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="quality">Quality (optional)</Label><Input id="quality" {...form.register('quality')} /></div>
        </>;
      case 'pulse':
        return <>
          {commonTitleField()}
          <div><Label htmlFor="value">Pulse (bpm)</Label><Input id="value" type="number" {...form.register('value', { valueAsNumber: true })} /></div>
        </>;
      case 'lipidPanel':
        return <>
          {commonTitleField("Panel Name (e.g., Annual Checkup Panel)")}
          <div><Label htmlFor="totalCholesterol">Total Cholesterol (mg/dL)</Label><Input id="totalCholesterol" type="number" {...form.register('totalCholesterol', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="ldl">LDL (mg/dL)</Label><Input id="ldl" type="number" {...form.register('ldl', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="hdl">HDL (mg/dL)</Label><Input id="hdl" type="number" {...form.register('hdl', { valueAsNumber: true })} /></div>
          <div><Label htmlFor="triglycerides">Triglycerides (mg/dL)</Label><Input id="triglycerides" type="number" {...form.register('triglycerides', { valueAsNumber: true })} /></div>
        </>;
      case 'appointment':
        return <>
          {commonTitleField("Appointment For")}
          <div><Label htmlFor="doctor">Doctor (optional)</Label><Input id="doctor" {...form.register('doctor')} /></div>
          <div><Label htmlFor="location">Location (optional)</Label><Input id="location" {...form.register('location')} /></div>
          <div><Label htmlFor="reason">Reason (optional)</Label><Textarea id="reason" {...form.register('reason')} /></div>
          <div><Label htmlFor="visitNotes">Visit Notes (optional)</Label><Textarea id="visitNotes" {...form.register('visitNotes')} /></div>
        </>;
      case 'medication':
        return <>
          <div><Label htmlFor="medicationName">Medication Name</Label><Input id="medicationName" {...form.register('medicationName')} />
          {form.formState.errors.medicationName && <p className="text-sm text-destructive mt-1">{form.formState.errors.medicationName.message}</p>}
          </div>
          <div><Label htmlFor="dosage">Dosage</Label><Input id="dosage" {...form.register('dosage')} /></div>
          <div><Label htmlFor="frequency">Frequency</Label><Input id="frequency" {...form.register('frequency')} /></div>
        </>;
      case 'condition':
        return <>
          <div><Label htmlFor="conditionName">Condition Name</Label><Input id="conditionName" {...form.register('conditionName')} />
          {form.formState.errors.conditionName && <p className="text-sm text-destructive mt-1">{form.formState.errors.conditionName.message}</p>}
          </div>
          <div><Label htmlFor="diagnosisDate">Diagnosis Date (optional)</Label>
            <Controller name="diagnosisDate" control={form.control} render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                </Popover> )} />
          </div>
          <div><Label htmlFor="status">Status (optional)</Label>
            <Controller name="status" control={form.control} render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="chronic">Chronic</SelectItem></SelectContent>
              </Select> )} />
          </div>
        </>;
      default: return null;
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
      <ScrollArea className="h-[calc(100vh-200px)] pr-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="date">Date</Label>
            <Controller name="date" control={form.control} render={({ field }) => (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
              </Popover> )}
            />
             {form.formState.errors.date && <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>}
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Controller name="type" control={form.control} render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {healthMetricCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{healthMetricDisplayNames[cat]}</SelectItem>
                  ))}
                </SelectContent>
              </Select> )}
            />
            {form.formState.errors.type && <p className="text-sm text-destructive mt-1">{form.formState.errors.type.message}</p>}
          </div>
          
          {renderSpecificFields()}

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" {...form.register('notes')} />
          </div>
        </div>
      </ScrollArea>
      <div className="flex justify-end space-x-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Add Entry</Button>
      </div>
    </form>
  );
}


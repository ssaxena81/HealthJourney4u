
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X } from 'lucide-react';
import { featureComparisonData, type TierFeatureComparison } from '@/types'; // Using mock data

interface ComparePlansDialogProps {
  trigger: React.ReactNode;
}

const renderFeatureValue = (value: string | boolean) => {
  if (typeof value === 'boolean') {
    return value ? <Check className="h-5 w-5 text-green-600" /> : <X className="h-5 w-5 text-red-600" />;
  }
  return value;
};

export default function ComparePlansDialog({ trigger }: ComparePlansDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl"> {/* Wider dialog for table */}
        <DialogHeader>
          <DialogTitle>Compare Subscription Plans</DialogTitle>
          <DialogDescription>
            Choose the plan that best fits your needs.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <Table>
            <TableHeader className="sticky top-0 bg-background shadow-sm">
              <TableRow>
                <TableHead className="w-[200px]">Feature</TableHead>
                <TableHead className="text-center">Free</TableHead>
                <TableHead className="text-center">Silver</TableHead>
                <TableHead className="text-center">Gold</TableHead>
                <TableHead className="text-center">Platinum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {featureComparisonData.map((item: TierFeatureComparison) => (
                <TableRow key={item.feature}>
                  <TableCell className="font-medium">{item.feature}</TableCell>
                  <TableCell className="text-center">{renderFeatureValue(item.free)}</TableCell>
                  <TableCell className="text-center">{renderFeatureValue(item.silver)}</TableCell>
                  <TableCell className="text-center">{renderFeatureValue(item.gold)}</TableCell>
                  <TableCell className="text-center">{renderFeatureValue(item.platinum)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

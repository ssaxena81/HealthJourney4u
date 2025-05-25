
'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from './button';
import { ScrollArea } from './scroll-area';

interface ClickwrapAgreementDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  agreementTextLines: string[]; // Expecting an array of strings for easier formatting
  onAgree: () => void;
  agreeButtonText?: string;
  cancelButtonText?: string;
}

export default function ClickwrapAgreementDialog({
  isOpen,
  onOpenChange,
  title,
  agreementTextLines,
  onAgree,
  agreeButtonText = "I Agree",
  cancelButtonText = "Cancel",
}: ClickwrapAgreementDialogProps) {
  if (!isOpen) {
    return null;
  }

  const handleAgree = () => {
    onAgree();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <ScrollArea className="max-h-[60vh] pr-6"> {/* Added pr-6 for scrollbar visibility */}
          <div className="text-sm space-y-3 whitespace-pre-line">
            {agreementTextLines.map((line, index) => (
              // Using <p> for paragraphs, but simple text nodes for list items under a heading.
              // Assuming list items start with '-' or similar.
              <p key={index}>{line}</p>
            ))}
          </div>
        </ScrollArea>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>{cancelButtonText}</AlertDialogCancel>
          <AlertDialogAction onClick={handleAgree}>{agreeButtonText}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

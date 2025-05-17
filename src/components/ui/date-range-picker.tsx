
"use client"

import * as React from "react"
import { addDays, format } from "date-fns"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: { from?: Date; to?: Date };
    onValueChange?: (value: { from?: Date; to?: Date }) => void;
    disabled?: boolean;
}


export function DatePickerWithRange({
  className,
  value,
  onValueChange,
  disabled,
}: DatePickerWithRangeProps) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: value?.from,
    to: value?.to,
  })

  React.useEffect(() => {
    setDate({ from: value?.from, to: value?.to });
  }, [value]);

  const handleDateSelect = (selectedDateRange: DateRange | undefined) => {
    setDate(selectedDateRange);
    if (onValueChange) {
      onValueChange({ from: selectedDateRange?.from, to: selectedDateRange?.to });
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            disabled={disabled}
            className={cn(
              "w-full sm:w-[300px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

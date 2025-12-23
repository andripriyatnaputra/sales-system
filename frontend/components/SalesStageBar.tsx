"use client";

import { SALES_STAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function SalesStageBar({ stage }: { stage: number }) {
  return (
    <div className="space-y-1">
      {/* Labels */}
      <div className="flex justify-between text-[11px] text-muted-foreground">
        {SALES_STAGES.map((s) => (
          <span key={s.value}>{s.label}</span>
        ))}
      </div>

      {/* Progress segments */}
      <div className="flex gap-1">
        {SALES_STAGES.map((s, index) => (
          <div
            key={s.value}
            className={cn(
              "h-2 flex-1 rounded-sm transition-colors",
              index < stage ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
            )}
          />
        ))}
      </div>
    </div>
  );
}

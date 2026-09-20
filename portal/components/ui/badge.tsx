import { HTMLAttributes } from "react";

type Tone = "default" | "success" | "warning" | "destructive" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  default: "bg-primary text-primary-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({
  tone = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}

const STATE_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  THROTTLED: "warning",
  READ_ONLY: "muted",
  SUSPENDED: "destructive",
  EMERGENCY_BLOCK: "destructive",
};

export function StateBadge({ state }: { state: string }) {
  return <Badge tone={STATE_TONE[state] ?? "muted"}>{state}</Badge>;
}

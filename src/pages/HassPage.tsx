import { Zap } from "lucide-react";

export function HassPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
      <Zap className="size-10" />
      <h1 className="text-xl font-semibold text-foreground">Home Assistant</h1>
      <p>Coming soon — this is where the home controls will live.</p>
    </div>
  );
}

import { Lightbulb, Zap } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { okSchema } from "@shared/api";

type Status = "idle" | "running" | "done" | "error";

export function ControlPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("idle");

  async function allLightsOff() {
    setStatus("running");
    try {
      await apiFetch("/api/hass/scripts/all_lights_off/run", okSchema, {
        method: "POST",
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Control</h1>
      <Button
        onClick={() => void allLightsOff()}
        disabled={status === "running"}
      >
        <Lightbulb className="size-4" />
        All lights off
      </Button>
      {status === "done" && (
        <p className="text-sm text-muted-foreground">Done.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">
          Couldn&apos;t reach Home Assistant.
        </p>
      )}
      <div className="pt-2">
        <Button variant="outline" onClick={() => void navigate("/hass")}>
          <Zap className="size-4" />
          Open Home Assistant
        </Button>
      </div>
    </div>
  );
}

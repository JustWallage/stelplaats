import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

const HASS_URL = "https://hass.justwallage.nl";

export function HassPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-dvh flex-col pb-14 lg:pb-0">
      <div className="flex items-center border-b p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate("/control")}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <iframe
        title="Home Assistant"
        src={HASS_URL}
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}

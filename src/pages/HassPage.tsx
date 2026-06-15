import { ExternalLink } from "lucide-react";

const HASS_URL = "https://hass.justwallage.nl";

export function HassPage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">
          Home Assistant
        </h1>
        <a
          href={HASS_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Open directly <ExternalLink className="size-4" />
        </a>
      </div>
      <iframe
        title="Home Assistant"
        src={HASS_URL}
        className="h-[calc(100dvh-9rem)] w-full rounded-lg border lg:h-[calc(100dvh-5rem)]"
      />
    </div>
  );
}

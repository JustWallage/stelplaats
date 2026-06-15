import { ExternalLink } from "lucide-react";

const HASS_URL = "https://hass.justwallage.nl";

export function HassPage() {
  return (
    <div className="flex h-dvh flex-col pb-14 lg:pb-0">
      <div className="flex items-center justify-between px-4 py-3">
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
        className="min-h-0 w-full flex-1 border-t"
      />
    </div>
  );
}

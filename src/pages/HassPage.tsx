const HASS_URL = "https://hass.justwallage.nl";

export function HassPage() {
  return (
    <div className="h-dvh pb-14 lg:pb-0">
      <iframe
        title="Home Assistant"
        src={HASS_URL}
        className="size-full border-0"
      />
    </div>
  );
}

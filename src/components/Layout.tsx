import { Brush, House, Leaf, Wrench, Zap } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { useUser } from "@/components/AuthGate";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: House },
  { to: "/cleaning", label: "Cleaning", icon: Brush },
  { to: "/plants", label: "Plants", icon: Leaf },
  { to: "/house", label: "House", icon: Wrench },
  { to: "/hass", label: "Hass", icon: Zap },
];

function NavItems({ orientation }: { orientation: "bottom" | "side" }) {
  return (
    <>
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md text-sm transition-colors",
              orientation === "bottom"
                ? "flex-col gap-1 px-3 py-1.5 text-xs"
                : "px-3 py-2",
              isActive
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          <Icon className="size-5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function Layout() {
  const email = useUser();
  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden border-r lg:flex lg:w-56 lg:flex-col lg:gap-1 lg:p-4">
        <div className="px-3 py-2 text-lg font-bold">Stelplaats</div>
        <NavItems orientation="side" />
        <div className="mt-auto truncate px-3 py-2 text-xs text-muted-foreground">
          {email}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 flex items-stretch justify-around border-t bg-background/95 backdrop-blur lg:hidden">
        <NavItems orientation="bottom" />
      </nav>
    </div>
  );
}

export function ColumnLayout() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 lg:pb-8">
      <Outlet />
    </div>
  );
}

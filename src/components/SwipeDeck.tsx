import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { ColumnContainer } from "@/components/Layout";
import { ControlPage } from "@/pages/ControlPage";
import { Dashboard } from "@/pages/Dashboard";
import { SettingsPage } from "@/pages/SettingsPage";
import { TaskListPage } from "@/pages/TaskListPage";

const panels: { path: string; element: ReactNode }[] = [
  { path: "/", element: <Dashboard /> },
  { path: "/tasks", element: <TaskListPage /> },
  { path: "/control", element: <ControlPage /> },
  { path: "/settings", element: <SettingsPage /> },
];

export function SwipeDeck() {
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const firstSync = useRef(true);
  const settleTimer = useRef<number | undefined>(undefined);

  const activeIndex = Math.max(
    0,
    panels.findIndex((panel) => panel.path === location.pathname),
  );

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) {
      return;
    }

    const targetLeft = activeIndex * el.clientWidth;
    if (Math.abs(el.scrollLeft - targetLeft) > 1) {
      programmatic.current = true;
      el.scrollTo({
        left: targetLeft,
        behavior: firstSync.current ? "auto" : "smooth",
      });
    }
    firstSync.current = false;

    const onScroll = () => {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        if (programmatic.current) {
          programmatic.current = false;
          return;
        }
        const index = Math.round(el.scrollLeft / el.clientWidth);
        const next = panels[index];
        if (next !== undefined && next.path !== location.pathname) {
          void navigate(next.path);
        }
      }, 120);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(settleTimer.current);
    };
  }, [activeIndex, location.pathname, navigate]);

  useEffect(() => {
    const el = containerRef.current;
    if (el === null) {
      return;
    }
    const onResize = () => {
      const targetLeft = activeIndex * el.clientWidth;
      if (Math.abs(el.scrollLeft - targetLeft) > 1) {
        programmatic.current = true;
        el.scrollTo({ left: targetLeft, behavior: "auto" });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [activeIndex]);

  return (
    <div
      ref={containerRef}
      data-testid="swipe-deck"
      className="no-scrollbar flex h-dvh snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
    >
      {panels.map((panel, index) => (
        <section
          key={panel.path}
          data-deck-path={panel.path}
          inert={index !== activeIndex}
          aria-hidden={index !== activeIndex}
          className="h-full w-full shrink-0 snap-start overflow-y-auto"
        >
          <ColumnContainer>{panel.element}</ColumnContainer>
        </section>
      ))}
    </div>
  );
}

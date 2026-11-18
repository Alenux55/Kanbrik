"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { useSensor, useSensors } from "@dnd-kit/core";
import {
  PlannerDragGuard,
  PlannerSensor,
  type PlannerSensorOptions,
} from "@/lib/planner-drag";
import { usePlannerSession } from "./planner-session";

export function usePlannerDrag(
  parts: unknown[],
  enabled: boolean,
  scroll: PlannerSensorOptions["scroll"],
) {
  const session = usePlannerSession();
  const [lease] = useState(session.capture);
  const [guard] = useState(() => new PlannerDragGuard());
  useLayoutEffect(() => {
    guard.configure(
      parts,
      () =>
        enabled &&
        session.isCurrent(lease) &&
        session.getSnapshot().phase === "ready" &&
        !document.querySelector("dialog[open]"),
    );
  });
  useEffect(() => {
    const unsubscribe = session.subscribe(() => {
      if (!guard.ready()) guard.cancel?.();
    });
    return () => {
      unsubscribe();
      guard.cancel?.();
    };
  }, [session, guard]);
  return {
    guard,
    sensors: useSensors(useSensor(PlannerSensor, { guard, scroll })),
  };
}

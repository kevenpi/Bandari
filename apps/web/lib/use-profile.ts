"use client";

import { useEffect, useRef, useState } from "react";
import { getProfile, type ScreeningResult, type Subject } from "./compliance";

/**
 * Reads a screening profile from the client-side store and keeps it live so the
 * `screening → verified/in_review` animation (and ops decisions) reflect without
 * a manual refresh. Polls localStorage cheaply and only re-renders on change.
 */
export function useProfile(subject: Subject | null): ScreeningResult | null {
  const [profile, setProfile] = useState<ScreeningResult | null>(null);
  const last = useRef<string>("");
  const key = subject ? `${subject.id}|${subject.name}|${subject.verifiedSeed ? 1 : 0}` : "";

  useEffect(() => {
    if (!subject) {
      setProfile(null);
      last.current = "";
      return;
    }
    const tick = () => {
      const p = getProfile(subject);
      const ser = JSON.stringify(p);
      if (ser !== last.current) {
        last.current = ser;
        setProfile(p);
      }
    };
    tick();
    const t = setInterval(tick, 700);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profile;
}

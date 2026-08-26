"use client";

import Image from "next/image";

export type RobotPresenceState = "idle" | "moving" | "charging" | "offline";

const STATE_DOT: Record<RobotPresenceState, string> = {
  idle: "var(--bob-cyan)",
  moving: "var(--bob-cyan)",
  charging: "var(--bob-charge)",
  offline: "var(--bob-muted-2)",
};

export function RobotPresence({
  state = "idle",
  size = 172,
  className = "",
}: {
  state?: RobotPresenceState;
  size?: number;
  className?: string;
}) {
  const pulse =
    state === "offline"
      ? "none"
      : state === "moving"
        ? "bobPulse 1.1s ease-in-out infinite"
        : "bobPulse 2.4s ease-in-out infinite";
  const float =
    state === "offline" ? "none" : "bobFloat 4.2s ease-in-out infinite";

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ height: size + 14 }}
    >
      <div
        className="bob-pulse absolute rounded-full"
        style={{
          width: size + 18,
          height: size + 18,
          background:
            "radial-gradient(circle, rgba(0,176,240,.42) 0%, rgba(0,176,240,0) 68%)",
          animation: pulse,
        }}
      />
      <div
        className="absolute bottom-4 rounded-full"
        style={{
          width: size * 0.77,
          height: 14,
          background:
            "radial-gradient(ellipse, rgba(0,176,240,.30), rgba(0,176,240,0) 70%)",
        }}
      />
      <Image
        src="/brand/bob-mark.png"
        alt="BOB"
        width={size}
        height={Math.round(size * 1.39)}
        className="bob-float relative w-auto"
        style={{ height: size, width: "auto", animation: float }}
        priority
      />
      {state === "moving" ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="bob-scan absolute top-0 bottom-0 w-[34px]"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,176,240,0), rgba(0,176,240,.20), rgba(0,176,240,0))",
              animation: "bobScan 3.4s linear infinite",
            }}
          />
        </div>
      ) : null}
      <span
        className="sr-only"
        data-state={state}
        style={{ background: STATE_DOT[state] }}
      />
    </div>
  );
}

export function robotDotColor(state: RobotPresenceState) {
  return STATE_DOT[state];
}

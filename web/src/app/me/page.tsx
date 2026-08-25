"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

type Appt = {
  id: string;
  guestName: string;
  startsAt: string;
  status: string;
  robot: { id: string; displayName: string };
};

export default function MePage() {
  const [items, setItems] = useState<Appt[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me/appointments");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.appointments ?? []);
    })();
  }, []);

  return (
    <div>
      <h1 className="bob-page-title">I miei appuntamenti</h1>
      <p className="text-[var(--bob-muted)] mt-1">
        Solo gli appuntamenti collegati al tuo account
      </p>

      <ul className="mt-8 space-y-3">
        {items.length === 0 ? (
          <li className="text-[var(--bob-muted)]">Nessun appuntamento.</li>
        ) : (
          items.map((a) => (
            <li
              key={a.id}
              className="bob-card px-4 py-3"
            >
              <p className="font-semibold text-lg">
                {format(new Date(a.startsAt), "dd/MM/yyyy HH:mm")}
              </p>
              <p className="text-sm text-[var(--bob-muted)]">
                {a.robot.displayName} · {a.status}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/modules/access/input";

export function ActionForm({
  action,
  label,
  children,
  className = "grid gap-3",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className={className} aria-busy={pending}>
      {children}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Procesando…" : label}
      </button>
      {state.error && (
        <p role="alert" className="text-rose-300">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-emerald-300">
          {state.message}
        </p>
      )}
    </form>
  );
}

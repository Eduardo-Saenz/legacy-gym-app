"use client";

import { useSyncExternalStore } from "react";
import { activate, recoverPassword } from "@/modules/access/actions";
import { ActionForm } from "./action-form";

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function LinkPasswordForm({ invitation }: { invitation: boolean }) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("token") ?? "";
  const id = params.get("id") ?? "";
  if (!token || (invitation && !id))
    return <p>Abre el enlace que recibiste por correo.</p>;

  return (
    <ActionForm
      action={invitation ? activate : recoverPassword}
      label={invitation ? "Activar cuenta" : "Guardar contraseña"}
    >
      <input type="hidden" name="token" value={token} />
      {invitation && (
        <>
          <input type="hidden" name="id" value={id} />
          <label>
            Correo de la invitación{" "}
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </>
      )}
      <label>
        Nueva contraseña{" "}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
        />
      </label>
    </ActionForm>
  );
}

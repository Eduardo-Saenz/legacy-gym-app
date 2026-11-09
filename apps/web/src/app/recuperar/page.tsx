import { ActionForm } from "@/components/action-form";
import { Portal, Panel } from "@/components/portal";
import { requestRecovery } from "@/modules/access/actions";

export default function RecoveryPage() {
  return (
    <Portal title="Recuperar contraseña">
      <Panel title="Enviar instrucciones">
        <ActionForm action={requestRecovery} label="Enviar correo">
          <label>
            Correo{" "}
            <input name="email" type="email" autoComplete="email" required />
          </label>
        </ActionForm>
      </Panel>
    </Portal>
  );
}

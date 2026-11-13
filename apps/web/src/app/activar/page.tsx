import { LinkPasswordForm } from "@/components/link-password-form";
import { Panel, Portal } from "@/components/portal";

export default function ActivationPage() {
  return (
    <Portal title="Activar tu cuenta">
      <Panel title="Confirmar invitación">
        <p>
          Confirma el correo al que llegó la invitación y elige una contraseña.
        </p>
        <LinkPasswordForm invitation />
      </Panel>
    </Portal>
  );
}

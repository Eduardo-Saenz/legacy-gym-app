import { LinkPasswordForm } from "@/components/link-password-form";
import { Panel, Portal } from "@/components/portal";

export default function ChangePasswordPage() {
  return (
    <Portal title="Cambiar contraseña">
      <Panel title="Recuperación">
        <LinkPasswordForm invitation={false} />
      </Panel>
    </Portal>
  );
}

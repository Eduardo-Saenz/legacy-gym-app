import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Portal, Panel } from "@/components/portal";
import { signIn } from "@/modules/access/actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const messages = await searchParams;
  return (
    <Portal title="Iniciar sesión">
      <Panel title="Acceso a Legacy Gym">
        {messages.sesion && <p role="status">Inicia sesión para continuar.</p>}
        {messages.recuperada && (
          <p role="status">Contraseña actualizada. Inicia sesión de nuevo.</p>
        )}
        {messages.activada && (
          <p role="status">Cuenta activada. Inicia sesión para continuar.</p>
        )}
        <ActionForm action={signIn} label="Entrar">
          <label>
            Correo{" "}
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Contraseña{" "}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
        </ActionForm>
        <Link href="/recuperar">Olvidé mi contraseña</Link>
      </Panel>
    </Portal>
  );
}

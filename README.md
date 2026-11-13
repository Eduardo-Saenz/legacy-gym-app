# Legacy Gym App

Plataforma web para coaches deportivos y sus clientes. La Fase 2 incorpora acceso por correo y contraseña, invitaciones, ficha personal, mediciones con revisiones y consentimiento por relación. La aplicación usa Next.js App Router, TypeScript estricto, Tailwind y Supabase Auth/PostgreSQL.

## Desarrollo local en WSL2

Usa Node.js según [`.nvmrc`](.nvmrc), pnpm según [`package.json`](package.json) y Docker con integración para tu distribución WSL. Trabaja únicamente con cuentas y datos ficticios.

```sh
nvm install
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm db:start
corepack pnpm dev:local
```

Abre [la web](http://127.0.0.1:3000) y [Mailpit](http://127.0.0.1:54324). Usa la dirección `127.0.0.1` de la web para mantener la misma sesión al seguir los enlaces. El servidor obtiene las claves locales de Supabase sin imprimirlas ni guardarlas en archivos. La API local usa el puerto 54321, PostgreSQL el 54322 y [Studio](http://127.0.0.1:54323) el 54323.

Si Supabase ya estaba en marcha con una versión anterior, ejecuta `corepack pnpm exec supabase migration up --local` y luego `corepack pnpm db:stop` y `corepack pnpm db:start`. La parada normal preserva el volumen y el reinicio carga la plantilla de recuperación. En una instancia desechable, `corepack pnpm exec supabase db reset --local` reconstruye la base y borra su contenido local. CI ejecuta ese comando en un runner nuevo.

## Probar el flujo manualmente

1. Aprovisiona el primer coach con una contraseña ficticia de al menos 12 caracteres. En Bash, el siguiente comando lee la contraseña sin mostrarla. Si se repite con la misma cuenta provisionada, conserva el acceso y la contraseña existente.

   ```bash
   read -rsp 'Contraseña ficticia: ' LEGACY_COACH_PASSWORD
   printf '\n'
   LEGACY_COACH_EMAIL=coach@example.invalid LEGACY_COACH_PASSWORD="$LEGACY_COACH_PASSWORD" corepack pnpm coach:local
   unset LEGACY_COACH_PASSWORD
   ```

2. Inicia sesión como coach en la web e invita a `cliente@example.invalid`. El portal muestra vigencia, estado y entrega. Puedes reenviar o revocar una invitación pendiente.
3. Abre el correo de invitación en Mailpit. En una ventana privada sigue el enlace, confirma el correo y establece la contraseña. Completa el nombre y, si quieres, la fecha de nacimiento. Registra una medición.
4. En el portal del cliente, concede lectura de ficha e historial y permiso de corrección. Para probar el resto, concede también edición de ficha y registro de mediciones. En el portal del coach, abre el cliente y corrige una medición. Comprueba que el cliente ve el valor original y la revisión.
5. Revoca la lectura de historial desde el portal del cliente y recarga la página del coach. La sesión anterior pierde acceso en la siguiente consulta.
6. Cierra sesión, selecciona **Olvidé mi contraseña** y abre el correo de recuperación en Mailpit. Confirma la contraseña nueva y vuelve a iniciar sesión.

## Comprobaciones

```sh
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm db:test
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e:access
```

En un Linux sin las bibliotecas del navegador, usa `corepack pnpm exec playwright install --with-deps chromium`. La suite completa de Playwright usa el build en el puerto 3100 y requiere Supabase y Mailpit locales. `corepack pnpm test:e2e` ejecuta la comprobación web independiente. GitHub Actions valida la web y reconstruye la base en trabajos separados. Las suites crean y retiran sus propios datos ficticios.

Consulta [la implementación de la Fase 2](docs/phase-2.md), el [contrato HTTP de mediciones](docs/measurements.openapi.yaml) y el [índice de documentación](docs/README.md).

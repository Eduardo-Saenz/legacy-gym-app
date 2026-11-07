# Legacy Gym App

Plataforma web para coaches deportivos y sus clientes. La Fase 1 prepara un monolito modular con Next.js App Router, TypeScript estricto, Tailwind CSS y Supabase Auth/PostgreSQL. La portada y `GET /api/v1/health` comprueban que la web responde. La aplicación funcional comienza en la Fase 2.

## Desarrollo local en WSL2

Requisitos:

- Node.js según [`.nvmrc`](.nvmrc) y pnpm según [`package.json`](package.json).
- Docker con acceso desde la distribución WSL (`docker info`). Con Docker Desktop, habilita la integración para esa distribución.

Desde la raíz de un clon:

```sh
nvm install
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Abre [la web](http://localhost:3000). Para usar `pnpm` directamente en los comandos siguientes, habilita Corepack con `corepack enable` o antepón `corepack` a cada comando. La web de esta fase arranca por separado de la base de datos.

## Supabase local

```sh
pnpm db:start
pnpm db:test
pnpm db:stop
```

La API local usa el puerto 54321, PostgreSQL el 54322 y [Studio](http://127.0.0.1:54323) el 54323. El arranque aplica las migraciones pendientes. En una instancia **desechable**, `pnpm exec supabase db reset --local` reconstruye la base y borra su contenido local. CI lo ejecuta en un runner nuevo.

Las pruebas pgTAP verifican RLS y grants. La suite de integración aprovisiona cuentas ficticias `example.invalid` mediante Auth local, conserva los JWT de inicio de sesión durante las pruebas y elimina sus fixtures al finalizar. Usa las claves generadas por Supabase local únicamente dentro del proceso de pruebas. El registro público y el anónimo están deshabilitados.

### Superficie de la Data API

| Recurso en `gym_api` | Lectura autenticada                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `profiles`           | Identificador del perfil propio                                                                                           |
| `organizations`      | Identificador y nombre de la organización de una membresía de coach vigente                                               |
| `coach_memberships`  | Membresías propias vigentes                                                                                               |
| `clients`            | Identificadores del cliente y su perfil. Visible para el titular o su coach vigente con autorización `client_record_read` |

Las relaciones y las autorizaciones quedan en `gym_private`. Las escrituras de usuarios por la Data API están denegadas y la única función elevada se usa dentro de una política de lectura. El índice parcial de PostgreSQL impone una relación activa global por cliente. La suite comprueba intentos de autoasignación, acceso cruzado, revocación, transferencia y asignaciones simultáneas entre organizaciones.

## Comprobaciones

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

En un Linux sin las bibliotecas del navegador, usa `pnpm exec playwright install --with-deps chromium`. Playwright prueba el build en el puerto 3100. GitHub Actions ejecuta las verificaciones web y de base de datos en trabajos separados.

Siguen pendientes el mecanismo de activación, el tratamiento de cuentas existentes, los campos editables y el alcance de la autorización histórica. Consulta el [plan por fases](docs/plan.md), las [decisiones de arquitectura](docs/decisions/README.md) y las [instrucciones del repositorio](AGENTS.md).

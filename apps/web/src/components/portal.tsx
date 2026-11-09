import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/modules/access/actions";

export function Portal({
  title,
  children,
  back,
}: {
  title: string;
  children: ReactNode;
  back?: string;
}) {
  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href={back ?? "/"}>Legacy Gym App</Link>
        {back && (
          <form action={signOut}>
            <button className="secondary-button">Cerrar sesión</button>
          </form>
        )}
      </header>
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </main>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-slate-700 bg-slate-900 p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold">Legacy Gym App</h1>
      <p className="mt-4 text-slate-300">
        Entorno de desarrollo con datos ficticios.
      </p>
      <Link className="mt-5 inline-block" href="/cuenta">
        Ir a mi cuenta
      </Link>
    </main>
  );
}

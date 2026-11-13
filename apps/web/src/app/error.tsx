"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto grid max-w-4xl gap-3 p-6">
      <h1 className="text-2xl font-bold">No se pudo cargar esta página</h1>
      <button className="secondary-button" onClick={reset}>
        Volver a intentar
      </button>
    </main>
  );
}

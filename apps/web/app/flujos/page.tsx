// Creador de Flujos — absorbido dentro del shell.
// Es una app HTML/JS autocontenida (offline, usa localStorage propio), servida
// como estático desde /public/tools/flujos/ y embebida en un iframe aislado.
// Para actualizarla en el futuro: regenera su index.html con `build-html.mjs`
// en la app original y copia el resultado a public/tools/flujos/index.html.

export const metadata = { title: "Creador de Flujos · Mi Plataforma" };

export default function FlujosPage() {
  return (
    <iframe
      src="/tools/flujos/index.html"
      title="Creador de Flujos"
      className="h-full w-full border-0"
    />
  );
}

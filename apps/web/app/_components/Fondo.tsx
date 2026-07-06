// Fondo animado global (aurora verde). Se monta una vez en el layout y vive
// detrás de TODA la app, para que Datibot se sienta como un solo producto.
export function Fondo() {
  return (
    <div className="aurora" aria-hidden>
      <div className="aurora-blob aurora-a" />
      <div className="aurora-blob aurora-b" />
      <div className="aurora-blob aurora-c" />
    </div>
  );
}

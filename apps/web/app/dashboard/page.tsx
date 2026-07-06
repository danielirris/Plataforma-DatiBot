// Dashboard ads — servicio Streamlit embebido.
// El servicio corre aparte (apps/dashboard-service, puerto 8501) y se embebe
// aquí en un iframe. Sus API keys se gestionan en /configuracion, que genera
// apps/dashboard-service/.env (leído por python-dotenv al arrancar el servicio).
//
// La URL del servicio es configurable por si en producción vive en otro host.

export const metadata = { title: "Dashboard ads · Mi Plataforma" };

// Render dinámico: la URL se lee del entorno EN RUNTIME (no se incrusta en build),
// así EasyPanel puede inyectar el subdominio del servicio sin rebuild.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:8501";
  return (
    <iframe
      src={`${DASHBOARD_URL}/?embed=true`}
      title="Dashboard ads"
      className="h-full w-full border-0"
    />
  );
}

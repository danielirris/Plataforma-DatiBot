// Dashboard ads — servicio Streamlit embebido, con marco Datibot.
// El servicio corre aparte (apps/dashboard-service, puerto 8501) y se embebe
// aquí en un iframe. La URL se lee del entorno EN RUNTIME (EasyPanel inyecta el
// subdominio sin rebuild).

import { EmbeddedFrame } from "../_components/EmbeddedFrame";

export const metadata = { title: "Dashboard ads · Datibot" };
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:8501";
  return (
    <EmbeddedFrame
      src={`${DASHBOARD_URL}/?embed=true`}
      title="Dashboard ads"
      icon="📊"
      description="ROAS, CPA y métricas de tus campañas de Facebook Ads."
    />
  );
}

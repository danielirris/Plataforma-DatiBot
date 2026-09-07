// Se ejecuta UNA vez al arrancar el servidor (Next.js instrumentation).
// Renovador automático de la media de WhatsApp: al arrancar (a los 2 min) y luego cada
// 24 h, re-sube la media VENCIDA (>20 días) para refrescar los media_id, sin cron
// externo. Corre dentro del propio servicio web. Si Supabase no está configurado, no
// hace nada (no-op seguro).
export async function register() {
  // Solo en el runtime de Node (no en edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const UN_DIA = 24 * 60 * 60 * 1000;

  const correr = async () => {
    try {
      const { renovarVencidas } = await import("./lib/embudos/renovar");
      const r = await renovarVencidas();
      if (r.corrio && r.resultados.length) {
        console.log(`[media] renovación automática: ${r.resultados.length} fila(s) vencida(s) procesada(s)`);
      }
    } catch (e) {
      console.warn("[media] fallo en la renovación automática:", e);
    }
  };

  // Un rato después de arrancar (deja estabilizar el server) y luego a diario.
  setTimeout(correr, 2 * 60 * 1000);
  setInterval(correr, UN_DIA);
}

// Traduce errores CRUDOS de Supabase/PostgREST/Postgres a una explicación clara en
// español, con qué hacer. Si no reconoce el error, devuelve el original tal cual (no se
// pierde información para depurar). Se aplica en el punto ÚNICO `parseError()` de
// supabase.ts, así TODAS las rutas de embudos devuelven mensajes entendibles al usuario.
export function explicarError(raw: string): string {
  const msg = String(raw ?? "");
  const m = msg.toLowerCase();

  // NOT NULL en una columna concreta (ej. media_bots.phone_id).
  const nulo = /null value in column "([^"]+)"/i.exec(msg);
  if (nulo) {
    const col = nulo[1];
    if (col === "phone_id")
      return "Falta el número que aloja la media. Sube primero el archivo (el caption se guarda junto con él) o elige el número en «Número que aloja la media».";
    if (col === "numero_whatsapp")
      return "Falta el número de WhatsApp: es obligatorio para guardar el número.";
    if (col === "producto" || col === "pais")
      return "Falta el producto o el país (son la clave del registro).";
    return `Falta un dato obligatorio («${col}»). Complétalo antes de guardar.`;
  }

  // Columna inexistente en la tabla (PGRST204).
  const sinCol = /could not find the '([^']+)' column/i.exec(msg);
  if (sinCol)
    return `La columna «${sinCol[1]}» no existe en esa tabla de Supabase. Falta crearla (revisa el schema.sql o corre un ALTER TABLE).`;

  // Clave duplicada / restricción única.
  if (m.includes("duplicate key") || m.includes("violates unique"))
    return "Ya existe un registro con esa misma clave. Recarga y edita el que hay en vez de crear otro.";

  // Insert en lote con claves distintas (PGRST102).
  if (m.includes("all object keys must match"))
    return "Error interno al guardar varias filas a la vez. Reintenta; si sigue, guarda de a un país.";

  // Llave foránea.
  if (m.includes("foreign key"))
    return "Ese registro depende de otro que aún no existe. Crea primero el producto o la relación.";

  // Credenciales / permisos de Supabase.
  if (
    m.includes("jwt") ||
    m.includes("invalid api key") ||
    m.includes("permission denied") ||
    m.includes("row-level security") ||
    m.includes("row level security")
  )
    return "Problema de credenciales o permisos con Supabase. Revisa EMBUDOS_SUPABASE_SERVICE_KEY en el Environment de EasyPanel (servicio web).";

  return msg; // desconocido: se deja el original para no perder información.
}

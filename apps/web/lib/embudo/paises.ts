// Datos FIJOS por país del embudo COD de WhatsApp (spec §5). NO los genera la IA:
// se leen de aquí y se inyectan en los mensajes (pago, montos de los 7 niveles y
// ajuste léxico regional). Los montos son la escalera: nivel 1 (base) → nivel 7 (VIP).

export interface PaisEmbudo {
  codigo: string;
  nombre: string;
  bandera: string;
  /** número de cuenta / teléfono de pago */
  cuenta: string;
  titular: string;
  /** titular corto para "A nombre de" */
  titularCorto: string;
  /** métodos de pago (texto para el mensaje) */
  metodos: string;
  /** identificación extra obligatoria (RUT en CL, cédula en VE); "" si no aplica */
  identificacion: string;
  alias: string; // Bre-B (solo CO); "" si no aplica
  moneda: string; // código: COP, PEN, USD, CLP, VES
  simbolo: string; // $, S/, Bs
  /** los 7 montos de la escalera (nivel 1..7) en la moneda local */
  montos: number[];
  /** últimos dígitos de la cuenta (para validar el comprobante) */
  hint: string;
  /** piezas léxicas regionales que la IA debe usar */
  lexico: string[];
}

export const PAISES_EMBUDO: PaisEmbudo[] = [
  {
    codigo: "CO",
    nombre: "Colombia",
    bandera: "🇨🇴",
    cuenta: "3058176936",
    titular: "Daniel Garay",
    titularCorto: "Dan Gar",
    metodos: "Nequi, Daviplata o Bre-B",
    identificacion: "",
    alias: "@copa2025",
    moneda: "COP",
    simbolo: "$",
    montos: [12000, 16000, 20000, 24000, 28000, 32000, 40000],
    hint: "6936",
    lexico: ["un ratico", "de una", "chévere", "droguería"],
  },
  {
    codigo: "PE",
    nombre: "Perú",
    bandera: "🇵🇪",
    cuenta: "935616142",
    titular: "Said Zambrano",
    titularCorto: "Said Z",
    metodos: "Yape o Plin",
    identificacion: "",
    alias: "",
    moneda: "PEN",
    simbolo: "S/",
    montos: [10, 13, 17, 20, 23, 27, 33],
    hint: "6142",
    lexico: ["un ratito", "chévere", "farmacia", "plata"],
  },
  {
    codigo: "EC",
    nombre: "Ecuador",
    bandera: "🇪🇨",
    cuenta: "2215371629",
    titular: "Joshue Gruezo",
    titularCorto: "Joshue G",
    metodos: "Banco Pichincha",
    identificacion: "",
    alias: "",
    moneda: "USD",
    simbolo: "$",
    montos: [4, 5, 7, 8, 9, 11, 13],
    hint: "1629",
    lexico: ["un ratito", "bacán", "farmacia"],
  },
  {
    codigo: "CL",
    nombre: "Chile",
    bandera: "🇨🇱",
    cuenta: "18495249",
    titular: "NEXO SOLUTIONS SPA",
    titularCorto: "NEXO SOLUTIONS",
    metodos: "Banco Bci o Mach",
    identificacion: "RUT 78.187.335-7",
    alias: "",
    moneda: "CLP",
    simbolo: "$",
    montos: [3500, 4700, 5800, 7000, 8200, 9300, 11700],
    hint: "5249",
    lexico: ["un ratito", "bacán", "farmacia", "harto"],
  },
  {
    codigo: "VE",
    nombre: "Venezuela",
    bandera: "🇻🇪",
    cuenta: "04246846242",
    titular: "Andres Acosta",
    titularCorto: "Andres A",
    metodos: "Pago Móvil BNC",
    identificacion: "Cédula 24252177",
    alias: "",
    moneda: "VES",
    simbolo: "Bs",
    montos: [2650, 3500, 4400, 5300, 6150, 7050, 8800],
    hint: "6242",
    lexico: ["un ratico", "chévere", "farmacia", "real"],
  },
];

export function paisEmbudo(codigo: string): PaisEmbudo | undefined {
  return PAISES_EMBUDO.find((p) => p.codigo === codigo);
}

/** Formatea un monto con separador de miles local (12000 → "12.000"). */
export function fmtMonto(n: number): string {
  return n.toLocaleString("es-CO");
}

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

// Los 10 mensajes del embudo COD, en el orden canónico de la spec §1.
export const RANURAS_EMBUDO: { key: string; label: string; descripcion: string }[] = [
  { key: "msg_bienvenida", label: "1 · Bienvenida", descripcion: "Presenta un humano con nombre y oficio + espejo del deseo + neutraliza la objeción #1. Sin botón." },
  { key: "msg_imagen_caption", label: "2 · Caption del pack", descripcion: "Muestra el tamaño del regalo: 5-6 bullets ✅ de lo que se lleva (los bonos van marcados como BONO al final). Sin botón." },
  { key: "msg_compromiso_1", label: "3 · Compromiso 1", descripcion: "Promete un resultado con plazo corto y baja fricción. Termina en la instrucción del botón «Recibir material»." },
  { key: "msg_compromiso_2", label: "4 · Compromiso 2 (el clave)", descripcion: "El trato de confianza: «transparente», «Primero te envío TODO… después tú decides», «contar con tu palabra». Termina en «Quiero recibirlo»." },
  { key: "msg_felicitacion", label: "5 · Felicitación", descripcion: "Tras los PDFs: cierra el ciclo, da el primer micro-paso. NO menciona pago." },
  { key: "msg_cobro", label: "6 · Cobro (escalera 7 niveles)", descripcion: "La escalera acumulativa de 7 niveles con los montos fijos del país. Cada nivel «Todo lo anterior + un bono»." },
  { key: "msg_datos_pago", label: "7 · Datos de pago", descripcion: "Cuentas + comprobante. Único mensaje con datos duros. Incluye RUT/cédula si el país lo exige." },
  { key: "msg_bonos_intro", label: "8 · Bonos intro", descripcion: "Cuando se valida el comprobante: gracias + «esto es lo que desbloqueaste»." },
  { key: "msg_bonos_outro", label: "9 · Bonos outro", descripcion: "Cierre tras los links de bonos: recordatorio de la lógica de valor." },
  { key: "msg_recordatorio", label: "10 · Recordatorio (+25 min)", descripcion: "Cobrar sin cobrar: cálido, cero amenaza, cero urgencia falsa. Prohibido «última oportunidad», «retirar», contadores." },
];

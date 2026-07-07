# Especificación de Estilos de Edición — App de Video Vertical

> Documento de handoff para desarrollo. Define 5 estilos de edición, las nuevas
> "movidas de editor" que hay que construir, y la lógica de disparo para que la
> app decida sola cuándo aplicar cada efecto (que siga siendo automático y que
> los videos NO salgan todos iguales).

**Leyenda de estado**
- ✅ = ya existe / la app ya lo renderiza hoy.
- 🔧 = requiere código nuevo (no existe todavía).

---

## 0. Contexto y objetivo

Hoy la app pega elementos *encima* del video (subtítulos, tarjetas full-screen,
píldoras, emojis). El resultado es bonito pero plantillero: todos los videos
salen parecidos.

El objetivo de esta spec es sumar **intervenciones sobre el video mismo** (blanco
y negro por tramos, zoom/punch-in, freeze frame, split-screen, etc.) y un **motor
de variedad** que elija movidas distintas por video. Cada uno de los 5 estilos
tiene una **firma de edición** propia: no se diferencian solo por color o
intensidad, sino por *qué le hacen al video*.

**Regla dura transversal (aplica a todo):** ceñirse SIEMPRE al audio. No inventar
cifras, precios ni datos que la voz no diga. Todos los efectos se sincronizan con
la transcripción (timestamps por palabra) y con el audio.

---

## 1. Piezas actuales ✅ (ya renderiza)

- **Video vertical** 1080×1920, conserva audio/voz original.
- **Subtítulos** quemados, fuente Anton en MAYÚSCULAS, palabra por palabra, con
  contorno. 5 tipos: `pop`, `karaoke`, `box`, `punch`, `color`.
- **Tarjetas full-screen** (2-3): fondo de color + frase grande + emoji. Duran
  ~2 s y ocultan los subtítulos.
- **Píldoras / badges** (2-5): etiquetas flotantes con texto + emoji.
- **Emojis contextuales** (3-6) con pop.
- **Listas animadas** cuando la voz enumera.
- **Paleta vibrante aleatoria** por video (no se fijan colores exactos; sí se
  pide intención: monocromático / contrastante / mínimo / muy colorido).
- **Música con ducking** + SFX cortos (whoosh/pop/ding).
- **Intensidad** 0-100 (regula qué tan cargada es la edición).
- **CTA final:** "Haz clic para conseguir el tuyo" + botón a WhatsApp (sin número
  visible).
- **Safe-area:** márgenes 8-10%, nada se sale del cuadro.

---

## 2. Nuevas movidas de editor 🔧 (a construir)

Ordenadas por costo de implementación. Cada una incluye su **disparador**
sugerido (para que sea automática).

### Grupo A — Solo necesitan el video original (bajo costo, alto impacto)

| # | Movida | Qué hace | Disparador sugerido |
|---|--------|----------|---------------------|
| A1 | **Punch-in / zoom seco** | Recorta y acerca la imagen en una frase de énfasis | Pico de volumen/énfasis en la voz, o palabra clave |
| A2 | **B&N / desaturado por segmento** | Quita color (o duotono/grade fuerte) en un tramo | Frase de "problema"/negativa detectada por sentimiento |
| A3 | **Freeze frame + gráfico** | Congela el cuadro y ahí monta emoji/texto/píldora | Pausa/silencio o remate (punchline) |
| A4 | **Speed ramp** | Cámara lenta en el clímax o acelera un tramo aburrido | Clímax (voz sube) → lento; muletillas/transición → rápido |
| A5 | **Shake / zoom-punch al beat** | Temblor o empujón sincronizado al golpe | Beat de la música o palabra de impacto |
| A6 | **Flash / strobe de color** | Destello corto | Palabra de impacto / cambio de bloque |
| A7 | **Spotlight (blur + viñeta)** | Oscurece/desenfoca todo menos una zona | Momento donde hay que dirigir la mirada |
| A8 | **Reframe** | Recompone el encuadre en distintas zonas del vertical | Variedad automática cada N segundos |

### Grupo B — Necesitan un 2º material visual (B-roll)

> ⚠️ Dependencia: hoy la app solo tiene el clip del usuario. Para esto hace falta
> una fuente extra. Opciones a decidir en producto: (a) librería de stock/B-roll
> integrada, (b) B-roll generado por IA según lo que dice la voz, (c) que el
> usuario suba un clip secundario.

| # | Movida | Qué hace | Disparador sugerido |
|---|--------|----------|---------------------|
| B1 | **Split screen apilado** | Video del usuario abajo, B-roll arriba | Cuando la voz menciona algo "mostrable" |
| B2 | **Picture-in-picture** | Clip flotante en una esquina | Apoyo visual puntual |
| B3 | **Cutaway a B-roll** | Tapa el cuadro con imagen relevante, la voz sigue | Sustituto "mostrado" de la tarjeta full-screen |
| B4 | **Cutaway a imagen full-screen + emoji** | Versión estática y barata del anterior | Igual que B3, sin video |

### Grupo C — Necesitan IA / visión por computador (mayor costo, efecto "wow")

| # | Movida | Qué hace | Disparador sugerido |
|---|--------|----------|---------------------|
| C1 | **Texto detrás del sujeto** | La palabra pasa por detrás de la persona (segmentación) | Palabra clave sobre un plano con persona |
| C2 | **Highlights que siguen objetos** | Flechas/círculos que persiguen algo | Cuando la voz señala un objeto en cuadro |
| C3 | **Auto-reframe al hablante** | Reencuadre inteligente que centra a quien habla | Continuo, en planos con persona |

---

## 3. Motor de variedad 🔧 (clave para que NO salgan iguales)

En vez de aplicar siempre el mismo set, cada estilo define un **pool de movidas
permitidas**. Por cada video, la app:

1. Recorre la transcripción y detecta *momentos candidatos* (ver §4 disparadores).
2. Para cada momento, elige una movida del pool **con algo de azar** (semilla por
   video), respetando las movidas permitidas del estilo.
3. Limita la **densidad** total según `intensidad` (más intensidad = más movidas
   por minuto).
4. Evita repetir la misma movida dos veces seguidas.

Resultado: el mismo estilo produce videos distintos cada vez, y las tarjetas
full-screen dejan de aparecer en todos (solo caen cuando la receta las pide).

**Parámetro nuevo sugerido:** `variety_seed` (int) para reproducibilidad, y
`density_per_min` derivado de `intensidad`.

---

## 4. Vocabulario de disparadores (triggers) 🔧

Motor central que leen todos los estilos. Cada estilo activa/desactiva y
parametriza estos triggers:

- `hook` → primeros ~3 s del video.
- `sentiment_negative` → frase de dolor/problema (análisis de sentimiento).
- `sentiment_positive` → frase de logro/beneficio.
- `emphasis_peak` → subida de volumen o palabra remarcada por la voz.
- `pause` → silencio / punchline.
- `enumeration` → la voz enumera (ya existe la lógica de listas ✅).
- `beat` → marcas de tiempo del beat de la música de fondo.
- `keyword` → palabra clave del guion (para color/box/pill).
- `closing` → tramo final antes del CTA.

Cada estilo abajo declara **qué triggers usa y con qué movida**.

---

## 5. Los 5 estilos

Los 5 comparten: subtítulos Anton MAYÚSCULAS con contorno, regla de ceñirse al
audio, safe-area 8-10% y CTA a WhatsApp. Se diferencian en subtitle_style,
intensidad, densidad, color, ritmo y —sobre todo— en su **firma de edición**.

---

### 5.1 EDITORIAL MONO

**Concepto:** minimalismo editorial / keynote. Silencio visual, cada palabra pesa.

**Cuándo usarlo:** B2B, consultoría, servicios profesionales, inmobiliaria de alto
valor, salud/bienestar serio. Voz tranquila o experta.

**Perillas**
- `subtitle_style`: **color**
- `intensidad`: **25**
- tarjetas full-screen: **0-1** (máx. 1 en el hook, sin emoji)
- píldoras: **1-2** discretas (solo el dato más importante)
- emojis: **ninguno** (máx. 1 sutil)
- listas: **sí**, solo si la voz enumera; limpia y alineada
- color: **monocromático** (1 color + neutros)
- ritmo y SFX: **calmado**; SFX **sutil**; ducking marcado

**Firma de edición 🔧** (pool restringido, muy sobrio)
- A1 punch-in **lento** en `emphasis_peak` (zoom suave, no seco).
- A2 B&N/desaturado en `sentiment_negative` (vuelve el color en `sentiment_positive`).
- A7 spotlight/blur en `keyword` para dirigir la mirada.
- ❌ nada de shake, flash, split-screen ni speed ramp.
- Densidad muy baja: 1 movida cada ~8-10 s.

```
ESTILO:
- Subtítulos "color": palabra por palabra en Anton MAYÚSCULAS con contorno; solo la palabra clave cambia de color, sin caja ni escala.
- Intensidad 25. Edición sobria que respira; corta al ritmo natural del habla.
- Máximo 1 tarjeta full-screen en el gancho, fondo plano, 2-4 palabras, sin emoji.
- 1-2 píldoras discretas solo para el dato más importante que diga la voz.
- Sin emojis (como mucho 1 muy sutil).
- Movidas de edición sobre el video: punch-in LENTO cuando la voz enfatiza; pasa a blanco y negro cuando la frase es negativa o de "problema" y devuelve el color cuando la frase es positiva o de solución; usa spotlight/desenfoque suave para resaltar la palabra clave. NO uses shake, flash, split-screen ni cámara rápida.
- Baja densidad: máximo una intervención cada 8-10 segundos.
- Si la voz enumera, muestra la lista limpia y alineada, sin adornos.
- Color monocromático: un color + neutros. Debe sentirse editorial y de marca.
- Ritmo calmado. SFX sutil (un ding o whoosh suave por corte fuerte). Música baja con ducking marcado.
REGLAS:
- Ceñirse SIEMPRE al audio: no inventar cifras, precios ni datos que la voz no diga.
- Safe-area: márgenes 8-10%, nada se sale del cuadro 1080x1920.
- Menos es más: ante la duda de poner un elemento, no lo pongas.
- Cerrar con CTA "Haz clic para conseguir el tuyo" + botón a WhatsApp (sin número visible).
```

**Extras que requieren código:** subrayado cinético fino bajo la palabra activa; barra de progreso ultra delgada arriba.

---

### 5.2 PREMIUM NOIR

**Concepto:** lujo silencioso, oscuro, cinematográfico. El karaoke hace fluir el
texto con la voz.

**Cuándo usarlo:** belleza, joyería, relojería, estética, marca personal
aspiracional, servicios high-ticket. Voz pausada, con música protagonista.

**Perillas**
- `subtitle_style`: **karaoke**
- `intensidad`: **35**
- tarjetas full-screen: **1-2** (hook y antes del cierre), poco texto, emoji elegante opcional
- píldoras: **2** (atributos de valor que diga la voz)
- emojis: **pocos** (1-2 refinados)
- listas: **sí**, solo beneficios; un ítem a la vez, lento
- color: **monocromático oscuro** o 2 contrastantes sobrios
- ritmo y SFX: **calmado-elegante**; SFX **sutil**; ducking suave

**Firma de edición 🔧** (cine lento)
- A2 grade dominante en B&N o **duotono oscuro** casi todo el video.
- A4 speed ramp **solo cámara lenta** en el clímax (nunca acelerar).
- A3 freeze frame **lento** en `pause` para rematar.
- Letterbox / grano de película (ver extras).
- ❌ nada de shake ni flash.
- Densidad baja: 1 movida cada ~6-8 s.

```
ESTILO:
- Subtítulos "karaoke": palabra por palabra en Anton MAYÚSCULAS con contorno; la palabra que suena se pinta de color siguiendo la voz.
- Intensidad 35. Edición elegante y pausada; deja respirar la música y que los cortes caigan en los silencios.
- 1-2 tarjetas full-screen (gancho y antes del cierre), 3-5 palabras y máximo 1 emoji refinado.
- 2 píldoras para atributos de valor que mencione la voz. Pocos emojis (1-2 sutiles).
- Movidas de edición sobre el video: aplica un grade dominante en blanco y negro o duotono oscuro casi todo el video; usa cámara lenta SOLO en el momento clímax (nunca aceleres); congela el cuadro de forma lenta en los silencios para rematar. NO uses shake ni flashes.
- Baja densidad: una intervención cada 6-8 segundos.
- Si la voz enumera beneficios, muéstralos lento, un ítem a la vez.
- Color monocromático oscuro/premium (o 2 contrastantes sobrios).
- Ritmo calmado-elegante. SFX sutil (ding suave, whoosh largo). Música con presencia y ducking suave.
REGLAS:
- Ceñirse SIEMPRE al audio: no inventar cifras, precios ni datos que la voz no diga.
- Safe-area: márgenes 8-10%, nada se sale del cuadro 1080x1920.
- Priorizar elegancia sobre cantidad de elementos.
- Cerrar con CTA "Haz clic para conseguir el tuyo" + botón a WhatsApp (sin número visible).
```

**Extras que requieren código:** barras letterbox (2.39:1) que entran/salen; grano de película sutil; fundidos a negro entre bloques.

---

### 5.3 AFICHE RETRO

**Concepto:** cartel bold, tipografía protagonista, estética de póster vintage.
El subtítulo "box" convierte palabras clave en etiquetas gráficas.

**Cuándo usarlo:** moda urbana, comida/bebida, eventos, música, barbería, marcas
jóvenes con actitud y buen gusto.

**Perillas**
- `subtitle_style`: **box**
- `intensidad`: **65**
- tarjetas full-screen: **1-2**, frases cortas y contundentes + emoji sticker
- píldoras: **3-4** como tags gráficos
- emojis: **pocos-medios** (2-3, estética sticker)
- listas: **sí**, estilo tarjeta/tabla bold
- color: **2 contrastantes** (bloques planos, alto contraste)
- ritmo y SFX: **medio-rápido rítmico**; SFX **marcado**; ducking normal

**Firma de edición 🔧** (gráfico, con carácter)
- A3 freeze frame + emoji sticker en `pause`.
- A6 flash de color en cambios de bloque / `keyword`.
- A8 reframe para variedad gráfica.
- B1 split-screen **ocasional** (si hay B-roll disponible).
- ❌ nada de cámara lenta editorial ni B&N largo.
- Densidad media: 1 movida cada ~4-5 s.

```
ESTILO:
- Subtítulos "box": palabra por palabra en Anton MAYÚSCULAS con contorno; las palabras clave van con fondo de color sólido tipo etiqueta.
- Intensidad 65. Edición con carácter gráfico y ritmo marcado, pero ordenada como un afiche.
- 1-2 tarjetas full-screen con frases cortas y contundentes + 1 emoji tipo sticker.
- 3-4 píldoras usadas como etiquetas/tags gráficos. 2-3 emojis con estética de sticker.
- Movidas de edición sobre el video: congela el cuadro y monta un emoji sticker en las pausas; mete un flash de color al cambiar de bloque o en la palabra clave; recompón el encuadre para dar variedad; usa split-screen de vez en cuando si hay material de apoyo. NO uses cámara lenta editorial ni blanco y negro prolongado.
- Densidad media: una intervención cada 4-5 segundos.
- Si la voz enumera, grafica la lista con estilo de tarjeta/tabla bold.
- Color: 2 colores contrastantes en bloques planos de alto contraste.
- Ritmo medio-rápido y rítmico. SFX marcado (pop/ding al aparecer cada etiqueta). Ducking normal.
REGLAS:
- Ceñirse SIEMPRE al audio: no inventar cifras, precios ni datos que la voz no diga.
- Safe-area: márgenes 8-10%, nada se sale del cuadro 1080x1920.
- La tipografía manda: que las etiquetas se lean grandes y limpias.
- Cerrar con CTA "Haz clic para conseguir el tuyo" + botón a WhatsApp (sin número visible).
```

**Extras que requieren código:** transición de "corte de papel" / halftone entre
tarjetas; textura de tinta/impreso sobre los bloques de color.

---

### 5.4 MODO BESTIA

**Concepto:** hype puro, máxima energía e impacto. El "punch" golpea cada palabra
clave. Se diferencia del "Viral limpio" actual por ser más agresivo y por
intervenir el video (shake, speed ramps, flashes), no solo pegar elementos.

**Cuándo usarlo:** fitness, suplementos, retos, ofertas relámpago, gaming, público
joven. Voz que ya viene con energía alta.

**Perillas**
- `subtitle_style`: **punch**
- `intensidad`: **92**
- tarjetas full-screen: **2-3**, texto corto explosivo + emoji fuerte
- píldoras: **4-5**, entran y salen rápido
- emojis: **muchos** (con pop, en énfasis)
- listas: **sí**, entrada rápida y agresiva
- color: **muy colorido** o 2 contrastantes saturados
- ritmo y SFX: **rápido**; SFX **marcado**; ducking agresivo

**Firma de edición 🔧** (todo el arsenal)
- A5 shake / zoom-punch al `beat` y en `emphasis_peak`.
- A4 speed ramp (lento→rápido) en los golpes.
- A6 flash/strobe en palabras de impacto.
- A1 punch-in seco frecuente.
- B3 cutaways rápidos a B-roll y B1 split-screen (si hay material).
- Densidad máxima: 1 movida cada ~2-3 s (limitada solo por legibilidad).

```
ESTILO:
- Subtítulos "punch": palabra por palabra en Anton MAYÚSCULAS con contorno; la palabra activa se agranda con golpe de impacto.
- Intensidad 92. Edición al máximo de energía: cortes rápidos, todo entra y sale con fuerza.
- 2-3 tarjetas full-screen con texto corto explosivo + 1 emoji fuerte cada una.
- 4-5 píldoras que entran y salen rápido. Muchos emojis con pop en los momentos de énfasis.
- Movidas de edición sobre el video: aplica shake y zoom-punch sincronizados al beat y cuando la voz golpea; usa speed ramps (de lento a rápido) en los golpes; mete flashes/strobe en las palabras de impacto; punch-in seco frecuente; cutaways rápidos a material de apoyo y split-screen si hay clip disponible.
- Densidad máxima: intervenciones cada 2-3 segundos, limitadas solo por que el subtítulo principal siga legible.
- Si la voz enumera, grafica la lista con entrada rápida y agresiva.
- Color muy colorido o 2 contrastantes saturados.
- Ritmo rápido. SFX marcado (whoosh/pop/ding en casi cada corte). Ducking agresivo.
REGLAS:
- Ceñirse SIEMPRE al audio: no inventar cifras, precios ni datos que la voz no diga.
- Safe-area: márgenes 8-10%, nada se sale del cuadro 1080x1920.
- Aunque sea intenso, el subtítulo principal SIEMPRE debe leerse.
- Cerrar con CTA "Haz clic para conseguir el tuyo" + botón a WhatsApp (sin número visible).
```

**Extras que requieren código:** transición shake/zoom-punch al beat; flash de
color en los golpes; contador/temporizador para ofertas (solo si la voz da el
dato).

---

### 5.5 RELATO DOC

**Concepto:** storytelling documental, ritmo narrativo. Usa "pop" pero suave, como
énfasis narrativo (no viral saltarín).

**Cuándo usarlo:** testimonios, historias de cliente, marca personal con propósito,
casos de éxito, ONG. Voz que cuenta algo; se busca que se sienta humano y creíble.

**Perillas**
- `subtitle_style`: **pop** (baja intensidad → énfasis leve)
- `intensidad`: **40**
- tarjetas full-screen: **1-2** (una de título en el hook, otra de conclusión antes del cierre), poco texto
- píldoras: **2** (contexto o un dato que diga la voz)
- emojis: **pocos** (1-2, solo si aportan al relato)
- listas: **sí**, pasos/aprendizajes, pausado
- color: **mínimo** / monocromático cálido (que domine la imagen real)
- ritmo y SFX: **medio-calmado**; SFX **sutil**; ducking marcado

**Firma de edición 🔧** (narrativo)
- Ken Burns / zoom lento sobre el video (ver extras).
- A2 B&N en el "problema", color en la "solución" (arco narrativo).
- B3 cutaway a B-roll cuando la voz describe algo.
- A3 freeze frame en el punchline.
- Lower-thirds con nombre/rol de quien habla (ver extras).
- ❌ nada de shake, flash ni speed ramp agresivo.
- Densidad baja-media: 1 movida cada ~5-7 s.

```
ESTILO:
- Subtítulos "pop" a baja intensidad: palabra por palabra en Anton MAYÚSCULAS con contorno; la palabra clave salta con un rebote leve y color, como énfasis narrativo suave (no saltarín).
- Intensidad 40. Edición con ritmo de relato: deja respirar las frases y acompaña la historia que cuenta la voz.
- 1-2 tarjetas full-screen: una de título en el gancho y otra de conclusión antes del cierre; poco texto.
- 2 píldoras para contexto o un dato que diga la voz. Pocos emojis (1-2, solo si suman al relato).
- Movidas de edición sobre el video: zoom lento tipo Ken Burns; pasa a blanco y negro en la parte del "problema" y devuelve el color en la "solución" para marcar el arco; cutaway a material de apoyo cuando la voz describe algo; congela el cuadro en el punchline. NO uses shake, flashes ni cámara rápida agresiva.
- Densidad baja-media: una intervención cada 5-7 segundos.
- Si la voz enumera pasos o aprendizajes, muéstralos como lista pausada.
- Color mínimo / monocromático cálido para que domine la imagen real.
- Ritmo medio-calmado. SFX sutil (whoosh suave en transiciones). Música narrativa con ducking marcado.
REGLAS:
- Ceñirse SIEMPRE al audio: no inventar cifras, precios ni datos que la voz no diga.
- Safe-area: márgenes 8-10%, nada se sale del cuadro 1080x1920.
- La historia manda: los elementos gráficos apoyan, no interrumpen.
- Cerrar con CTA "Haz clic para conseguir el tuyo" + botón a WhatsApp (sin número visible).
```

**Extras que requieren código:** zoom Ken Burns sobre el clip; lower-thirds con
nombre/rol; marcas de capítulo ("01 / 02 / 03") entre bloques.

---

## 6. Tabla comparativa (para el dev)

| Estilo | subtitle_style | intensidad | Densidad (1 movida / seg) | Color | Firma de edición (movidas 🔧) |
|--------|----------------|-----------|---------------------------|-------|-------------------------------|
| Editorial Mono | color | 25 | 8-10 s | monocromático | A1 lento, A2, A7 |
| Premium Noir | karaoke | 35 | 6-8 s | mono oscuro | A2, A4 (solo lento), A3 lento, letterbox |
| Afiche Retro | box | 65 | 4-5 s | 2 contrastantes | A3, A6, A8, B1 ocasional |
| Modo Bestia | punch | 92 | 2-3 s | muy colorido | A5, A4, A6, A1, B3, B1 |
| Relato Doc | pop suave | 40 | 5-7 s | mínimo cálido | Ken Burns, A2 arco, B3, A3 |

---

## 7. Prioridad de implementación sugerida

**Fase 1 (barato, alto impacto, sin material extra):** A1 punch-in, A2 B&N por
segmento, A3 freeze frame. Con solo esto los estilos ya dejan de sentirse
plantilleros. Habilita: Editorial Mono, Premium Noir (parcial), Relato Doc
(parcial).

**Fase 2:** A4 speed ramp, A5 shake, A6 flash, A7 spotlight, A8 reframe +
**motor de variedad (§3)** y **vocabulario de disparadores (§4)**. Completa Afiche
Retro y Modo Bestia.

**Fase 3 (requiere resolver fuente de B-roll):** B1-B4 (split-screen, PiP,
cutaways). Desbloquea las firmas completas de Modo Bestia y Relato Doc.

**Fase 4 (IA/visión, efecto wow):** C1 texto detrás del sujeto, C2 highlights,
C3 auto-reframe.

**Decisión de producto pendiente:** de dónde sale el B-roll del Grupo B (stock
integrado vs IA generativa vs subida por el usuario). Bloquea la Fase 3.

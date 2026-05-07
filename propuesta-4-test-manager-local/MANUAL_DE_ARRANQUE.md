# MANUAL DE ARRANQUE — QA Test Manager (local)

> Este archivo es **para ti, QA Manual**. No tienes que saber programar. Solo tienes que copiar-pegar los prompts que están abajo en el chat de Cursor y dejar que el agente haga el trabajo.
>
> **Tiempo estimado total**: 5-15 minutos la primera vez (depende de tu internet). Después, arrancar la app son 30 segundos.

---

## Tabla de contenidos

1. [Antes de empezar — qué necesitas tener listo](#1-antes-de-empezar--qué-necesitas-tener-listo)
2. [Paso a paso para la PRIMERA VEZ](#2-paso-a-paso-para-la-primera-vez)
3. [Paso a paso para arrancar OTRO DÍA](#3-paso-a-paso-para-arrancar-otro-día)
4. [Cómo detener la app cuando termines de usarla](#4-cómo-detener-la-app-cuando-termines-de-usarla)
5. [Si algo falla — preguntas frecuentes](#5-si-algo-falla--preguntas-frecuentes)
6. [Cómo rotar tu API key](#6-cómo-rotar-tu-api-key)

---

## 1. Antes de empezar — qué necesitas tener listo

Tres cosas, todas las consigues en menos de 5 minutos:

### A) Una Mac (cualquier modelo razonablemente reciente)

Funciona en macOS 12+ (Monterey en adelante). Si tu Mac es de 2017 o más nueva, sirve.

### B) Cursor instalado

Si no lo tienes: descárgalo gratis desde [cursor.com](https://cursor.com) e instálalo como cualquier app.

### C) Tu API key del SFR Gateway de Salesforce

- **Qué es**: una clave alfanumérica de unos 32 caracteres. NO empieza con `sk-`.
- **Dónde la consigues**: en el portal interno del Salesforce Research Gateway. Si no sabes dónde está, pregunta a tu lead de QA o en el canal interno de Slack `#qa-coe`.
- **Para qué sirve**: la app la usa para hablar con la IA (GPT-4o vía gateway). Cada llamada se cobra a Salesforce, no a ti personalmente.
- **Cuidados básicos**:
  - NO la pegues en Slack ni en mensajes ni screenshots.
  - Si por error la expones, vuelve al portal y "rotala" (revoke + reissue).

> Si todavía no tienes la key, **detente acá** y consíguela primero. El resto del manual asume que la tienes en mano (en un password manager, en una nota de tu Mac, donde sea).

---

## 2. Paso a paso para la PRIMERA VEZ

### Paso 1 — Abre el repo en Cursor

1. Abre Cursor.
2. Menú **File → Open Folder...**
3. Elige la carpeta de este repo (la que tiene este archivo `MANUAL_DE_ARRANQUE.md`).
4. Cuando Cursor termine de cargar, presiona **Cmd + L** para abrir el chat del agente (a la derecha).

### Paso 2 — Pega este prompt literal en el chat de Cursor

Copia exactamente esto (Cmd+C) y pégalo (Cmd+V) en el chat del agente:

```
Hola. Soy QA Manual y no quiero ver código.

Léete el archivo AGENT_BRIEFING.md de la raíz del repo. Cuando termines, sigue las instrucciones de la sección 13.1.bis para instalar y arrancar la app por mí en mi Mac local.

Necesito que:
1. Verifiques mis prerequisites (Python 3.11+, Node 18+) y los instales con Homebrew si me faltan, sin pedirme confirmación adicional.
2. Me pidas mi API key del SFR Gateway con un input seguro de Cursor (NO en la terminal).
3. Configures todo y arranques la app en mi localhost.
4. Cuando esté lista, me digas literalmente "abre http://localhost:5173 en tu navegador" y nada más.

Reglas duras:
- Nunca pegues mi API key en mensajes de respuesta.
- Si algo falla, frena y reportame el error real, no improvises.
- No me hagas preguntas técnicas (qué versión de Python, qué puerto, etc.). Decide tú.
```

### Paso 3 — Sigue las indicaciones del agente

El agente va a hacer 4 cosas, en este orden:

1. **Te confirma que entendió** y te pregunta si tienes tu API key en mano.
2. **Te pide la API key** con un campo de texto seguro de Cursor (no en terminal). Pégala ahí. El agente NO la va a repetir en ningún mensaje.
3. **Verifica e instala lo que falte** (Python, Node) con Homebrew. Si te falta Homebrew, te dirá cómo instalarlo y se detendrá ahí.
4. **Configura y arranca la app**. Esto tarda entre 2 y 5 minutos la primera vez (descarga dependencias de Python y Node).

### Paso 4 — Cuando el agente te diga "listo"

Vas a ver un mensaje del agente que dice algo como:

> ✅ Listo. Abre http://localhost:5173 en tu navegador.

Hazlo. Abre tu navegador favorito (Chrome, Safari, Firefox, lo que uses) y pega esa URL.

**Primera pantalla**: la pantalla de login de la app. Crea tu cuenta con un email y contraseña cualquiera (es local, no se sube a ningún lado — vive solo en tu Mac).

¡Ya está! Ya puedes empezar a usar la app: crear proyectos, importar HUs, generar casos de prueba con IA, etc.

---

## 3. Paso a paso para arrancar OTRO DÍA

Una vez que la primera instalación funcionó, **no necesitas repetirla**. Para arrancar la app otro día:

### Opción A — Desde Cursor

1. Abre Cursor con el repo.
2. Abre el chat (Cmd+L).
3. Pega:

   ```
   Arranca la app por mí. Avísame cuando esté lista en localhost:5173.
   ```

4. Espera ~20 segundos. Cuando el agente te diga "listo", abre `http://localhost:5173`.

### Opción B — Desde Terminal (si te animas, es más rápido)

1. Abre Terminal.app de macOS.
2. Pega:

   ```bash
   cd /ruta/a/este/repo
   ./start.sh
   ```

   (Reemplaza `/ruta/a/este/repo` por la ruta real. Tip: en Cursor, click derecho en la carpeta del repo → "Copy Path".)

3. Espera ~20 segundos hasta ver `QA_TM_READY` en la terminal.
4. Abre `http://localhost:5173`.

---

## 4. Cómo detener la app cuando termines de usarla

### Si la arrancaste con Cursor (Opción A)

- Pega en el chat:

  ```
  Detén la app, ya no la necesito.
  ```

- O simplemente cierra Cursor — los procesos asociados se detienen.

### Si la arrancaste con Terminal (Opción B)

- En la misma terminal donde corre, presiona `Ctrl + C`. Verás el mensaje "Deteniendo servidores..." y volverás al prompt.

> No te preocupes si olvidas detenerla — la app no consume recursos serios cuando no la usas, y cuando reinicies tu Mac todo se cierra solo.

---

## 5. Si algo falla — preguntas frecuentes

### "El agente se queda colgado o no responde"

- Cancela el turno (Cmd+Backspace en el chat de Cursor) y vuelve a pegar el prompt del Paso 2.
- Si sigue colgado, cierra Cursor y vuelve a abrirlo.

### "Me pide instalar Homebrew y no sé qué es"

Homebrew es el "App Store de la terminal" de Mac. Es gratis, oficial, y muchísima gente lo usa.

Para instalarlo, abre Terminal.app y pega:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Sigue las instrucciones (te pedirá tu password de Mac). Cuando termine, vuelve a Cursor y pega el prompt del Paso 2 otra vez.

### "El agente dice que `localhost:5173` no responde"

Posibles causas:

- **Otra app está usando el puerto 5173 o el 8000.** El agente debería detectarlo y avisarte. Si no, dile en el chat: "verifica si los puertos 5173 y 8000 están libres y mátalos si están ocupados".
- **El antivirus o firewall corporativo bloquea localhost.** Pásalo a tu admin de IT.
- **La instalación de dependencias se quedó a la mitad.** Pídele al agente: "borra `backend/venv` y `frontend/node_modules` y vuelve a correr el setup desde cero".

### "El agente dice que mi API key no funciona"

- Verifica que la pegaste completa (suelen ser 32 caracteres exactos, sin espacios).
- Verifica que NO empiece con `sk-` (esa sería de OpenAI personal, no del SFR Gateway).
- Verifica que la key no haya expirado o sido rotada en la consola del Gateway.
- Pídele al agente: "vuelve a pedirme la key, voy a generar una nueva".

### "Olvidé mi password de la app"

Como la app vive en tu Mac local, no hay "olvidé mi contraseña" por email. Las opciones son:

- **Crear una segunda cuenta** con otro email (la app permite múltiples usuarios locales).
- **Borrar la base de datos completa** (perderás tus proyectos): pídele al agente "borra `backend/qa_manager.db` y arranca la app de cero".

### "Quiero usar la app desde otra Mac, ¿cómo paso mis datos?"

Copia el archivo `backend/qa_manager.db` de tu Mac vieja al mismo path en la Mac nueva (después de hacer la instalación allá). Esa única base SQLite contiene todo.

### "La IA está dando respuestas raras o lentas"

- **Lentas**: el modelo default es `gpt-4o-mini`. Si quieres calidad, pídele al agente: "cambia el modelo en `backend/.env` a `gpt-4o-2024-08-06`". Va a ser ~3x más lento pero mejor.
- **Raras**: probable que tu prompt (la HU) sea muy ambiguo. Mejóralo, agrega más contexto, criterios de aceptación claros.

### "No tengo Cursor — ¿puedo usar solo la terminal?"

Sí. Lee el `README.md` del repo, sección "Camino A — Terminal". El proceso son 3 comandos:

```bash
./setup.sh   # te pregunta la key con un input seguro de terminal
./start.sh
```

---

## 6. Cómo rotar tu API key

Si por error expusiste tu key (por ejemplo, la pegaste en Slack o quedó en una screenshot), tienes que **rotarla inmediatamente**:

### Paso 1 — Rota en el portal del Gateway

1. Ve a la consola interna del SFR Gateway.
2. Busca tu key actual.
3. Click en "Revoke" (o "Disable", según la UI) — esto invalida la key vieja.
4. Click en "Generate new key" — copia la nueva.

### Paso 2 — Actualiza la app local

**Opción rápida (con Cursor)**:

```
Acabo de rotar mi API key del SFR Gateway. Pídeme la nueva y actualiza backend/.env por mí. Después reinicia la app.
```

**Opción manual (con Terminal)**:

1. Abre el archivo `backend/.env` con un editor de texto (TextEdit, VSCode, lo que uses).
2. Reemplaza el valor de `OPENAI_API_KEY=...` con tu nueva key.
3. Guarda.
4. En la terminal donde corre la app: `Ctrl+C` y luego `./start.sh`.

### Paso 3 — Asegúrate de que la vieja ya no funcione

En la app, intenta generar un caso de prueba. Si ves un error tipo "Authentication failed", la key vieja todavía está cacheada en algún lado. Si ves casos generándose normalmente, listo: la nueva key ya está activa y la vieja invalidada en el Gateway.

---

## Recordatorios finales

- **Tu data NO sale de tu Mac.** Ningún proyecto, HU, caso de prueba o reporte de bug se sube a ningún servidor. Lo único que sale son los prompts que mandas a la IA cuando le das a "Generar casos" o "Revisar con QA Agent".
- **La app es solo para ti** en tu laptop. Si quieres compartir tus casos de prueba con un compañero, expórtalos a Excel desde la propia UI.
- **Si tienes dudas que este manual no responde**, pregúntale al agente de Cursor con tus propias palabras. Está entrenado con el `AGENT_BRIEFING.md` y conoce todo el repo.
- **Si encuentras un bug** o algo que se podría mejorar, abre un issue en el repo o avísale a Luis (el QA que mantiene esto).

¡Buen QA!

> *Este manual fue diseñado para QAs Manuales no técnicos. Si eres dev y prefieres docs técnicas, lee directamente `README.md`, `AGENT_BRIEFING.md` y `docs/architecture.md`.*

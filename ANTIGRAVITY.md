# 🌌 Moed: La Iglesia del Futuro — Bitácora de Ingeniería y Diseño

Este documento sirve como el **Diario de a Bordo** de la suite interactiva de **Moed**. Documenta de manera exhaustiva las decisiones arquitectónicas, especificaciones estéticas de alta fidelidad, resolución de bugs críticos, y el pipeline automatizado de contenidos de este ecosistema digital.

---

## 🛠️ Comandos del Ecosistema

La suite está construida sobre un entorno moderno multi-página impulsado por **Vite 8**, **Tailwind CSS 4** y **PostCSS**:

*   **Servidor de Desarrollo:** `npm run dev` (Inicia en `http://localhost:5173`)
*   **Compilación para Producción:** `npm run build` (Genera código estático optimizado y minificado en `dist/` en tiempo récord de ~850ms)
*   **Previsualizar Compilación:** `npm run preview`

---

## 📂 Estructura del Workspace

```text
├── .antigravityignore       # Exclusión de carpetas pesadas para el entorno
├── .env.example             # Plantilla de variables de entorno para APIs
├── index.html               # Estructura principal, Landing Cósmica y Research Hub
├── editor.html              # Moed Admin Editor (Lienzo Visual + Editor Metadatos + Nube)
├── vite.config.js           # Orquestación de compilación y servidor API local
├── package.json             # Manifiesto de dependencias y scripts del proyecto
├── postcss.config.js        # Procesamiento y optimización de CSS
├── tailwind.config.js       # Tokens de diseño y extensiones estéticas
├── public/                  # Recursos estáticos servidos directamente
│   ├── favicon.svg          # Logotipo vectorial de Moed
│   └── images/              # Portadas de artículos generadas en alta resolución
└── src/                     # Código fuente del ecosistema
    ├── main.js              # Controlador del Hub, Lector Modal e importación híbrida
    ├── style.css            # Base de diseño cósmico, glassmorphism y utilidades
    ├── editor.css           # Estilos dedicados del editor, variables y controles fijos
    ├── editor.js            # Motor del editor visual, control de historia y CMS
    └── articles/            # Base de datos CMS física (.md con YAML Frontmatter)
```

---

## 🎨 Sistema de Diseño Cósmico (High-Fidelity)

Para garantizar un impacto visual premium que capture la esencia espiritual y tecnológica del proyecto, se estableció un riguroso lenguaje visual:

1.  **Tipografías Modernas:**
    *   **Outfit:** Aplicada a títulos, headers y secciones destacadas para transmitir una impronta geométrica, moderna y futurista.
    *   **Inter:** Aplicada al cuerpo de lectura y textos de interfaz para garantizar legibilidad perfecta y fatiga visual cero.
2.  **Paleta Cromática Armoniosa (HSL / Hex):**
    *   **Fondo Cósmico Profundo:** `--bg-main` (`#03050b`) y `--bg-panel` (`#070a13`). Fondo espacial oscuro absoluto.
    *   **Dimensión del Pasado (Espiritual):** Colores Indigo a Violeta (`#6366f1` a `#4338ca`). Representa tradición, revelación bíblica e historia.
    *   **Dimensión del Futuro (Tecnológica):** Colores Púrpura a Lila (`#c084fc` a `#9333ea`). Representa algoritmos, robótica y la era transhumana.
    *   **Dimensión del Presente (Cotidiana):** Acentos dorados y esmeraldas para la vida real y la praxis comunitaria.
3.  **Glassmorphism Premium:**
    *   Fondos con difuminados extremos (`backdrop-blur-2xl`) y opacidades perfectamente balanceadas (`bg-white/5` o `bg-[#070a13]/70`).
    *   Bordes ultra-delgados translúcidos (`border border-white/10`) con sutiles sombras radiales para simular paneles flotantes en el vacío cósmico.

---

## ⚙️ Decisiones Clave de Ingeniería y Solución de Bugs

### 1. Zero-Latency CMS Híbrido (Estático / Dinámico en Caliente)
*   **Problema:** Depender de una lista JS cableada para registrar nuevos artículos es manual e insostenible. Peticiones en runtime a APIs añaden latencia indeseada y riesgos de cuota.
*   **Solución:** Implementamos un sistema híbrido inteligente:
    *   **En Producción:** Vite empaqueta directamente los artículos Markdown y sus metadatos a través de escaneo estático eager (`import.meta.glob('./articles/*.md', { eager: true })`), sirviendo los archivos a los lectores desde la Edge CDN de Vercel en menos de **20ms**.
    *   **En Desarrollo Local:** La web principal se conecta dinámicamente con un endpoint local `/api/articles` en el servidor de desarrollo Vite (`vite.config.js`) que lee los archivos `.md` del disco en tiempo real, reflejando cualquier guardado del editor al instante y con **0ms** de retraso de compilación.

### 2. CMS Cloud Serverless Automático (GitHub API Integration)
*   **Diseño:** Añadimos integración con la **API RESTful de GitHub** para dotar al editor web desplegado en Vercel de la capacidad de operar como un CMS en vivo sin bases de datos. Las credenciales se almacenan localmente de forma privada en el navegador (`localStorage`).
*   **Apertura Híbrida:** Al presionar **Abrir**, si hay conexión configurada, consulta GitHub, lista los archivos `.md` en un modal inmersivo y los descarga en milisegundos junto a su identificador de seguridad `SHA`. Si no hay conexión (o si el usuario lo desea), ofrece el selector de archivos local tradicional de tu PC.
*   **Publicación de un Clic (Git Commits):** Al presionar **Publicar**, el editor codifica el texto en base64 de manera segura y realiza un commit directo al repositorio de GitHub mediante un método `PUT` que incluye el hash `SHA` en caso de actualización para evitar colisiones. Esto gatilla el autodespliegue de Vercel, publicando el artículo en vivo en internet en menos de 20 segundos.

### 3. Sistema de Borradores y Control de Flujo (`published: true/false`)
*   **Problema:** Si el autor quiere guardar un artículo en progreso o editarlo desde múltiples dispositivos sin que los lectores lo vean inacabado en la web principal.
*   **Solución:** Incorporamos el estado `published` en los metadatos YAML. 
    *   Por defecto, todo nuevo documento se crea como **Borrador** (`published: false`).
    *   La web principal (`src/main.js`) filtra y descarta automáticamente de la grilla pública cualquier artículo que tenga `published: false`, tanto en el bundle estático de producción como en la API de desarrollo local.

### 4. Exportador de Documentos Nativos `.md`
*   **Solución:** Añadimos un botón **Exportar** (📥) que empaqueta todo el contenido y YAML Frontmatter en un `Blob` de texto Markdown y dispara una descarga instantánea directa a tu PC. Funciona 100% de forma local y offline, ideal para resguardar copias físicas en cualquier momento.

### 5. Corrección de Bugs de Arquitectura y UX Críticos

*   **El Bug de las Inyecciones de Estilo en Pegado/Edición (`deconstructInlineStyles`):**
    *   *Causa:* Durante el copiado/pegado o el formateado de texto en `contenteditable`, los navegadores inyectaban elementos `<span>` y `<strong>` con estilos CSS inline (fuentes, alineaciones y colores). Como el desestructurador del editor buscaba etiquetas puras (como `<strong>`), pasaba por alto estos elementos y los guardaba como etiquetas HTML crudas, las cuales al volver a la vista visual se escapaban como texto plano (`&lt;span style="..."&gt;`), rompiendo la estética.
    *   *Solución:* Robustecimos `deconstructInlineStyles` usando patrones regex permisivos con atributos y un bucle de desenvoltura (`unwrap`) recursivo `do-while` que elimina cualquier `<span>` genérico no-resaltado, conservando el texto plano y limpio para un Markdown perfecto.

*   **El Bug de la Fusión Destructiva de Títulos Vacíos (Teclas Backspace/Delete):**
    *   *Causa:* En `contenteditable`, pulsar Retroceso o Suprimir dentro de un bloque especial vacío (como `H1`, `H2` o `BLOCKQUOTE`) causaba que el navegador fusionara el párrafo de abajo dentro del título vacío, tiñendo todo el texto del cuerpo en un encabezado gigante y violeta.
    *   *Solución:* Interceptamos los eventos `keydown` en el lienzo. Si el bloque actual está vacío y es un encabezado/cita, prevenimos la acción por defecto y lo transformamos automáticamente en un párrafo normal (`<p>`). Esto permite que el navegador realice una fusión limpia de párrafo a párrafo, preservando los estilos intactos.

*   **El Bug de la Flecha Repetida en Desplegables de Modo Claro:**
    *   *Causa:* Al aplicar una imagen de fondo púrpura en modo claro (`background-image: url(...) !important`), la especificidad CSS de la regla de sobreescritura anulaba las propiedades base de no-repetición y posición, haciendo que el icono de flecha se repitiera infinitamente en forma de `v v v v v v` a lo largo de todo el texto del desplegable.
    *   *Solución:* Incorporamos las declaraciones de seguridad `!important` para `background-repeat`, `background-position` y `background-size` en el bloque de Modo Claro, y añadimos prefijos `-webkit-appearance` y `-moz-appearance` para neutralizar flechas dobles de los navegadores.

*   **El Bug del Desplazamiento de Cabeceras en Dispositivos Móviles:**
    *   *Causa:* Al editar en el celular, el teclado virtual del sistema desplazaba el lienzo hacia arriba, sacando de la pantalla la cabecera superior y la barra de herramientas y haciendo imposible guardar o dar formato sin tener que hacer scroll manual continuamente.
    *   *Solución:* Fijamos de forma rígida `#top-navbar` (`position: sticky; top: 0;`) y `#formatting-bar` (`position: sticky; top: 49px;`), impidiendo su encogimiento (`flex-shrink: 0`). Ahora ambas cabeceras flotan de manera inamovible en el tope de la pantalla de cualquier móvil.

### 6. Mobile UX — Barra de Formato Colapsable con Toggle `Aa`

*   **Problema:** En pantallas de ≤768px, la barra de formato completa (deshacer, negrita, H1, H2, tablas, etc.) consumía todo el ancho y empujaba las herramientas de IA fuera de la vista, requiriendo scroll horizontal incómodo.
*   **Solución:** Reestructuramos el `#formatting-bar` en dos capas independientes:
    *   **Fila Principal (siempre visible):** Botón `Aa`, Metadatos (→ `Meta`), Completar con IA (→ `[IA] Completar`) y Corregir con IA (→ `[IA] Corregir`). Las herramientas de IA son la prioridad táctil.
    *   **Drawer de Formato (`#format-tools-drawer`):** Todos los botones de formato clásico (deshacer, negrita, cursiva, H1, H2, tablas, etc.) se colapsan detrás de un `max-height: 0 → 60px` con transición cúbica. Se revelan al tocar `Aa`.
*   **Badge IA:** Los botones de IA reemplazaron sus SVGs por una pastilla tipográfica estilizada `<span class="btn-ai-badge">IA</span>` con colores diferenciados (violeta para Completar, esmeralda para Corregir) — más compactos y reconocibles en táctil.
*   **Desktop sin cambios:** En pantallas >768px el drawer siempre está visible y el botón `Aa` se oculta automáticamente via CSS.

### 7. Mobile Top Nav — Menú `File` Desplegable (Glassmorphism)

*   **Problema:** En móviles, el top navbar acumulaba demasiados botones de acción (Nuevo, Abrir, Exportar, Historial, etc.) que no cabían visualmente en el ancho disponible.
*   **Solución:** Implementamos un botón `File ▾` que agrupa en un menú desplegable glassmorphism todas las acciones secundarias (Nuevo, Abrir, Exportar, Historial de Versiones), dejando visibles solo: `File ▾`, `Guardar`, los tabs de vista (`Visual` / `Código`) y `Ajustes`.

---

## 🧭 Plan de Verificación y Control de Calidad

*   [x] **Build Multi-Página Exitoso:** Compilación verificada de `index.html` y `editor.html` con bundles minificados listos para Edge Hosting (Vercel).
*   [x] **Sincronización de Borradores:** Validado que los artículos con `published: false` no se listan en la landing principal ni en desarrollo local ni en producción.
*   [x] **Sanitización del Pegado:** Comprobado que copiar textos enriquecidos externos no inyecta spans o estilos inline en la base de datos de artículos.
*   [x] **Pruebas de Exportación y SHA:** Confirmada la descarga física directa de archivos `.md` y la compatibilidad con hashes Git `SHA` en actualizaciones remotas.
*   [x] **Barra de Formato Colapsable (Mobile):** Verificado que el drawer `Aa` se abre/cierra con animación fluida en viewport de 644px. Fila principal siempre visible con AI tools y Meta.
*   [x] **Footer Sticky en Mobile:** Confirmado que `#editor-status-bar` permanece fijo al fondo y se oculta automáticamente cuando el teclado virtual sube (via `@media (max-height: 580px)`).
*   [x] **Menú File Desplegable (Mobile):** Verificado que el dropdown glassmorphism aparece correctamente posicionado y se cierra al tocar fuera de él.

---

> [!TIP]
> *Bitácora de a bordo auditada y sellada bajo los estándares premium de **Echazu**. La iglesia del futuro ya cuenta con una suite CMS de nivel mundial, lista para producción y completamente autocontenida.*

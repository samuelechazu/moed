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
├── index.html               # Estructura principal, Landing Cósmica y Research Hub
├── editor.html              # Moed Admin Editor (Markdown + Editor de Metadatos YAML)
├── vite.config.js           # Orquestación de compilación multi-página
├── package.json             # Manifiesto de dependencias y scripts del proyecto
├── postcss.config.js        # Procesamiento y optimización de CSS
├── tailwind.config.js       # Tokens de diseño y extensiones estéticas
├── public/                  # Recursos estáticos servidos directamente
│   ├── favicon.svg          # Logotipo vectorial de Moed
│   └── images/              # Portadas de artículos generadas en alta resolución
└── src/                     # Código fuente del ecosistema
    ├── main.js              # Controlador del Hub, Lector Modal e importación eager
    ├── style.css            # Base de diseño cósmico, glassmorphism y utilidades
    └── articles/            # Base de datos CMS física (.md con YAML Frontmatter)
        ├── el-algoritmo-del-alma.md
        ├── el-shabat-en-la-era-del-scroll-infinito.md
        └── la-familia-en-los-tiempos-finales.md
```

---

## 🎨 Sistema de Diseño Cósmico (High-Fidelity)

Para garantizar un impacto visual premium que capture la esencia espiritual y tecnológica del proyecto, se estableció un riguroso lenguaje visual:

1.  **Tipografías Modernas:**
    *   **Outfit:** Aplicada a títulos, headers y secciones destacadas para transmitir una impronta geométrica, moderna y futurista.
    *   **Inter:** Aplicada al cuerpo de lectura y textos de interfaz para garantizar legibilidad perfecta y fatiga visual cero.
2.  **Paleta Cromática Armoniosa (HSL / Hex):**
    *   **Fondo Cósmico Profundo:** `--color-cosmic-950` (`#03050b`) y `--color-cosmic-900` (`#070a13`). Fondo espacial oscuro absoluto.
    *   **Dimensión del Pasado (Espiritual):** Colores Indigo a Violeta (`#6366f1` a `#4338ca`). Representa tradición, revelación bíblica e historia.
    *   **Dimensión del Futuro (Tecnológica):** Colores Púrpura a Lila (`#c084fc` a `#9333ea`). Representa algoritmos, robótica y la era transhumana.
    *   **Dimensión del Presente (Cotidiana):** Acentos dorados y esmeraldas para la vida real y la praxis comunitaria.
3.  **Glassmorphism Premium:**
    *   Fondos con difuminados extremos (`backdrop-blur-2xl`) y opacidades perfectamente balanceadas (`bg-white/5` o `bg-[#070a13]/70`).
    *   Bordes ultra-delgados translúcidos (`border border-white/10`) con sutiles sombras radiales para simular paneles flotantes en el vacío cósmico.

---

## ⚙️ Decisiones Clave de Ingeniería y Solución de Bugs

### 1. Zero-Latency CMS Estático-Dinámico (`import.meta.glob`)
*   **Problema:** Depender de una lista JS cableada para registrar nuevos artículos es manual e insostenible. Peticiones de red en runtime añaden latencia indeseada.
*   **Solución:** Implementamos un escaneo ansioso (`eager: true`) en `src/main.js` mediante la API de Vite `import.meta.glob('./articles/*.md', { as: 'raw', eager: true })`. 
*   **Resultado:** Vite empaqueta directamente el código fuente Markdown y su Frontmatter. El motor cliente lee los contenidos en memoria, extrae el metadato YAML mediante un parser ultraligero a medida, genera las tarjetas del Hub al instante y renderiza el artículo en el **Lector Inmersivo Modal** con **0ms** de latencia de red.

### 2. Guardado de Artículos e Integración con el CMS
*   **Diseño:** El **Moed Admin Editor** (`editor.html`) permite escribir y estructurar artículos usando Markdown visual y código fuente raw en perfecta sincronía bidireccional.
*   **Flujo de Publicación:** Al pulsar "Guardar", la aplicación compila automáticamente los campos de metadatos del formulario visual en un bloque limpio de **Frontmatter YAML** y lo concatena al cuerpo Markdown. Se gatilla una descarga instantánea del archivo `.md` (ej. `nombre-articulo.md`).
*   **Integración:** Para que el artículo aparezca automáticamente en la grilla y esté disponible en el sitio web de Moed, solo es necesario arrastrar o guardar el archivo descargado en la carpeta `src/articles/` del workspace. Vite detectará el nuevo archivo y se integrará en el próximo build automáticamente.

### 3. Automatización del Tiempo de Lectura (`calculateReadTime`)
*   **Solución:** Se implementó una función automatizada reactiva en tiempo real ligada a eventos `input` en el editor. Basándose en la métrica estándar de lectura humana (~200 palabras por minuto), calcula la cantidad de palabras del cuerpo del documento y actualiza de inmediato el indicador visual en el panel de metadatos.

### 4. Corrección de Bugs Estéticos Críticos (UI/UX)
*   **El Bug del Scroll Vertical Infinito:** 
    *   *Causa:* Los destellos y globos nebulosos absolutos del fondo cósmico colocados con posiciones negativas (ej. `bottom-[-20%]`) empujaban las dimensiones totales del `body`, resultando en un scroll infinito e indeseado hacia la nada.
    *   *Solución:* Se encapsuló la capa completa de glows y decorativos en un contenedor rígido: `absolute inset-0 overflow-hidden pointer-events-none z-0`, recortando cualquier desborde fuera del viewport.
*   **El Bug del Calendario Invisible:** 
    *   *Causa:* Los navegadores basados en WebKit/Chromium renderizan por defecto el icono indicador de calendario nativo de `<input type="date">` en color negro, haciéndolo completamente invisible sobre el fondo espacial de Moed.
    *   *Solución:* Aplicamos un filtro CSS adaptativo que invierte y matiza el selector para que brille en un tono púrpura estético:
        ```css
        input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(1) sepia(100%) saturate(1000%) hue-rotate(220deg) brightness(0.9);
            cursor: pointer;
        }
        ```
*   **El Bug de las Opciones en Blanco en Dropdowns (`<select>`):**
    *   *Causa:* En ciertos sistemas operativos y navegadores, los desplegables heredan colores claros en las etiquetas `<option>`, volviendo el texto invisible o con contraste roto sobre los campos oscuros de Moed.
    *   *Solución:* Se estilizó de forma explícita el contenedor del select y sus elementos hijos (`option`) en `style.css` y `editor.html` con fondo de contraste `bg-cosmic-950` y color blanco sólido para asegurar legibilidad bajo cualquier plataforma.

---

## 🧭 Plan de Verificación y Control de Calidad

*   [x] **Build Multi-Página Exitoso:** Validado compilando correctamente `index.html` y `editor.html` con salida minificada lista para hosting estático (Vercel/Netlify).
*   [x] **Sincronización Bidireccional:** El editor sincroniza inmediatamente cambios del modo código al modo visual y viceversa sin pérdida de cursor.
*   [x] **Validación de Metadatos:** El parser YAML maneja correctamente caracteres especiales españoles (tildes, eñes) en títulos, teasers y nombres de autor.

---

> [!TIP]
> *Bitácora de a bordo auditada y sellada bajo los estándares premium de **Echazu**. La iglesia del futuro ya cuenta con un pipeline de publicación y un diseño digno del mañana digital.*

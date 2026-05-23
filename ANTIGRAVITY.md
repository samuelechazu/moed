# Moed: La Iglesia del Futuro - Diario de a Bordo

Proyecto de landing page interactiva y futurista para **Moed**, una comunidad digital que entrelaza la historia bíblica, el presente práctico y el mañana tecnológico (IA, transhumanismo, profecía).

---

## 🛠️ Comandos de Desarrollo

- **Iniciar Servidor de Desarrollo:** `npm run dev`
- **Compilar para Producción:** `npm run build`
- **Previsualizar Compilación:** `npm run preview`

---

## 📂 Estructura del Proyecto

```text
├── .antigravityignore       # Escudo de exclusión de archivos pesados
├── index.html               # Estructura principal e interfaz de usuario (HTML5)
├── package.json             # Dependencias (Vite 8, Tailwind CSS 4, PostCSS)
├── postcss.config.js        # Configuración de procesado CSS
├── tailwind.config.js       # Configuración y temas de Tailwind CSS
├── public/                  # Recursos estáticos públicos
│   └── favicon.svg          # Logotipo / Icono del sitio
└── src/
    ├── main.js              # Lógica e interacciones del cliente (Copiado de alias, etc.)
    └── style.css            # Importación de Tailwind y configuraciones de diseño premium
```

---

## 🎨 Guía de Estilo y Diseño

- **Tipografía:** 
  - Títulos: `Outfit` (sans-serif)
  - Cuerpo: `Inter` (sans-serif)
- **Colores Principales (Esquema Cósmico HSL/Hex):**
  - Fondo: `--color-cosmic-950` (#03050b) y `--color-cosmic-900` (#070a13)
  - El Pasado (Espiritual): `--color-spiritual-500` (#6366f1) a `--color-spiritual-700` (#4338ca) [Indigo/Violeta]
  - El Futuro (Tecnológico): `--color-future-400` (#c084fc) a `--color-future-600` (#9333ea) [Purpura/Lila]
- **Estilo Visual:** Glassmorphism premium (difuminados de fondo en contenedores con bordes translúcidos de bajo contraste `border-white/5` y efectos `backdrop-blur`).

---

## 💡 Reglas y Decisiones Previas

- **Sin Framework Pesado:** Vanilla JS + HTML estático procesado por Vite para optimizar rendimiento y mantener simpleza.
- **Tailwind CSS v4:** Uso de la directiva `@theme` dentro de `src/style.css` en lugar de la configuración tradicional v3 en Javascript.
- **Textos de Negocio:** Todo el contenido es real, directo y enfocado en el mensaje teológico-tecnológico de Moed. Se prohíbe el uso de placeholders o Lorem Ipsum.

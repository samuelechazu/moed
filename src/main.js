import './style.css'

// Dynamic YAML Frontmatter Parser
function parseYAML(mdText) {
  const frontmatterRegex = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/;
  const match = mdText.match(frontmatterRegex);
  
  let metadata = {};
  let content = mdText;
  
  if (match) {
    const yamlBlock = match[1];
    content = match[2];
    
    yamlBlock.split('\n').forEach(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        let value = line.substring(colonIdx + 1).trim();
        value = value.replace(/^['"]|['"]$/g, ''); // Strip quotes
        metadata[key] = value;
      }
    });
  }
  
  return { metadata, content };
}

// Formatter to convert standardized ISO dates (YYYY-MM-DD) to beautiful Spanish text
function formatSpanishDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = match[1];
    const month = parseInt(match[2]) - 1;
    const day = parseInt(match[3]);
    
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    return `${day} de ${months[month]}, ${year}`;
  }
  return dateStr; // fallback if already a string
}

// 🧠 AUTOMATION: Scan and import all markdown files in src/articles/ at build-time
const rawArticles = import.meta.glob('/src/articles/*.md', { query: '?raw', eager: true });

// Build the articles array dynamically by extracting metadata from Frontmatter
const articles = Object.entries(rawArticles).map(([filePath, module]) => {
  const fileName = filePath.split('/').pop();
  const id = fileName.replace('.md', '');
  const rawText = module.default;
  
  const parsed = parseYAML(rawText);
  
  return {
    id,
    title: parsed.metadata.title || 'Artículo de Moed',
    author: parsed.metadata.author || 'Comunidad Moed',
    date: parsed.metadata.date || '23 de Mayo, 2026',
    category: parsed.metadata.category || 'futuro',
    readTime: parsed.metadata.readTime || '5 min',
    coverImage: parsed.metadata.coverImage || '/images/portada-ia.png',
    teaser: parsed.metadata.teaser || 'Resumen introductorio...',
    rawContent: rawText // Kept in memory for instant 0ms reader opening
  };
});

// Wait for DOM to load completely
document.addEventListener('DOMContentLoaded', () => {
  setupThemeSystem();
  setupAliasCopy();
  setupArticleHub();
});

// 🌗 THEME SYSTEM: Light/Dark Mode Manager
function setupThemeSystem() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  
  if (!themeToggleBtn || !sunIcon || !moonIcon) return;
  
  // Read saved theme or default to dark
  const savedTheme = localStorage.getItem('moed_theme') || 'dark';
  
  const applyTheme = (theme) => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    } else {
      document.body.classList.remove('light-mode');
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    }
    localStorage.setItem('moed_theme', theme);
  };
  
  // Initial apply
  applyTheme(savedTheme);
  
  // Toggle listener
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = localStorage.getItem('moed_theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
  
  // Sync changes from other windows/tabs
  window.addEventListener('storage', (e) => {
    if (e.key === 'moed_theme') {
      applyTheme(e.newValue);
    }
  });
}

/**
 * Handles the copying of the MercadoPago donation alias to clipboard
 */
function setupAliasCopy() {
  const copyBtn = document.getElementById('copyAliasBtn');
  const aliasTextEl = document.getElementById('aliasText');
  const tooltip = document.getElementById('copyTooltip');

  if (!copyBtn || !aliasTextEl || !tooltip) return;

  copyBtn.addEventListener('click', async () => {
    const alias = aliasTextEl.textContent.trim();

    try {
      // Use Modern Clipboard API
      await navigator.clipboard.writeText(alias);
      
      // Update Button UI state
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg class="w-4 h-4 fill-none stroke-current text-emerald-400" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span class="text-emerald-400">Copiado</span>
      `;
      
      // Show Tooltip
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';

      // Reset UI state after 2 seconds
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(4px)';
      }, 2000);

    } catch (err) {
      console.error('Error al copiar el alias al portapapeles:', err);
    }
  });
}

/**
 * Manages the Moed Research & Reflection Hub
 */
function setupArticleHub() {
  const gridContainer = document.getElementById('articles-grid');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const readerModal = document.getElementById('article-reader-modal');
  const modalContent = document.getElementById('modal-article-content');
  const closeBtn = document.getElementById('close-reader-btn');

  if (!gridContainer || !readerModal || !modalContent || !closeBtn) return;

  // Render initial cards grilla
  renderArticleCards(articles);

  // Wire up category filters
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active states
      filterBtns.forEach(b => {
        b.classList.remove('active', 'bg-white/10', 'text-white', 'shadow-sm', 'border-white/5');
        b.classList.add('text-slate-400', 'border-transparent');
      });
      btn.classList.add('active', 'bg-white/10', 'text-white', 'shadow-sm', 'border-white/5');
      btn.classList.remove('text-slate-400', 'border-transparent');

      const filterValue = btn.getAttribute('data-filter');
      filterArticles(filterValue);
    });
  });

  // Wire up Modal Open events (delegated click on "Leer artículo")
  gridContainer.addEventListener('click', (e) => {
    const readBtn = e.target.closest('.read-btn');
    if (!readBtn) return;

    const id = readBtn.getAttribute('data-id');
    const article = articles.find(a => a.id === id);

    if (article) {
      openArticleReader(article);
    }
  });

  // Wire up Close controls
  closeBtn.addEventListener('click', closeArticleReader);
  
  // Close when clicking backdrop
  readerModal.addEventListener('click', (e) => {
    if (e.target === readerModal) {
      closeArticleReader();
    }
  });

  // Keyboard accessibility: Escape key to close
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && readerModal.classList.contains('active')) {
      closeArticleReader();
    }
  });

  /**
   * Renders the dynamic grilla card list
   */
  function renderArticleCards(items) {
    gridContainer.innerHTML = '';
    
    if (items.length === 0) {
      gridContainer.innerHTML = `
        <div class="col-span-full text-center py-16 text-slate-400 font-light">
          No hay artículos cargados en esta categoría aún.
        </div>
      `;
      return;
    }

    items.forEach(item => {
      let glowColor = 'future';
      let badgeClass = 'text-future-400 bg-future-500/10 border-future-500/20';
      let hoverBorder = 'hover:border-future-500/20';

      if (item.category === 'pasado') {
        glowColor = 'spiritual';
        badgeClass = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
        hoverBorder = 'hover:border-indigo-500/20';
      } else if (item.category === 'presente') {
        glowColor = 'slate';
        badgeClass = 'text-slate-300 bg-white/5 border-white/10';
        hoverBorder = 'hover:border-white/10';
      }

      const card = document.createElement('div');
      card.className = `article-card group relative rounded-2xl bg-gradient-to-b from-white/5 to-white/[0.02] border border-white/5 ${hoverBorder} p-6 md:p-8 shadow-glass transition-all duration-500 hover:-translate-y-1 overflow-hidden flex flex-col`;
      card.setAttribute('data-category', item.category);

      card.innerHTML = `
        <!-- Glow Overlay -->
        <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-${glowColor === 'slate' ? 'indigo' : glowColor}-500/5 group-hover:bg-${glowColor === 'slate' ? 'indigo' : glowColor}-500/10 blur-xl transition-all duration-500"></div>
        
        <span class="inline-flex self-start items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider ${badgeClass} border mb-4 uppercase">
          ${item.category === 'pasado' ? 'El Pasado' : item.category === 'presente' ? 'El Presente' : 'El Futuro'}
        </span>
        
        <h3 class="font-display font-bold text-lg md:text-xl text-white mb-3 group-hover:text-slate-100 transition-colors duration-200 leading-snug">
          ${item.title}
        </h3>
        
        <p class="text-slate-400 text-sm leading-relaxed mb-6 font-light">
          ${item.teaser}
        </p>
        
        <div class="flex items-center justify-between mt-auto pt-4 border-t border-white/5 text-xs text-slate-400 w-full">
          <span class="flex items-center gap-1.5 font-light">
            <svg class="w-3.5 h-3.5 fill-none stroke-current" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ${item.readTime}
          </span>
          <button class="read-btn font-semibold text-future-400 hover:text-future-300 transition-colors duration-200 flex items-center gap-1.5 cursor-pointer" data-id="${item.id}">
            Leer artículo
            <svg class="w-3.5 h-3.5 stroke-current fill-none transition-transform duration-200 group-hover:translate-x-1" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      `;

      gridContainer.appendChild(card);
    });
  }

  /**
   * Filters the grilla cards based on category
   */
  function filterArticles(category) {
    const cards = gridContainer.querySelectorAll('.article-card');
    
    cards.forEach(card => {
      const cardCategory = card.getAttribute('data-category');
      
      if (category === 'all' || cardCategory === category) {
        card.style.display = 'flex';
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0) scale(1)';
        }, 10);
      } else {
        card.style.opacity = '0';
        card.style.transform = 'translateY(8px) scale(0.98)';
        setTimeout(() => {
          card.style.display = 'none';
        }, 300);
      }
    });
  }

  /**
   * Opens the article reader modal instantly (0ms latency!)
   */
  function openArticleReader(article) {
    document.body.classList.add('reader-open');
    
    // Compile Markdown to HTML instantly (loaded eager in bundle!)
    const compiledHtml = compileMarkdown(article.rawContent, article);
    
    // Inject completed reading interface
    modalContent.innerHTML = compiledHtml;
    readerModal.classList.add('active');

    // Close reader if they click the WhatsApp link inside
    const modalWapLink = modalContent.querySelector('.close-modal-link');
    if (modalWapLink) {
      modalWapLink.addEventListener('click', closeArticleReader);
    }
  }

  /**
   * Closes the article reader modal safely
   */
  function closeArticleReader() {
    readerModal.classList.remove('active');
    document.body.classList.remove('reader-open');
    setTimeout(() => {
      modalContent.innerHTML = '';
    }, 300);
  }

  /**
   * Compiles Markdown body to structural HTML, skipping frontmatter
   */
  function compileMarkdown(mdText, metadata) {
    // 1. Remove Frontmatter YAML block if present
    const frontmatterRegex = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/;
    const match = mdText.match(frontmatterRegex);
    let mdBody = match ? match[2] : mdText;

    // 2. Parse Markdown blocks
    const lines = mdBody.split('\n');
    let htmlContent = '';
    let inList = false;
    let listItems = [];

    const flushList = () => {
      if (listItems.length) {
        htmlContent += `<ul class="space-y-2 my-4 pl-6 list-disc text-slate-300">`;
        listItems.forEach(item => {
          htmlContent += `<li>${compileInlineStyles(item)}</li>`;
        });
        htmlContent += `</ul>`;
      }
      listItems = [];
      inList = false;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle lists compilation
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        inList = true;
        listItems.push(trimmed.slice(2));
        continue;
      } else if (inList && trimmed !== '') {
        // Continue list items
        if (/^[a-zA-Z0-9]/.test(trimmed)) {
          // just append to last item
          listItems[listItems.length - 1] += ' ' + trimmed;
          continue;
        }
      }

      if (inList && trimmed === '') {
        flushList();
      }

      if (trimmed.startsWith('# ')) {
        htmlContent += `<h1 class="font-display font-black text-2xl md:text-4xl text-white mb-6 mt-2 leading-tight">${compileInlineStyles(trimmed.slice(2))}</h1>`;
      } else if (trimmed.startsWith('## ')) {
        htmlContent += `<h2 class="font-display font-extrabold text-xl md:text-2xl text-white mb-4 mt-8 border-l-2 border-future-500 pl-4">${compileInlineStyles(trimmed.slice(3))}</h2>`;
      } else if (trimmed.startsWith('### ')) {
        htmlContent += `<h3 class="font-display font-bold text-lg md:text-xl text-white mb-3 mt-6">${compileInlineStyles(trimmed.slice(4))}</h3>`;
      } else if (trimmed.startsWith('> ')) {
        htmlContent += `<blockquote class="border-l-4 border-future-500 bg-white/2 rounded-r-xl p-4 my-6 italic text-slate-200 font-light">${compileInlineStyles(trimmed.slice(2))}</blockquote>`;
      } else if (trimmed === '---' || trimmed === '***') {
        htmlContent += `<div class="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>`;
      } else if (trimmed === '') {
        // Ignore empty lines
      } else {
        htmlContent += `<p class="mb-5 leading-relaxed text-slate-300 font-light text-base md:text-lg">${compileInlineStyles(trimmed)}</p>`;
      }
    }

    if (inList) flushList();

    // 3. Prepend beautiful header layout
    const headerHtml = `
      <header class="mb-8 border-b border-white/5 pb-6 text-center md:text-left pr-8">
        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider ${
          metadata.category === 'pasado'
            ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
            : metadata.category === 'presente'
            ? 'text-slate-300 bg-white/5 border-white/10'
            : 'text-future-400 bg-future-500/10 border-future-500/20'
        } border mb-4 uppercase">
          ${metadata.category === 'pasado' ? 'El Pasado' : metadata.category === 'presente' ? 'El Presente' : 'El Futuro'}
        </span>
        <h1 class="font-display font-black text-3xl md:text-5xl text-white tracking-tight leading-tight mb-4 pr-6">
          ${metadata.title}
        </h1>
        <div class="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-400 font-light">
          <span class="flex items-center gap-1.5">
            <svg class="w-4 h-4 fill-none stroke-current" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Lectura: ${metadata.readTime}
          </span>
          <span>•</span>
          <span>Por ${metadata.author}</span>
          <span>•</span>
          <span>${formatSpanishDate(metadata.date)}</span>
        </div>
      </header>
    `;

    // 4. Append final Call to Action Card
    const ctaHtml = `
      <div class="mt-12 p-6 rounded-2xl bg-white/2 border border-white/5 text-center">
        <p class="text-sm text-slate-300 mb-4 font-light">¿Querés debatir este artículo con nosotros en tiempo real?</p>
        <a href="#comunidad" class="close-modal-link inline-flex items-center gap-2 text-sm font-semibold text-future-400 hover:text-future-300 transition-colors duration-200">
          Unite al debate en el grupo de WhatsApp
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    `;

    return headerHtml + `<div class="prose prose-invert max-w-none">${htmlContent}</div>` + ctaHtml;
  }

  /**
   * Compiles inline tags like bold, italic, links, images, mark, code
   */
  function compileInlineStyles(text) {
    let s = text;
    // Images: ![alt](/path)
    s = s.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="my-6 rounded-xl border border-white/5 shadow-md">');
    // Bold: **text**
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
    // Italic: *text*
    s = s.replace(/\*(.*?)\*/g, '<em class="italic text-slate-200">$1</em>');
    // Strike: ~~text~~
    s = s.replace(/~~(.*?)~~/g, '<del class="line-through text-slate-500">$1</del>');
    // Highlight: ==text==
    s = s.replace(/==(.*?)==/g, '<mark class="bg-future-500/20 text-future-300 px-1 rounded">$1</mark>');
    // Code: `text`
    s = s.replace(/`(.*?)`/g, '<code class="bg-white/5 border border-white/5 text-future-300 px-1.5 py-0.5 rounded font-mono text-xs">$1</code>');
    // Links: [label](href)
    s = s.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-future-400 border-b border-future-500/40 hover:border-white hover:text-white transition-colors pb-0.5">$1</a>');
    return s;
  }
}

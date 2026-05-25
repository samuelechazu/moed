let fileSystemHandle = null;
let fileDisplayName = 'articulo-nuevo.md';
let isDirty = false;
let isParsingLock = false;
let pendingFileReference = null;
let activeScrollDriver = null;
let currentFileSha = null; // Git unique file signature for cloud edits

let historyStates = [];
let historyIndex = -1;
const maxHistory = 50;
let historyTimeout = null;
let splitSyncTimeout = null;
let lastCanvasRange = null;

// Current metadata state
let frontmatterData = {
  title: 'Título del Artículo',
  author: 'Comunidad Moed',
  date: '2026-05-23',
  category: 'futuro',
  published: 'false',
  coverImage: '/images/portada-ia.jpg',
  teaser: 'Breve resumen introductorio para captar la atención del lector en la grilla...'
};

const canvas = document.getElementById('design-canvas');
const sourceEditor = document.getElementById('source-editor');
const designWrapper = document.getElementById('design-wrapper');
const sourceWrapper = document.getElementById('source-wrapper');
const fileMeta = document.getElementById('file-meta');
const safetyHud = document.getElementById('safety-hud');
const fallbackInput = document.getElementById('fallback-input');

const shortTemplate = `# Título del Artículo

Escribe aquí tu análisis histórico, práctico o profético...

## Subtítulo del Artículo
Los algoritmos de optimización de atención están reemplazando silenciosamente la interacción cara a cara en el hogar...

> "El diseño original no cambia con la velocidad de la fibra óptica, pero nuestra capacidad de cuidarlo sí."`;

function isWritableHandle(handle) {
  return handle && typeof handle.createWritable === 'function';
}

function sanitizeUrl(url) {
  const u = (url || '').trim();
  if (!u) return '#';
  const lower = u.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return '#';
  if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(u)) return u;
  if (!u.includes(':')) return u;
  return '#';
}

function resolveLinkHref(url) {
  const safe = sanitizeUrl(url);
  if (safe === '#') return safe;
  if (/^(https?:|mailto:|#|\/)/i.test(safe)) return safe;
  if (safe.includes('.') && !/\s/.test(safe)) return `https://${safe}`;
  return safe;
}

function syncScrollProgress(sourceEl, targetEl) {
  const maxSource = sourceEl.scrollHeight - sourceEl.clientHeight;
  const maxTarget = targetEl.scrollHeight - targetEl.clientHeight;
  if (maxSource <= 0 || maxTarget <= 0) return;
  const progress = sourceEl.scrollTop / maxSource;
  targetEl.scrollTop = progress * maxTarget;
}

function persistAutosaveBuffer() {
  try {
    localStorage.setItem('moed_md_editor_buffer', sourceEditor.value);
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      console.warn('Buffer local lleno; no se guardó la copia de seguridad.');
    }
  }
}

function ensureSourceSyncedFromCanvas() {
  if (document.body.classList.contains('state-design') || document.body.classList.contains('state-split')) {
    synchronizeCanvasToSource();
  }
}

function captureHistorySnapshot() {
  if (isParsingLock) return;
  ensureSourceSyncedFromCanvas();

  const currentText = sourceEditor.value;
  if (historyIndex >= 0 && currentText === historyStates[historyIndex]) return;

  historyStates = historyStates.slice(0, historyIndex + 1);
  historyStates.push(currentText);
  if (historyStates.length > maxHistory) historyStates.shift();
  historyIndex = historyStates.length - 1;
  updateHistoryButtons();
}

function queueHistorySnapshotWithDebounce() {
  clearTimeout(historyTimeout);
  historyTimeout = setTimeout(captureHistorySnapshot, 400);
}

function queueSplitSourceToCanvas() {
  clearTimeout(splitSyncTimeout);
  splitSyncTimeout = setTimeout(() => {
    if (document.body.classList.contains('state-split')) synchronizeSourceToCanvas();
  }, 180);
}

function executeUndo() {
  if (historyIndex > 0) {
    historyIndex--;
    loadStateFromHistory();
  }
}

function executeRedo() {
  if (historyIndex < historyStates.length - 1) {
    historyIndex++;
    loadStateFromHistory();
  }
}

function loadStateFromHistory() {
  isParsingLock = true;
  sourceEditor.value = historyStates[historyIndex];
  isParsingLock = false;
  synchronizeSourceToCanvas();
  isDirty = true;
  updateStatusDisplay();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  document.getElementById('btn-undo').disabled = historyIndex <= 0;
  document.getElementById('btn-redo').disabled = historyIndex >= historyStates.length - 1;
}

designWrapper.addEventListener('mouseenter', () => { activeScrollDriver = 'design'; });
if (sourceWrapper) {
  sourceWrapper.addEventListener('mouseenter', () => { activeScrollDriver = 'source'; });
}
sourceEditor.addEventListener('mouseenter', () => { activeScrollDriver = 'source'; });

designWrapper.addEventListener('scroll', () => {
  if (activeScrollDriver !== 'design' || !document.body.classList.contains('state-split')) return;
  syncScrollProgress(designWrapper, sourceEditor);
});

sourceEditor.addEventListener('scroll', () => {
  if (activeScrollDriver !== 'source' || !document.body.classList.contains('state-split')) return;
  syncScrollProgress(sourceEditor, designWrapper);
});

function unwrapElement(el) {
  if (!el || !el.parentNode) return;
  const parent = el.parentNode;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  parent.normalize();
}

function nodeDepth(node) {
  let depth = 0;
  let n = node;
  while (n && n !== canvas) {
    depth++;
    n = n.parentNode;
  }
  return depth;
}

function storeCanvasSelection() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!canvas.contains(range.commonAncestorContainer)) return;
  lastCanvasRange = range.cloneRange();
}

function getCaretRange() {
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const live = sel.getRangeAt(0);
    if (canvas.contains(live.commonAncestorContainer)) return live.cloneRange();
  }
  return lastCanvasRange ? lastCanvasRange.cloneRange() : null;
}

function getWorkingRange() {
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const live = sel.getRangeAt(0);
    if (!sel.isCollapsed && canvas.contains(live.commonAncestorContainer)) return live.cloneRange();
  }
  if (lastCanvasRange && !lastCanvasRange.collapsed) return lastCanvasRange.cloneRange();
  return null;
}

function withCanvasSelection(fn) {
  canvas.focus();
  const range = getCaretRange();
  if (range) restoreRange(range);
  return fn(range);
}

function preserveToolbarMousedown(e) {
  storeCanvasSelection();
  e.preventDefault();
}

function getTextNodesInRange(range) {
  const nodes = [];
  const walker = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent.length) continue;
    if (rangeIntersectsNode(range, node)) nodes.push(node);
  }
  return nodes;
}

function findBlockForInsertion(node) {
  let n = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (n && n !== canvas) {
    const tag = n.tagName;
    if (tag === 'TD' || tag === 'TH') return n.closest('table');
    if (['P', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'TABLE', 'HR', 'IMG'].includes(tag)) return n;
    n = n.parentNode;
  }
  return null;
}

function getSelectionBlock() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  return findBlockForInsertion(node);
}

function insertBlockAtCaret(blockNode) {
  const range = getCaretRange();
  let insertAfter = null;

  if (range) {
    const ref = range.commonAncestorContainer;
    insertAfter = findBlockForInsertion(ref);
  }

  if (!insertAfter) {
    if (canvas.lastElementChild) insertAfter = canvas.lastElementChild;
    else {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      canvas.appendChild(p);
      insertAfter = p;
    }
  }

  insertAfter.after(blockNode);
  placeCaretInBlock(blockNode);
  markModified();
  captureHistorySnapshot();
}

function placeCaretInBlock(node) {
  let range = document.createRange();
  if (node.classList && node.classList.contains('task-node')) {
    const span = node.querySelector('span');
    if (!span) return;
    range.selectNodeContents(span);
    range.collapse(false);
  } else if (node.tagName === 'TABLE') {
    const cell = node.querySelector('td, th');
    if (!cell) return;
    range.selectNodeContents(cell);
    range.collapse(true);
  } else {
    range.selectNodeContents(node);
    range.collapse(false);
  }
  restoreRange(range);
  lastCanvasRange = range.cloneRange();
}

function wrapTextNodeWithTag(textNode, tagName) {
  const parent = textNode.parentNode;
  if (!parent) return null;
  const el = document.createElement(tagName);
  parent.insertBefore(el, textNode);
  el.appendChild(textNode);
  return el;
}

function findStrikeWrapper(node) {
  let n = node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (n && n !== canvas) {
    const t = n.tagName && n.tagName.toLowerCase();
    if (t === 'del' || t === 's' || t === 'strike') return n;
    n = n.parentNode;
  }
  return null;
}

function toggleInlineOnTextNodes(range, tagName, findWrapper) {
  const textNodes = getTextNodesInRange(range).filter(n => n.textContent.length > 0);
  if (!textNodes.length) return;

  const wrappers = textNodes.map(n => findWrapper(n)).filter(Boolean);
  if (wrappers.length > 0) {
    [...new Set(wrappers)]
      .sort((a, b) => nodeDepth(b) - nodeDepth(a))
      .forEach(unwrapElement);
    return;
  }

  textNodes.forEach(n => wrapTextNodeWithTag(n, tagName));
}

function restoreRange(range) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

const FORMAT_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'DEL', 'MARK', 'CODE', 'A', 'U', 'S', 'STRIKE', 'FONT', 'SUB', 'SUP']);

function isFormatElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = el.tagName;
  if (FORMAT_TAGS.has(tag)) return true;
  if (tag === 'SPAN') {
    const style = el.getAttribute('style');
    if (style && /background|font-weight|font-style|text-decoration|color/i.test(style)) return true;
    if (el.querySelector('strong,b,em,i,del,mark,code,a,u,s,strike')) return true;
    return !!(style && style.trim());
  }
  return false;
}

function rangeIntersectsNode(range, node) {
  try {
    return range.intersectsNode(node);
  } catch {
    const nodeRange = document.createRange();
    if (node.nodeType === Node.TEXT_NODE) nodeRange.selectNode(node);
    else nodeRange.selectNodeContents(node);
    return !(
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0
    );
  }
}

function collectFormatElementsInRange(range) {
  const found = [];
  const walker = document.createTreeWalker(canvas, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (!isFormatElement(node)) continue;
    if (rangeIntersectsNode(range, node)) found.push(node);
  }
  return found;
}

function clearInlineFormatting() {
  const range = getWorkingRange();
  if (!range) {
    alert('Selecciona el texto o las celdas con formato que quieres limpiar.');
    return;
  }

  canvas.focus();
  restoreRange(range);

  let hasHeading = false;
  const currentBlock = getSelectionBlock();
  if (currentBlock && ['H1', 'H2', 'H3'].includes(currentBlock.tagName)) {
    hasHeading = true;
  } else {
    const walker = document.createTreeWalker(canvas, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (['H1', 'H2', 'H3'].includes(node.tagName) && rangeIntersectsNode(range, node)) {
        hasHeading = true;
        break;
      }
    }
  }

  if (hasHeading) {
    document.execCommand('formatBlock', false, '<p>');
  }

  for (let pass = 0; pass < 12; pass++) {
    const batch = collectFormatElementsInRange(range);
    if (!batch.length) break;
    batch.sort((a, b) => nodeDepth(b) - nodeDepth(a));
    batch.forEach(unwrapElement);
  }

  restoreRange(range);
  document.execCommand('removeFormat', false, null);
  document.execCommand('unlink', false, null);

  collectFormatElementsInRange(range)
    .sort((a, b) => nodeDepth(b) - nodeDepth(a))
    .forEach(unwrapElement);

  lastCanvasRange = range.cloneRange();
  restoreRange(range);
  markModified();
  captureHistorySnapshot();
}

function findAncestorTag(node, tagName) {
  const tag = tagName.toLowerCase();
  let n = node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (n && n !== canvas) {
    if (n.tagName && n.tagName.toLowerCase() === tag) return n;
    n = n.parentNode;
  }
  return null;
}

function findHighlightWrapper(node) {
  let n = node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (n && n !== canvas) {
    if (n.tagName === 'MARK') return n;
    if (n.tagName === 'SPAN' && n.style && n.style.backgroundColor) return n;
    n = n.parentNode;
  }
  return null;
}

function toggleHighlight() {
  withCanvasSelection((range) => {
    if (!range || range.collapsed) return;
    toggleInlineOnTextNodes(range, 'mark', findHighlightWrapper);
    markModified();
    captureHistorySnapshot();
  });
}

function getActiveLinkAnchor() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  return node && node.closest ? node.closest('a') : null;
}

function openLinkAnchor(anchor) {
  const href = resolveLinkHref(anchor.getAttribute('href') || '');
  if (!href || href === '#') return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

function editLinkElement(anchor) {
  const currentUrl = anchor.getAttribute('href') || '';
  const urlInput = prompt('URL del enlace:', currentUrl);
  if (urlInput === null) return;
  const safe = sanitizeUrl(urlInput);
  if (safe === '#') {
    alert('URL no permitida. Usa http(s), mailto o rutas relativas.');
    return;
  }
  const textInput = prompt('Texto visible:', anchor.textContent);
  if (textInput === null) return;
  anchor.href = resolveLinkHref(safe);
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.title = 'Ctrl/Alt+clic: abrir · Doble clic: editar';
  anchor.textContent = textInput.trim() || safe;
  markModified();
  captureHistorySnapshot();
}

function toggleStrike() {
  withCanvasSelection((range) => {
    if (!range || range.collapsed) return;
    toggleInlineOnTextNodes(range, 'del', findStrikeWrapper);
    markModified();
    captureHistorySnapshot();
  });
}

document.querySelectorAll('#top-navbar .action-btn, #formatting-bar .action-btn').forEach(btn => {
  btn.addEventListener('mousedown', preserveToolbarMousedown);
});

canvas.addEventListener('mouseup', storeCanvasSelection);
canvas.addEventListener('keyup', storeCanvasSelection);
document.addEventListener('selectionchange', storeCanvasSelection);

canvas.addEventListener('click', (e) => {
  const anchor = e.target.closest('a');
  if (!anchor) return;

  if (e.ctrlKey || e.metaKey || e.altKey) {
    e.preventDefault();
    openLinkAnchor(anchor);
    return;
  }

  if (e.detail >= 2) {
    e.preventDefault();
    editLinkElement(anchor);
  }
});

canvas.addEventListener('mousedown', (e) => {
  const anchor = e.target.closest('a');
  if (!anchor) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.detail >= 2) e.preventDefault();
});

canvas.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const anchor = e.target.closest('a');
  if (!anchor) return;
  e.preventDefault();
  openLinkAnchor(anchor);
});



// Dynamic YAML Frontmatter Parser & Writer
function parseYAMLFrontmatter(mdText) {
  const frontmatterRegex = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/;
  const match = mdText.match(frontmatterRegex);
  
  let metadata = {
    title: 'Título del Artículo',
    author: 'Comunidad Moed',
    date: '2026-05-23',
    category: 'futuro',
    published: 'true',
    coverImage: '/images/portada-ia.jpg',
    teaser: 'Breve resumen introductorio para la grilla...'
  };
  
  let content = mdText;
  
  if (match) {
    const yamlBlock = match[1];
    content = match[2];
    
    yamlBlock.split('\n').forEach(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        let value = line.substring(colonIdx + 1).trim();
        
        // Unescape YAML double/single quotes and escaped characters robustly
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        
        if (key in metadata || ['title', 'author', 'date', 'category', 'published', 'coverImage', 'teaser'].includes(key)) {
          metadata[key] = value;
        }
      }
    });
  }
  
  return { metadata, content };
}

function calculateReadTime(text) {
  const cleanContent = (text || '').trim();
  const words = cleanContent.split(/\s+/).filter(w => w.length > 0);
  const minutes = Math.max(1, Math.ceil(words.length / 200));
  return `${minutes} min`;
}

// Format date back to ISO standard
function parseStringToISO(str) {
  if (!str) return getTodayISODate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  
  try {
    const monthsMap = {
      enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
      julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
    };
    const cleanStr = str.toLowerCase().trim();
    const match = cleanStr.match(/(\d+)\s+de\s+([a-z]+),?\s+(\d{4})/);
    if (match) {
      const day = String(match[1]).padStart(2, '0');
      const month = monthsMap[match[2]] || '01';
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
  } catch (e) {}
  
  return getTodayISODate();
}

function getTodayISODate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function generateYAMLFrontmatter() {
  const escapeYamlString = (str) => {
    return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  };
  
  return `---\n` +
         `title: "${escapeYamlString(frontmatterData.title)}"\n` +
         `author: "${escapeYamlString(frontmatterData.author)}"\n` +
         `date: "${frontmatterData.date}"\n` +
         `category: "${frontmatterData.category}"\n` +
         `published: ${frontmatterData.published || 'true'}\n` +
         `coverImage: "${escapeYamlString(frontmatterData.coverImage)}"\n` +
         `teaser: "${escapeYamlString(frontmatterData.teaser)}"\n` +
         `---\n`;
}

function syncFrontmatterFieldsToInputs() {
  document.getElementById('meta-title').value = frontmatterData.title;
  document.getElementById('meta-author').value = frontmatterData.author;
  document.getElementById('meta-date').value = parseStringToISO(frontmatterData.date);
  document.getElementById('meta-category').value = frontmatterData.category;
  document.getElementById('meta-published').value = String(frontmatterData.published || 'true');
  document.getElementById('meta-cover').value = frontmatterData.coverImage;
  document.getElementById('meta-teaser').value = frontmatterData.teaser;
}

function syncInputsToFrontmatterFields() {
  frontmatterData.title = document.getElementById('meta-title').value.trim() || 'Título del Artículo';
  frontmatterData.author = document.getElementById('meta-author').value.trim() || 'Comunidad Moed';
  frontmatterData.date = document.getElementById('meta-date').value || getTodayISODate();
  frontmatterData.category = document.getElementById('meta-category').value;
  frontmatterData.published = document.getElementById('meta-published').value;
  frontmatterData.coverImage = document.getElementById('meta-cover').value.trim() || '/images/portada-ia.jpg';
  frontmatterData.teaser = document.getElementById('meta-teaser').value.trim() || 'Breve resumen introductorio...';
}

// Toggle Frontmatter Panel visibility
document.getElementById('btn-frontmatter').addEventListener('click', () => {
  const panel = document.getElementById('frontmatter-panel');
  panel.classList.toggle('collapsed');
  
  const isCollapsed = panel.classList.contains('collapsed');
  const btn = document.getElementById('btn-frontmatter');
  
  if (isCollapsed) {
    btn.style.background = 'rgba(255, 255, 255, 0.04)';
    btn.style.borderColor = 'var(--border-color)';
  } else {
    btn.style.background = 'rgba(168, 85, 247, 0.1)';
    btn.style.borderColor = 'var(--accent-future)';
  }
});

// Wire up inputs event to sync back on change
['meta-title', 'meta-author', 'meta-date', 'meta-category', 'meta-published', 'meta-cover', 'meta-teaser'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    syncInputsToFrontmatterFields();
    markModified();
    if (document.body.classList.contains('state-split') || document.body.classList.contains('state-source')) {
      // Re-generate markdown in editor to include new frontmatter
      synchronizeCanvasToSource();
    }
    queueHistorySnapshotWithDebounce();
  });
});

function synchronizeSourceToCanvas() {
  if (isParsingLock) return;
  isParsingLock = true;

  const rawText = sourceEditor.value;
  const parsed = parseYAMLFrontmatter(rawText);
  
  // Auto calculate readTime based on actual loaded text content
  parsed.metadata.readTime = calculateReadTime(parsed.content);
  
  // Update frontmatter state and sync UI inputs
  frontmatterData = parsed.metadata;
  syncFrontmatterFieldsToInputs();

  const lines = parsed.content.split('\n');
  let html = '';
  let tableRows = [];
  let inTable = false;
  let inCodeBlock = false;
  let codeLines = [];

  const flushTable = () => {
    if (tableRows.length) html += compileHtmlTable(tableRows);
    tableRows = [];
    inTable = false;
  };

  const flushCode = () => {
    const code = codeLines.join('\n');
    html += `<pre class="code-block-wrapper"><code>${escapeHtml(code)}</code></pre>`;
    codeLines = [];
    inCodeBlock = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (trimmed === '```') flushCode();
      else codeLines.push(line);
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushTable();
      inCodeBlock = true;
      continue;
    }

    if (trimmed.startsWith('|')) {
      if (!inTable) inTable = true;
      tableRows.push(trimmed);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (trimmed.startsWith('# ')) html += `<h1>${compileInlineMarkdown(line.slice(2))}</h1>`;
    else if (trimmed.startsWith('## ')) html += `<h2>${compileInlineMarkdown(line.slice(3))}</h2>`;
    else if (trimmed.startsWith('### ')) html += `<h3>${compileInlineMarkdown(line.slice(4))}</h3>`;
    else if (trimmed.startsWith('> ')) html += `<blockquote>${compileInlineMarkdown(trimmed.slice(2))}</blockquote>`;
    else if (trimmed === '---' || trimmed === '***' || trimmed === '___') html += '<hr>';
    else if (/^- \[[ xX]\] /.test(trimmed)) {
      const checked = /^- \[[xX]\] /.test(trimmed) ? 'checked' : '';
      const text = trimmed.replace(/^- \[[ xX]\] /, '');
      html += `<li class="task-node"><input type="checkbox" ${checked}><span>${compileInlineMarkdown(text)}</span></li>`;
    } else if (trimmed.startsWith('- ')) html += `<li>${compileInlineMarkdown(trimmed.slice(2))}</li>`;
    else if (trimmed === '') html += '<p><br></p>';
    else html += `<p>${compileInlineMarkdown(line)}</p>`;
  }

  if (inTable) flushTable();
  if (inCodeBlock) flushCode();

  canvas.innerHTML = html;
  isParsingLock = false;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function compileInlineMarkdown(text) {
  let s = escapeHtml(text);
  // Support markdown image rendering
  s = s.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, src) => {
    const safe = sanitizeUrl(src);
    return `<img src="${safe}" alt="${escapeHtml(alt)}" title="${escapeHtml(alt)}">`;
  });
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/~~(.*?)~~/g, '<del>$1</del>');
  s = s.replace(/==(.*?)==/g, '<mark>$1</mark>');
  s = s.replace(/`(.*?)`/g, '<code>$1</code>');
  s = s.replace(/\[(.*?)\]\((.*?)\)/g, (_, label, href) => {
    const safe = sanitizeUrl(href);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" title="Ctrl+clic: abrir · Doble clic: editar">${label}</a>`;
  });
  return s;
}

function compileHtmlTable(rows) {
  let html = '<table>';
  let headerDone = false;
  rows.forEach((row) => {
    const cells = row.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
    if (cells.every(c => /^-+:?$|^:-+:?$|^:-+$/.test(c))) return;
    const isHeader = !headerDone;
    html += isHeader ? '<thead><tr>' : '<tr>';
    cells.forEach(cell => {
      html += isHeader ? `<th>${compileInlineMarkdown(cell)}</th>` : `<td>${compileInlineMarkdown(cell)}</td>`;
    });
    html += isHeader ? '</tr></thead><tbody>' : '</tr>';
    if (isHeader) headerDone = true;
  });
  return html + '</tbody></table>';
}

function synchronizeCanvasToSource() {
  if (isParsingLock) return;
  isParsingLock = true;

  const md = [];
  Array.from(canvas.children).forEach(node => {
    const tag = node.tagName.toLowerCase();

    if (tag === 'table') {
      const rows = node.querySelectorAll('tr');
      rows.forEach((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('th, td')).map(c => deconstructInlineStyles(c.innerHTML));
        md.push(`| ${cells.join(' | ')} |`);
        if (rIdx === 0 && row.querySelector('th')) {
          md.push(`| ${cells.map(() => '---').join(' | ')} |`);
        }
      });
      md.push('');
      return;
    }

    if (tag === 'pre') {
      const code = node.querySelector('code');
      md.push('```');
      md.push(code ? code.textContent : node.textContent);
      md.push('```');
      md.push('');
      return;
    }

    let content = deconstructInlineStyles(node.innerHTML);
    if (content === '<br>') content = '';

    if (tag === 'h1') md.push(`# ${content}`);
    else if (tag === 'h2') md.push(`## ${content}`);
    else if (tag === 'h3') md.push(`### ${content}`);
    else if (tag === 'blockquote') md.push(`> ${content}`);
    else if (tag === 'hr') md.push('---');
    else if (tag === 'p') md.push(content);
    else if (tag === 'img') {
      const alt = node.getAttribute('alt') || 'Imagen';
      const src = node.getAttribute('src') || '';
      md.push(`![${alt}](${src})`);
      md.push('');
    }
    else if (tag === 'li') {
      if (node.classList.contains('task-node')) {
        const chk = node.querySelector('input[type="checkbox"]');
        const span = node.querySelector('span');
        const txt = span ? deconstructInlineStyles(span.innerHTML) : '';
        md.push(chk && chk.checked ? `- [x] ${txt}` : `- [ ] ${txt}`);
      } else {
        md.push(`- ${content}`);
      }
    }
  });

  const bodyMarkdown = md.join('\n').replace(/\n{3,}/g, '\n\n');
  
  const frontmatter = generateYAMLFrontmatter();
  
  sourceEditor.value = frontmatter + bodyMarkdown;
  isParsingLock = false;
}

function deconstructInlineStyles(html) {
  let s = html;
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)');
  s = s.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**').replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  s = s.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*').replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  s = s.replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~').replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~').replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~');
  s = s.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '==$1==');
  s = s.replace(/<span[^>]*style="[^"]*background[^"]*"[^>]*>(.*?)<\/span>/gi, '==$1==');
  
  // Unwrap any other remaining span tags that browsers add (e.g. styled spans)
  let last;
  do {
    last = s;
    s = s.replace(/<span[^>]*>(.*?)<\/span>/gi, '$1');
  } while (s !== last);

  s = s.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  s = s.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*?>(.*?)<\/a>/gi, (_, href, label) => `[${label}](${sanitizeUrl(href)})`);
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function markModified() {
  isDirty = true;
  updateStatusDisplay();
}

canvas.addEventListener('input', () => {
  markModified();
  if (document.body.classList.contains('state-split')) synchronizeCanvasToSource();
  queueHistorySnapshotWithDebounce();
});

canvas.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    
    let block = findBlockForInsertion(sel.getRangeAt(0).startContainer);
    if (!block) return;
    
    const isSpecialBlock = ['H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(block.tagName);
    if (isSpecialBlock) {
      const text = block.textContent.trim();
      if (text === '') {
        e.preventDefault();
        
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        block.replaceWith(p);
        
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(true);
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        markModified();
        synchronizeCanvasToSource();
        captureHistorySnapshot();
      }
    }
  }
});

sourceEditor.addEventListener('input', () => {
  markModified();
  if (document.body.classList.contains('state-split')) queueSplitSourceToCanvas();
  queueHistorySnapshotWithDebounce();
});

canvas.addEventListener('change', (e) => {
  if (e.target.type === 'checkbox') {
    markModified();
    synchronizeCanvasToSource();
    captureHistorySnapshot();
  }
});

function getActiveTableContext() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  return node.closest('table');
}

function showTableHint() {
  alert('Coloca el cursor dentro de una celda de la tabla, luego usa «Fila ↓» o «Col →».');
}

document.getElementById('btn-undo').addEventListener('click', executeUndo);
document.getElementById('btn-redo').addEventListener('click', executeRedo);

document.getElementById('btn-bold').addEventListener('click', () => {
  withCanvasSelection(() => {
    document.execCommand('bold', false, null);
    markModified();
    captureHistorySnapshot();
  });
});
document.getElementById('btn-italic').addEventListener('click', () => {
  withCanvasSelection(() => {
    document.execCommand('italic', false, null);
    markModified();
    captureHistorySnapshot();
  });
});
document.getElementById('btn-strike').addEventListener('click', () => toggleStrike());
document.getElementById('btn-mark').addEventListener('click', () => toggleHighlight());
document.getElementById('btn-clear').addEventListener('click', (e) => {
  e.preventDefault();
  clearInlineFormatting();
});

document.getElementById('btn-h1').addEventListener('click', () => {
  withCanvasSelection(() => {
    const block = getSelectionBlock();
    if (block && block.tagName === 'H1') {
      document.execCommand('formatBlock', false, '<p>');
    } else {
      document.execCommand('formatBlock', false, '<h1>');
    }
    markModified();
    captureHistorySnapshot();
  });
});
document.getElementById('btn-h2').addEventListener('click', () => {
  withCanvasSelection(() => {
    const block = getSelectionBlock();
    if (block && block.tagName === 'H2') {
      document.execCommand('formatBlock', false, '<p>');
    } else {
      document.execCommand('formatBlock', false, '<h2>');
    }
    markModified();
    captureHistorySnapshot();
  });
});

document.getElementById('btn-link').addEventListener('click', () => {
  withCanvasSelection(() => {
    const existing = getActiveLinkAnchor();
    if (existing) {
      editLinkElement(existing);
      return;
    }
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const url = prompt('URL del enlace (https://…):');
    if (!url) return;
    const safe = sanitizeUrl(url);
    if (safe === '#') {
      alert('URL no permitida. Usa http(s), mailto o rutas relativas.');
      return;
    }
    const range = sel.getRangeAt(0);
    const a = document.createElement('a');
    a.href = resolveLinkHref(safe);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Ctrl+clic: abrir · Doble clic: editar';
    a.textContent = sel.toString() || safe;
    if (sel.isCollapsed) range.insertNode(a);
    else {
      range.deleteContents();
      range.insertNode(a);
    }
    markModified();
    captureHistorySnapshot();
  });
});

document.getElementById('btn-task').addEventListener('click', () => {
  const li = document.createElement('li');
  li.className = 'task-node';
  li.innerHTML = '<input type="checkbox"><span>Nueva tarea</span>';
  insertBlockAtCaret(li);
});

document.getElementById('btn-table').addEventListener('click', () => {
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Columna A</th><th>Columna B</th></tr></thead><tbody><tr><td>Celda 1</td><td>Celda 2</td></tr></tbody>';
  insertBlockAtCaret(table);
});

document.getElementById('btn-add-row').addEventListener('click', () => {
  const table = getActiveTableContext();
  if (!table) { showTableHint(); return; }
  const tbody = table.querySelector('tbody') || table;
  const refRow = table.querySelector('tr');
  const colCount = refRow ? refRow.querySelectorAll('th, td').length : 2;
  const newRow = document.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const td = document.createElement('td');
    td.textContent = 'Nueva celda';
    newRow.appendChild(td);
  }
  tbody.appendChild(newRow);
  markModified();
  synchronizeCanvasToSource();
  captureHistorySnapshot();
});

document.getElementById('btn-add-col').addEventListener('click', () => {
  const table = getActiveTableContext();
  if (!table) { showTableHint(); return; }
  const theadRow = table.querySelector('thead tr');
  if (theadRow) {
    const th = document.createElement('th');
    th.textContent = 'Nueva columna';
    theadRow.appendChild(th);
  }
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const td = document.createElement('td');
    td.textContent = 'Nueva celda';
    row.appendChild(td);
  });
  if (!theadRow && rows.length === 0) {
    table.querySelectorAll('tr').forEach(row => {
      const td = document.createElement('td');
      td.textContent = 'Nueva celda';
      row.appendChild(td);
    });
  }
  markModified();
  synchronizeCanvasToSource();
  captureHistorySnapshot();
});

function resetDocument(content, name) {
  sourceEditor.value = content;
  fileDisplayName = name || 'articulo-nuevo.md';
  fileSystemHandle = null;
  currentFileSha = null; // Clear cloud signature
  isDirty = false;
  
  const parsed = parseYAMLFrontmatter(content);
  frontmatterData = parsed.metadata;
  syncFrontmatterFieldsToInputs();
  
  updateStatusDisplay();
  synchronizeSourceToCanvas();
  localStorage.removeItem('moed_md_editor_buffer');
  historyStates = [sourceEditor.value];
  historyIndex = 0;
  updateHistoryButtons();
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (isDirty && !confirm('¿Descartar cambios actuales?')) return;
  
  // Default new frontmatter
  frontmatterData = {
    title: 'Título del Artículo',
    author: 'Comunidad Moed',
    date: '23 de Mayo, 2026',
    category: 'futuro',
    published: 'false',
    coverImage: '/images/portada-ia.jpg',
    teaser: 'Breve resumen introductorio para la grilla...'
  };
  
  const combined = generateYAMLFrontmatter() + shortTemplate;
  resetDocument(combined, 'articulo-nuevo.md');
});

async function openFile() {
  const token = localStorage.getItem('moed_github_token');
  const repo = localStorage.getItem('moed_github_repo');
  
  if (token && repo) {
    showCloudOpenModal(token, repo);
    return;
  }
  
  triggerLocalFilePicker();
}

async function triggerLocalFilePicker() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }],
        multiple: false
      });
      const file = await handle.getFile();
      pendingFileReference = file;
      currentFileSha = null; // Clear cloud signature
      if (isDirty) {
        window._pendingFsHandle = handle;
        safetyHud.classList.add('visible');
      } else {
        commitFile(handle);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.warn(err);
    }
    return;
  }
  fallbackInput.click();
}

document.getElementById('btn-open').addEventListener('click', openFile);
fallbackInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImport(file);
  fallbackInput.value = '';
});

function flashSaveButtonSuccess() {
  const btn = document.getElementById('btn-save');
  if (!btn) return;
  const label = btn.querySelector('.btn-label');
  const originalText = label ? label.textContent : 'Guardar';
  
  if (label) label.textContent = 'Guardado';
  const originalBorder = btn.style.borderColor;
  const originalShadow = btn.style.boxShadow;
  const originalColor = btn.style.color;
  
  btn.style.borderColor = '#10B981';
  btn.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.35)';
  btn.style.color = '#10B981';
  
  setTimeout(() => {
    if (label) label.textContent = originalText;
    btn.style.borderColor = originalBorder;
    btn.style.boxShadow = originalShadow;
    btn.style.color = originalColor;
  }, 1500);
}

async function saveFile() {
  ensureSourceSyncedFromCanvas();

  // Check if we are running in local dev server and want direct local saving without dialogs
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    let suggestedName = fileDisplayName;
    if (fileDisplayName === 'articulo-nuevo.md' || !fileDisplayName) {
      const slug = slugify(frontmatterData.title || 'Título del Artículo');
      suggestedName = `${slug}.md`;
    }
    
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: suggestedName,
          content: sourceEditor.value
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        fileDisplayName = suggestedName;
        isDirty = false;
        updateStatusDisplay();
        flashSaveButtonSuccess();
        console.log('Guardado directamente en el servidor local:', data.message);
        return;
      }
    } catch (err) {
      console.warn('Error saving to dev server API, falling back to browser dialog:', err);
    }
  }

  if (window.showSaveFilePicker) {
    try {
      if (!isWritableHandle(fileSystemHandle)) {
        let suggestedName = fileDisplayName;
        if (fileDisplayName === 'articulo-nuevo.md' || !fileDisplayName) {
          const slug = slugify(frontmatterData.title || 'Título del Artículo');
          suggestedName = `${slug}.md`;
        }
        fileSystemHandle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
        });
        fileDisplayName = fileSystemHandle.name;
      }
      const writable = await fileSystemHandle.createWritable();
      await writable.write(sourceEditor.value);
      await writable.close();
      isDirty = false;
      updateStatusDisplay();
      flashSaveButtonSuccess();
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Guardado cancelado o fallido:', err);
    }
  } else {
    const blob = new Blob([sourceEditor.value], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    let downloadName = fileDisplayName;
    if (fileDisplayName === 'articulo-nuevo.md' || !fileDisplayName) {
      const slug = slugify(frontmatterData.title || 'Título del Artículo');
      downloadName = `${slug}.md`;
    }
    
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
    isDirty = false;
    updateStatusDisplay();
    flashSaveButtonSuccess();
  }
}

document.getElementById('btn-save').addEventListener('click', saveFile);

function updateStatusDisplay() {
  fileMeta.textContent = isDirty ? `${fileDisplayName} *` : fileDisplayName;
  fileMeta.title = fileMeta.textContent;
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer.types.includes('Files')) {
    dragDepth++;
    document.body.classList.add('drag-active');
  }
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.body.classList.remove('drag-active');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('drag-active');
  const files = e.dataTransfer.files;
  if (files.length > 0) handleImport(files[0]);
});

function handleImport(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['md', 'markdown', 'txt'].includes(ext)) {
    document.body.classList.add('drag-invalid');
    setTimeout(() => document.body.classList.remove('drag-invalid'), 500);
    return;
  }
  pendingFileReference = file;
  window._pendingFsHandle = null;
  if (isDirty) safetyHud.classList.add('visible');
  else commitFile(null);
}

function commitFile(fsHandle) {
  const handle = fsHandle || window._pendingFsHandle || null;
  const reader = new FileReader();
  reader.onload = (e) => {
    sourceEditor.value = e.target.result;
    fileDisplayName = pendingFileReference.name;
    fileSystemHandle = isWritableHandle(handle) ? handle : null;
    currentFileSha = null; // Clear cloud signature for local edits
    isDirty = false;
    
    // Parse frontmatter
    const parsed = parseYAMLFrontmatter(e.target.result);
    frontmatterData = parsed.metadata;
    syncFrontmatterFieldsToInputs();
    
    updateStatusDisplay();
    synchronizeSourceToCanvas();
    safetyHud.classList.remove('visible');
    pendingFileReference = null;
    window._pendingFsHandle = null;
    historyStates = [sourceEditor.value];
    historyIndex = 0;
    updateHistoryButtons();
  };
  reader.readAsText(pendingFileReference);
}

document.getElementById('btn-discard').addEventListener('click', () => {
  commitFile(window._pendingFsHandle || null);
});
document.getElementById('btn-cancel-drop').addEventListener('click', () => {
  safetyHud.classList.remove('visible');
  pendingFileReference = null;
  window._pendingFsHandle = null;
});

window.addEventListener('keydown', async (e) => {
  const isMeta = e.ctrlKey || e.metaKey;
  if (isMeta && e.key.toLowerCase() === 's') {
    e.preventDefault();
    await saveFile();
  }
  if (isMeta && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (!isDirty || confirm('¿Descartar cambios actuales?')) {
      // Default new frontmatter
      frontmatterData = {
        title: 'Título del Artículo',
        author: 'Comunidad Moed',
        date: '23 de Mayo, 2026',
        category: 'futuro',
        coverImage: '/images/portada-ia.jpg',
        teaser: 'Breve resumen introductorio para la grilla...'
      };
      const combined = generateYAMLFrontmatter() + shortTemplate;
      resetDocument(combined, 'articulo-nuevo.md');
    }
  }
  if (isMeta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    executeUndo();
  }
  if (isMeta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault();
    executeRedo();
  }
});

setInterval(() => {
  if (!isDirty) return;
  ensureSourceSyncedFromCanvas();
  persistAutosaveBuffer();
}, 500);

// =========================================================================
// AI Copilot Integration
// =========================================================================

function openAiModal() {
  document.getElementById('ai-modal').classList.add('active');
}

function closeAiModal() {
  document.getElementById('ai-modal').classList.remove('active');
}

// Tab switching logic
document.querySelectorAll('.ai-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ai-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const tabName = btn.getAttribute('data-tab');
    document.querySelectorAll('.ai-tab-content').forEach(content => {
      content.classList.add('hidden');
    });
    document.getElementById(`ai-tab-${tabName}`).classList.remove('hidden');
  });
});

// Helper to generate the prompt text
function generatePromptText() {
  const topic = document.getElementById('ai-prompt-topic').value.trim() || 'Un tema teológico y tecnológico de relevancia moderna';
  const category = document.getElementById('ai-prompt-category').value;
  const tone = document.getElementById('ai-prompt-tone').value;
  const author = document.getElementById('ai-prompt-author').value.trim() || 'Comunidad Moed';
  const keys = document.getElementById('ai-prompt-keys').value.trim();
  
  const categoryLabel = category === 'pasado' ? 'El Pasado (Raíces, Profecía y Revelación del Antiguo Testamento)' :
                        category === 'presente' ? 'El Presente (Respuestas Prácticas, Emocionales y Espirituales Cotidianas)' :
                        'El Futuro (Tecnología, Inteligencia Artificial, Bioética y Profecía Escatológica)';
                        
  const toneLabel = tone === 'profetico' ? 'Profético, reflexivo, teológicamente profundo y analítico' :
                    tone === 'cercano' ? 'Práctico, pastoral, cercano, reconfortante y aplicable al día a día' :
                    'Histórico, erudito, revelador y basado en raíces hebreas y bíblicas';

  let prompt = `Eres un redactor experto, teólogo y analista cultural para **Moed**, un portal y comunidad dedicada a explorar el hilo eterno que une las raíces de la fe judeocristiana con los retos tecnológicos y existenciales de nuestra era.

Tu tarea es escribir un artículo de blog premium y profundo sobre el siguiente tema:
**TEMA: ${topic}**

**DIMENSIÓN (CATEGORÍA):** ${categoryLabel}
**AUTOR:** ${author}
**FECHA DE CREACIÓN:** ${getTodayISODate()}
**TONO DE REDACCIÓN:** ${toneLabel}
`;

  if (keys) {
    prompt += `\n**PUNTOS CLAVE O ARGUMENTOS QUE DEBES INCLUIR ABSOLUTAMENTE:**
${keys}
`;
  }

  prompt += `\n**REQUISITOS ESTRUCTURALES Y DE FORMATO (OBLIGATORIOS):**
1. Debes formatear la salida como un archivo Markdown (.md) completo e incluir una cabecera de metadatos **YAML Frontmatter** exacta al inicio del documento. El formato debe ser estrictamente este:
---
title: "[Escribe un título sumamente atractivo y misterioso]"
author: "${author}"
date: "${getTodayISODate()}"
category: "${category}"
coverImage: "/images/portada-[palabra-clave-en-ingles-miniscula].jpg"
teaser: "[Escribe un resumen gancho de una sola oración para la grilla de la web, máx 150 caracteres]"
---

2. El cuerpo del artículo debe comenzar inmediatamente después de los metadatos YAML con un encabezado principal de primer nivel (\`# Título del Artículo\`) que sea idéntico al título en los metadatos.
3. Utiliza una excelente jerarquía de encabezados Markdown: encabezados secundarios (\`## Subtítulo\`) para secciones clave y encabezados terciarios (\`### Sub-sección\`) si es necesario.
4. Incluye al menos una cita o frase destacada utilizando el formato de bloque de cita de Markdown (\`> "Cita destacada en cursiva"\`).
5. Utiliza formato enriquecido: negritas (\`**texto**\`) para dar énfasis, listas con viñetas (\`- ítem\`) para organizar conceptos y marcas destacadas (\`==texto==\`) para pasajes clave.
6. El texto debe ser fluido, redactado con una prosa elegante, poética y rigurosa. Evita clichés corporativos, introducciones vacías o conclusiones genéricas. Debe terminar con un párrafo de cierre potente y reflexivo, no una sección titulada "Conclusión".

Genera únicamente el código Markdown del artículo completo, sin añadir comentarios, explicaciones, ni etiquetas contenedoras adicionales al principio o al final (como \`\`\`markdown).`;

  return prompt;
}

// Helper to import Markdown directly into editor
function importMarkdownIntoEditor(rawText) {
  const parsed = parseYAMLFrontmatter(rawText);
  
  // Auto calculate readTime based on parsed markdown body text
  parsed.metadata.readTime = calculateReadTime(parsed.content);
  
  frontmatterData = parsed.metadata;
  syncFrontmatterFieldsToInputs();
  
  sourceEditor.value = rawText;
  synchronizeSourceToCanvas();
  
  isDirty = true;
  updateStatusDisplay();
  
  localStorage.setItem('moed_md_editor_buffer', rawText);
  
  historyStates.push(rawText);
  historyIndex = historyStates.length - 1;
  updateHistoryButtons();
}

// Wire up events
document.getElementById('btn-ai').addEventListener('click', openAiModal);
document.getElementById('close-ai-btn').addEventListener('click', closeAiModal);

document.getElementById('ai-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('ai-modal')) closeAiModal();
});

// Generate & Copy Prompt
document.getElementById('btn-ai-copy-prompt').addEventListener('click', async () => {
  const promptText = generatePromptText();
  try {
    await navigator.clipboard.writeText(promptText);
    
    // Visual button success state
    const btn = document.getElementById('btn-ai-copy-prompt');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✔ ¡Prompt Copiado al Portapapeles!';
    btn.style.background = '#10B981';
    
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '';
    }, 2000);
  } catch (err) {
    alert('Error al copiar el prompt: ' + err.message);
  }
});

// Import pasted MD
document.getElementById('btn-ai-import').addEventListener('click', () => {
  const text = document.getElementById('ai-import-content').value.trim();
  if (!text) {
    alert('Por favor, pega el contenido Markdown generado por tu IA antes de importar.');
    return;
  }
  
  try {
    importMarkdownIntoEditor(text);
    document.getElementById('ai-import-content').value = '';
    closeAiModal();
    flashSaveButtonSuccess();
  } catch (err) {
    alert('Error al importar el archivo: Asegúrate de que tiene el formato Markdown con la cabecera YAML.');
  }
});

// Direct generation (API Call)
document.getElementById('btn-ai-generate').addEventListener('click', async () => {
  const apiKey = document.getElementById('ai-api-key').value.trim();
  if (!apiKey) {
    alert('Por favor, introduce tu Gemini API Key para utilizar la redacción directa.');
    return;
  }
  
  // Save key
  localStorage.setItem('moed_gemini_api_key', apiKey);
  
  const promptText = generatePromptText();
  const btn = document.getElementById('btn-ai-generate');
  const loader = document.getElementById('ai-loading-container');
  const loadingText = document.getElementById('ai-loading-text');
  
  // Show loading
  btn.style.display = 'none';
  loader.classList.remove('hidden');
  
  const loadingPhases = [
    "Iniciando conexión con Google Gemini...",
    "Transmitiendo parámetros de redacción (Idea, Tono, Dimensión)...",
    "El espíritu tecnológico está redactando el artículo...",
    "Estructurando YAML Frontmatter and citas destacadas...",
    "Importando resultado directamente al lienzo..."
  ];
  
  let phaseIdx = 0;
  loadingText.textContent = loadingPhases[0];
  const phaseInterval = setInterval(() => {
    phaseIdx = (phaseIdx + 1) % loadingPhases.length;
    loadingText.textContent = loadingPhases[phaseIdx];
  }, 4000);
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: promptText
          }]
        }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Error en la API de Gemini');
    }
    
    const data = await response.json();
    let markdown = data.candidates[0].content.parts[0].text;
    
    // Strip markdown fence markers if the model included them (e.g. ```markdown ... ```)
    markdown = markdown.replace(/^```markdown\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    
    importMarkdownIntoEditor(markdown);
    
    // Success
    closeAiModal();
    flashSaveButtonSuccess();
    setTimeout(() => alert('¡Artículo generado y cargado con éxito en el editor!'), 100);
  } catch (err) {
    alert('Error al generar el artículo: ' + err.message);
  } finally {
    clearInterval(phaseInterval);
    loader.classList.add('hidden');
    btn.style.display = '';
  }
});

// 🌗 THEME SYSTEM: Light/Dark Mode Manager
function setupThemeSystem() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  
  if (!themeToggleBtn || !sunIcon || !moonIcon) return;
  
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
  
  const savedTheme = localStorage.getItem('moed_theme') || 'dark';
  applyTheme(savedTheme);
  
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = localStorage.getItem('moed_theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
  
  window.addEventListener('storage', (e) => {
    if (e.key === 'moed_theme') {
      applyTheme(e.newValue);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupThemeSystem();
  const cached = localStorage.getItem('moed_md_editor_buffer');
  const defaultText = cached || (generateYAMLFrontmatter() + shortTemplate);
  sourceEditor.value = defaultText;
  
  const parsed = parseYAMLFrontmatter(defaultText);
  frontmatterData = parsed.metadata;
  syncFrontmatterFieldsToInputs();
  
  // Load saved API Key if exists
  const savedKey = localStorage.getItem('moed_gemini_api_key');
  if (savedKey) {
    document.getElementById('ai-api-key').value = savedKey;
  }
  
  if (cached) isDirty = true;
  synchronizeSourceToCanvas();
  updateStatusDisplay();
  historyStates = [sourceEditor.value];
  historyIndex = 0;
  updateHistoryButtons();

  // Load preferred layout mode if saved
  const savedMode = localStorage.getItem('moed_preferred_mode') || 'state-design';
  const activeTab = document.querySelector(`.mode-tab[data-mode="${savedMode}"]`);
  if (activeTab) {
    activeTab.click();
  } else {
    // Fallback to design state if no selector clicked
    document.body.classList.remove('state-design', 'state-split', 'state-source');
    document.body.classList.add('state-design');
  }
});

// Mode Switching Engine
const modeTabs = document.querySelectorAll('.mode-tab');

modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modeTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-checked', 'false');
      t.setAttribute('tabindex', '-1');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-checked', 'true');
    tab.setAttribute('tabindex', '0');

    const mode = tab.getAttribute('data-mode');
    
    // Sync contents prior to layout transition
    ensureSourceSyncedFromCanvas();

    // Clean up inline layout parameters
    designWrapper.style.width = '';
    sourceEditor.style.display = '';

    // Set state on body tag
    document.body.classList.remove('state-design', 'state-split', 'state-source');
    document.body.classList.add(mode);

    // Run appropriate sync engine based on active state
    if (mode === 'state-design') {
      synchronizeSourceToCanvas();
    } else if (mode === 'state-source') {
      synchronizeCanvasToSource();
    } else if (mode === 'state-split') {
      synchronizeSourceToCanvas();
    }

    localStorage.setItem('moed_preferred_mode', mode);
  });
});

// Real-Time Word & Character Counter Engine
const wordCountTarget = document.getElementById('status-word-count');
const charCountTarget = document.getElementById('status-char-count');

function updateTextStatistics() {
  const rawText = canvas.textContent || '';
  const charCount = rawText.length;
  const words = rawText.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  wordCountTarget.textContent = wordCount;
  charCountTarget.textContent = charCount;
}

// Event bindings for real-time recalculations
canvas.addEventListener('input', updateTextStatistics);
sourceEditor.addEventListener('input', () => {
  const parsed = parseYAMLFrontmatter(sourceEditor.value || '');
  // Clean symbols for realistic plaintext statistics
  const cleanText = parsed.content.replace(/[#*`~=_|\[\]\(\)\-\>\r\n]/g, ' ');
  const words = cleanText.trim().split(/\s+/).filter(w => w.length > 0);
  wordCountTarget.textContent = words.length;
  charCountTarget.textContent = cleanText.length;
});

// Initial run
updateTextStatistics();

// =========================================================================
// Cloud CMS (GitHub API) & Export Services
// =========================================================================

async function showCloudOpenModal(token, repo) {
  const modal = document.getElementById('cloud-open-modal');
  const listContainer = document.getElementById('cloud-files-list');
  modal.style.display = 'flex';
  listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px 0;">Cargando lista de artículos...</div>';
  
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/src/articles`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      throw new Error('No se pudo conectar a GitHub. Verifica el repositorio o el Token.');
    }
    
    const files = await response.json();
    const mdFiles = files.filter(f => f.name.endsWith('.md'));
    
    if (mdFiles.length === 0) {
      listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px 0;">No se encontraron artículos .md en src/articles/</div>';
      return;
    }
    
    listContainer.innerHTML = '';
    mdFiles.forEach(file => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.style.width = '100%';
      btn.style.justifyContent = 'flex-start';
      btn.style.textAlign = 'left';
      btn.style.padding = '10px 12px';
      btn.style.fontSize = '12px';
      btn.style.fontFamily = 'var(--font-sans)';
      btn.style.background = 'rgba(255,255,255,0.02)';
      btn.style.borderColor = 'rgba(255,255,255,0.05)';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-future)" stroke-width="2.5" style="width: 14px; height: 14px; margin-right: 8px; flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
      `;
      
      btn.addEventListener('click', async () => {
        listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px 0;">Cargando contenido...</div>';
        try {
          const fileResponse = await fetch(file.download_url);
          if (fileResponse.ok) {
            const content = await fileResponse.text();
            
            fileDisplayName = file.name;
            currentFileSha = file.sha;
            fileSystemHandle = null;
            isDirty = false;
            
            sourceEditor.value = content;
            const parsed = parseYAMLFrontmatter(content);
            frontmatterData = parsed.metadata;
            syncFrontmatterFieldsToInputs();
            
            updateStatusDisplay();
            synchronizeSourceToCanvas();
            localStorage.removeItem('moed_md_editor_buffer');
            
            historyStates = [sourceEditor.value];
            historyIndex = 0;
            updateHistoryButtons();
            
            modal.style.display = 'none';
          } else {
            alert('Error al descargar el contenido del archivo.');
          }
        } catch (err) {
          alert('Error al abrir el archivo: ' + err.message);
        }
      });
      listContainer.appendChild(btn);
    });
  } catch (err) {
    listContainer.innerHTML = `<div style="color: #EF4444; font-size: 12px; text-align: center; padding: 20px 0;">Error: ${err.message}</div>`;
  }
}

async function publishToGitHub() {
  const token = localStorage.getItem('moed_github_token');
  const repo = localStorage.getItem('moed_github_repo');
  
  if (!token || !repo) {
    alert('Por favor, conecta primero tu cuenta de GitHub en la pestaña "Conectar GitHub" del Asistente IA.');
    openAiModal();
    const githubTab = document.querySelector('.ai-tab-btn[data-tab="github"]');
    if (githubTab) githubTab.click();
    return;
  }
  
  ensureSourceSyncedFromCanvas();
  const content = sourceEditor.value;
  
  let filename = fileDisplayName;
  if (filename === 'articulo-nuevo.md' || !filename) {
    const slug = slugify(frontmatterData.title || 'Título del Artículo');
    filename = `${slug}.md`;
  }
  
  const btn = document.getElementById('btn-publish');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg viewBox="0 0 24 24" class="animate-spin" style="animation: spin 1s linear infinite; stroke: currentColor; width:16px; height:16px;"><circle cx="12" cy="12" r="10" stroke-width="3" style="opacity:0.25;"/><path fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style="stroke:none;"/></svg><span class="btn-label" style="margin-left:6px;">Publicando...</span>`;
  
  try {
    if (!currentFileSha) {
      try {
        const checkResponse = await fetch(`https://api.github.com/repos/${repo}/contents/src/articles/${filename}`, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          currentFileSha = checkData.sha;
        }
      } catch (e) {
        console.log('El archivo parece ser nuevo en GitHub.');
      }
    }
    
    // Base64 encode handling unicode characters safely
    const utf8Bytes = new TextEncoder().encode(content);
    let binary = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const base64Content = btoa(binary);
    const commitMessage = `✍️ Publicado: "${frontmatterData.title}" vía Moed Editor`;
    
    const payload = {
      message: commitMessage,
      content: base64Content
    };
    if (currentFileSha) {
      payload.sha = currentFileSha;
    }
    
    const response = await fetch(`https://api.github.com/repos/${repo}/contents/src/articles/${filename}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const resData = await response.json();
      currentFileSha = resData.content.sha;
      fileDisplayName = filename;
      fileSystemHandle = null;
      isDirty = false;
      updateStatusDisplay();
      
      btn.style.borderColor = '#10B981';
      btn.style.background = 'rgba(16, 185, 129, 0.1)';
      btn.style.color = '#FFF';
      btn.innerHTML = `<span class="btn-label">✔ ¡En Vivo! (20s)</span>`;
      
      setTimeout(() => {
        btn.disabled = false;
        btn.style.borderColor = '';
        btn.style.background = '';
        btn.style.color = '';
        btn.innerHTML = originalHTML;
      }, 3000);
    } else {
      const errData = await response.json();
      throw new Error(errData.message || 'Error al comunicarse con GitHub');
    }
  } catch (err) {
    alert('Error al publicar: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function exportLocalFile() {
  ensureSourceSyncedFromCanvas();
  const content = sourceEditor.value;
  
  let filename = fileDisplayName;
  if (filename === 'articulo-nuevo.md' || !filename) {
    const slug = slugify(frontmatterData.title || 'Título del Artículo');
    filename = `${slug}.md`;
  }
  
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
  
  const btn = document.getElementById('btn-export');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<span class="btn-label">✔ Descargado</span>`;
  btn.style.borderColor = '#38bdf8';
  btn.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.35)';
  
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.borderColor = '';
    btn.style.boxShadow = '';
  }, 1500);
}

// Bind cloud modal close actions
document.getElementById('btn-close-cloud-open').addEventListener('click', () => {
  document.getElementById('cloud-open-modal').style.display = 'none';
});
document.getElementById('btn-open-local-fallback').addEventListener('click', () => {
  document.getElementById('cloud-open-modal').style.display = 'none';
  triggerLocalFilePicker();
});

// Bind Export and Publish buttons
document.getElementById('btn-export').addEventListener('click', exportLocalFile);
document.getElementById('btn-publish').addEventListener('click', publishToGitHub);

// Save GitHub integration details
document.getElementById('btn-save-github').addEventListener('click', () => {
  const token = document.getElementById('ai-github-token').value.trim();
  const repo = document.getElementById('ai-github-repo').value.trim();
  
  if (!token || !repo) {
    alert('Por favor, completa ambos campos para establecer la conexión.');
    return;
  }
  
  localStorage.setItem('moed_github_token', token);
  localStorage.setItem('moed_github_repo', repo);
  
  const btn = document.getElementById('btn-save-github');
  btn.textContent = '✔ ¡Conexión Guardada!';
  btn.style.background = '#10B981';
  
  setTimeout(() => {
    btn.innerHTML = '✔ Guardar Conexión de GitHub';
    btn.style.background = '';
    closeAiModal();
  }, 1500);
});

// Populate GitHub keys on document load
const savedToken = localStorage.getItem('moed_github_token');
const savedRepo = localStorage.getItem('moed_github_repo');
if (savedToken) document.getElementById('ai-github-token').value = savedToken;
if (savedRepo) document.getElementById('ai-github-repo').value = savedRepo;

import './style.css'

// Wait for DOM to load completely
document.addEventListener('DOMContentLoaded', () => {
  setupAliasCopy();
});

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

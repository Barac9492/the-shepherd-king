// Page-owned disclosure shared by both free-exploration modes. Route updates
// change the content, never the player's choice to keep the panel collapsed.
export function createGuidancePanel({ panel, button, content, getLanguage, clearInput, focusGame }) {
  let collapsed = false;
  const render = () => {
    const label = getLanguage() === 'en'
      ? (collapsed ? 'Show guide' : 'Hide guide')
      : (collapsed ? '길 안내 펼치기' : '길 안내 접기');
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(!collapsed));
    content.hidden = collapsed;
    panel.classList.toggle('guidance-collapsed', collapsed);
  };
  button.addEventListener('pointerdown', event => { event.stopPropagation(); clearInput(); });
  button.addEventListener('click', event => {
    event.stopPropagation(); clearInput(); collapsed = !collapsed; render();
    // A tap/click returns to walking. Keyboard activation retains button focus
    // for another toggle; its Enter/Space never reaches the game's action key.
    if (event.detail > 0) focusGame();
  });
  button.addEventListener('keydown', event => { if (event.code !== 'Escape') event.stopPropagation(); });
  render();
  return { translate: render, reset() { collapsed = false; render(); } };
}

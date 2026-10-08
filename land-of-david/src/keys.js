// Name keys by physical position so WASD/E/N work with any keyboard layout or IME
// (e.g. the Korean 2-set layout reports W as 'ㅈ'). Arrows, Space, Enter, Shift keep their names.
export function keyName(e) {
  const code = e.code || '';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code === 'Space') return ' ';
  if (code === 'Enter' || code === 'NumpadEnter') return 'enter';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
  if (code.startsWith('Arrow')) return code.toLowerCase();
  return (e.key || '').toLowerCase();
}

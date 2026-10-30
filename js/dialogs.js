// Shared keyboard behavior for the existing panels, including dynamically loaded routes.
// The panel owners still control opening, closing, cancellation and starting a drive.
export function initDialogs() {
  let current = null, returnTo = null, trigger = null;
  const visible = el => el?.isConnected && el.getClientRects().length && !el.closest('[hidden],[inert]');
  const focusable = panel => [...panel.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')]
    .filter(el => !el.disabled && el.tabIndex >= 0 && visible(el));

  document.addEventListener('click', e => {
    const button = e.target.closest('button,a');
    if (button && !button.closest('.sheet')) trigger = button;
  }, true);

  function sync() {
    const sheets = [...document.querySelectorAll('.sheet')];
    const next = sheets.filter(s => !s.hidden).at(-1) || null;
    for (const sheet of sheets) {
      const dialog = sheet.querySelector('[role=dialog]');
      if (dialog) { dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1; }
    }
    for (const button of document.querySelectorAll('.lobby-nav [data-open],#myRoutesBtn')) {
      const id = button.dataset.open || 'personalRoutesSheet';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', id);
      button.setAttribute('aria-expanded', String(next?.id === id));
    }
    if (next === current) return;
    if (next && !current) returnTo = visible(trigger) ? trigger : document.activeElement;
    current = next;
    // Only the app's own surfaces are inert. Clerk's sign-in dialog can still open above a panel.
    for (const id of ['lobby', 'hud']) document.getElementById(id).inert = !!next;
    if (next) {
      if (!next.contains(document.activeElement)) {
        const first = next.querySelector('.x') || focusable(next)[0] || next.querySelector('[role=dialog]');
        first?.focus({ preventScroll: true });
      }
    } else {
      if (visible(returnTo)) returnTo.focus({ preventScroll: true });
      returnTo = null;
    }
  }
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || !current || !current.contains(document.activeElement)) return;
    const radio = e.target.closest('[role=radio]'), group = radio?.closest('[role=radiogroup]');
    if (group && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
      const choices = [...group.querySelectorAll('[role=radio]')].filter(el => !el.disabled && visible(el));
      const i = choices.indexOf(radio), direction = ['ArrowLeft','ArrowUp'].includes(e.key) ? -1 : 1;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? choices.length-1 : (i+direction+choices.length)%choices.length;
      e.preventDefault(); choices[next]?.focus(); choices[next]?.click(); return;
    }
    if (e.key !== 'Tab') return;
    const items = focusable(current), first = items[0], last = items.at(-1);
    if (!items.length) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
  const observer = new MutationObserver(records => {
    if (records.some(r => r.type === 'attributes' ? r.target.matches('.sheet') :
      [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && (n.matches('.sheet') || n.querySelector('.sheet'))))) sync();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  sync();
}

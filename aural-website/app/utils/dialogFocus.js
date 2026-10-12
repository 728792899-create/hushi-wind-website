// Activate only for a rendered, teleported dialog; restore the exact prior inert state.
export function activateDialog(dialog, close, doc = document) {
  const previous = doc.activeElement;
  const changed = [];
  let branch = dialog;
  while (branch && branch !== doc.body) {
    for (const sibling of branch.parentElement?.children || []) {
      if (sibling === branch || ['SCRIPT', 'STYLE'].includes(sibling.tagName)) continue;
      changed.push([sibling, sibling.inert]);
      sibling.inert = true;
    }
    branch = branch.parentElement;
  }
  const focusable = () => [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length);
  const focusFirst = () => (focusable()[0] || dialog).focus({ preventScroll: true });
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const items = focusable(), first = items[0], last = items.at(-1);
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (doc.activeElement === first || !items.includes(doc.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (doc.activeElement === last || !items.includes(doc.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };
  const focusin = event => { if (!dialog.contains(event.target)) focusFirst(); };
  doc.addEventListener('keydown', keydown, true);
  doc.addEventListener('focusin', focusin, true);
  const initial = dialog.querySelector?.('[data-dialog-initial-focus="true"]');
  if (initial) initial.focus({ preventScroll: true }); else focusFirst();
  return () => {
    doc.removeEventListener('keydown', keydown, true);
    doc.removeEventListener('focusin', focusin, true);
    for (const [element, inert] of changed) element.inert = inert;
    if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
  };
}

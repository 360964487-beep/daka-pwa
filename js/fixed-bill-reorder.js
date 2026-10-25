// Fixed bill ordering: explicit up/down controls, persisted to the matching local list.
(() => {
  const container = document.getElementById('billFixedRows');
  if (!container) return;
  const status = document.getElementById('billFixedSortStatus');
  const keys = { expense:'checkin_fixed_v1', income:'checkin_fixed_in_v1' };
  const currentType = () => document.body.dataset.billType === 'income' ? 'income' : 'expense';
  const readItems = type => {
    try { return JSON.parse(localStorage.getItem(keys[type || currentType()]) || '[]') || []; }
    catch (_) { return []; }
  };
  const writeItems = (items, type) => {
    try { localStorage.setItem(keys[type], JSON.stringify(items)); return true; }
    catch (_) { return false; }
  };
  const rows = () => [...container.querySelectorAll('.bill-fixed-entry')];
  const say = message => { if (status) status.textContent = message; };

  function refreshOrder(items = readItems()) {
    const list = rows();
    list.forEach((row, index) => {
      row.dataset.fixedId = items[index]?.id != null ? String(items[index].id) : `legacy-${index}`;
      const up = row.querySelector('[data-move="up"]');
      const down = row.querySelector('[data-move="down"]');
      if (!up || !down) return;
      const name = row.querySelector('.br-name')?.textContent?.trim() || '固定账单';
      up.disabled = index === 0;
      down.disabled = index === list.length - 1;
      up.setAttribute('aria-label', `上移${name}`);
      down.setAttribute('aria-label', `下移${name}`);
    });
  }

  function animateSwap(changedRows, oldRects) {
    changedRows.forEach(row => {
      const before = oldRects.get(row);
      if (!before || typeof row.animate !== 'function') return;
      const after = row.getBoundingClientRect();
      const dy = before.top - after.top;
      if (Math.abs(dy) > 1) row.animate(
        [{ transform:`translate3d(0,${dy}px,0)` }, { transform:'translate3d(0,0,0)' }],
        { duration:180, easing:'cubic-bezier(.2,.75,.25,1)' }
      );
    });
  }

  function moveRow(row, delta) {
    const type = currentType();
    const list = rows();
    const from = list.indexOf(row);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    const items = readItems(type);
    if (items.length !== list.length) {
      say('账单列表刚刚发生变化，请再点一次。');
      return;
    }
    const oldRects = new Map([list[from], list[to]].map(item => [item, item.getBoundingClientRect()]));
    [items[from], items[to]] = [items[to], items[from]];
    if (!writeItems(items, type)) {
      say('保存顺序失败，请检查设备存储空间。');
      return;
    }
    if (delta < 0) container.insertBefore(row, list[to]);
    else container.insertBefore(list[to], row);
    refreshOrder(items);
    animateSwap([row, list[to]], oldRects);
    const name = row.querySelector('.br-name')?.textContent?.trim() || '固定账单';
    say(`${name}已移至第 ${to + 1} 项`);
    row.querySelector(delta < 0 ? '[data-move="up"]' : '[data-move="down"]')?.focus({ preventScroll:true });
  }

  function makeButton(direction, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bill-reorder-btn';
    button.dataset.move = direction;
    button.title = label;
    button.innerHTML = direction === 'up'
      ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg>'
      : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>';
    button.addEventListener('click', event => {
      event.stopPropagation();
      moveRow(button.closest('.bill-fixed-entry'), direction === 'up' ? -1 : 1);
    });
    return button;
  }

  function enhanceRows() {
    const items = readItems();
    const list = [...container.querySelectorAll('.bill-row:not(.bill-total-row)')];
    list.forEach((row, index) => {
      row.classList.add('bill-fixed-entry');
      row.querySelector('.bill-reorder-handle')?.remove();
      if (row.querySelector('.bill-reorder-controls')) return;
      const controls = document.createElement('div');
      controls.className = 'bill-reorder-controls';
      controls.append(makeButton('up', '上移'), makeButton('down', '下移'));
      const deleteButton = row.querySelector('.br-del');
      row.insertBefore(controls, deleteButton || null);
      if (items[index]) row.dataset.fixedId = items[index].id != null ? String(items[index].id) : `legacy-${index}`;
    });
    refreshOrder(items);
  }

  new MutationObserver(enhanceRows).observe(container, { childList:true });
  enhanceRows();
})();
// Fixed bill drag sorting: pointer long-press, smooth FLIP reflow and keyboard arrows.
(() => {
  const container = document.getElementById('billFixedRows');
  if (!container) return;
  const status = document.getElementById('billFixedSortStatus');
  const keys = { expense:'checkin_fixed_v1', income:'checkin_fixed_in_v1' };
  let drag = null;
  let holdTimer = null;

  function currentType() { return document.body.dataset.billType === 'income' ? 'income' : 'expense'; }
  function readItems(type = currentType()) {
    try { return JSON.parse(localStorage.getItem(keys[type]) || '[]') || []; } catch (_) { return []; }
  }
  function writeItems(items, type = currentType()) {
    try { localStorage.setItem(keys[type], JSON.stringify(items)); } catch (_) {}
  }
  function say(message) { if (status) status.textContent = message; }
  function itemKey(item, index) { return item && item.id != null ? String(item.id) : `legacy-${index}`; }
  function enhanceRows() {
    const items = readItems();
    const rows = [...container.querySelectorAll('.bill-row:not(.bill-total-row)')];
    rows.forEach((row, index) => {
      row.classList.add('bill-fixed-entry');
      if (!row.dataset.fixedId && items[index]) row.dataset.fixedId = itemKey(items[index], index);
      if (row.querySelector('.bill-reorder-handle')) return;
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'bill-reorder-handle';
      handle.setAttribute('aria-label', `长按拖动${items[index]?.name || '固定账单'}排序；也可使用方向键调整顺序`);
      handle.title = '长按拖动排序';
      handle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1"/><circle cx="13" cy="5" r="1"/><circle cx="7" cy="10" r="1"/><circle cx="13" cy="10" r="1"/><circle cx="7" cy="15" r="1"/><circle cx="13" cy="15" r="1"/></svg>';
      const deleteButton = row.querySelector('.br-del');
      row.insertBefore(handle, deleteButton || null);
    });
  }
  function persistDomOrder(type) {
    const items = readItems(type);
    const byKey = new Map(items.map((item, index) => [itemKey(item, index), item]));
    const ordered = [...container.querySelectorAll('.bill-fixed-entry')]
      .map(row => byKey.get(row.dataset.fixedId)).filter(Boolean);
    const used = new Set(ordered.map((item, index) => {
      const originalIndex = items.findIndex(candidate => candidate === item);
      return itemKey(item, originalIndex >= 0 ? originalIndex : index);
    }));
    writeItems(ordered.concat(items.filter((item, index) => !used.has(itemKey(item, index)))), type);
  }
  function animateOthers(rows, oldRects) {
    rows.forEach(row => {
      const oldRect = oldRects.get(row);
      if (!oldRect || typeof row.animate !== 'function') return;
      const newRect = row.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) return;
      row.animate([{ transform:`translate3d(0,${dy}px,0)` }, { transform:'translate3d(0,0,0)' }], {
        duration:180, easing:'cubic-bezier(.2,.75,.25,1)'
      });
    });
  }
  function reorderAroundPointer(event) {
    const rows = [...container.querySelectorAll('.bill-fixed-entry')].filter(row => row !== drag.row);
    const oldRects = new Map(rows.map(row => [row, row.getBoundingClientRect()]));
    const target = rows.find(row => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2)
      || container.querySelector('.bill-total-row');
    if (drag.row.nextElementSibling !== target) {
      container.insertBefore(drag.row, target || null);
      animateOthers(rows, oldRects);
      const rect = drag.row.getBoundingClientRect();
      drag.translateY = event.clientY - drag.grabOffset - (rect.top - drag.translateY);
    } else {
      const rect = drag.row.getBoundingClientRect();
      drag.translateY = event.clientY - drag.grabOffset - (rect.top - drag.translateY);
    }
    drag.row.style.transform = `translate3d(0,${drag.translateY}px,0)`;
  }
  function finish(event, cancelled = false) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    clearTimeout(holdTimer); holdTimer = null;
    if (drag.active) {
      const finished = drag;
      finished.row.classList.remove('is-dragging');
      finished.handle.classList.remove('is-dragging');
      finished.row.style.transform = '';
      finished.container.classList.remove('is-reordering');
      persistDomOrder(finished.type);
      const index = [...container.querySelectorAll('.bill-fixed-entry')].indexOf(finished.row) + 1;
      const label = finished.row.querySelector('.br-name')?.textContent || '固定账单';
      say(cancelled ? `已保存${label}的新位置` : `${label}已移动到第 ${index} 项`);
      finished.row.classList.add('just-dropped');
      setTimeout(() => finished.row.classList.remove('just-dropped'), 240);
      try { if (finished.handle.hasPointerCapture(finished.pointerId)) finished.handle.releasePointerCapture(finished.pointerId); } catch (_) {}
    }
    drag = null;
  }

  container.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.bill-reorder-handle');
    const row = handle && handle.closest('.bill-fixed-entry');
    if (!row || (event.pointerType === 'mouse' && event.button !== 0)) return;
    clearTimeout(holdTimer);
    drag = {
      row, handle, pointerId:event.pointerId, type:currentType(),
      startY:event.clientY, grabOffset:event.clientY - row.getBoundingClientRect().top,
      translateY:0, active:false, container
    };
    holdTimer = setTimeout(() => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.active = true;
      row.classList.add('is-dragging');
      handle.classList.add('is-dragging');
      container.classList.add('is-reordering');
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
      say(`正在移动${row.querySelector('.br-name')?.textContent || '固定账单'}`);
    }, 230);
  });
  container.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientY - drag.startY) > 8) { clearTimeout(holdTimer); holdTimer = null; drag = null; }
      return;
    }
    event.preventDefault();
    reorderAroundPointer(event);
  }, { passive:false });
  container.addEventListener('pointerup', event => finish(event));
  container.addEventListener('pointercancel', event => finish(event, true));
  container.addEventListener('lostpointercapture', event => finish(event, true));
  container.addEventListener('keydown', event => {
    const handle = event.target.closest('.bill-reorder-handle');
    if (!handle || !['ArrowUp','ArrowDown'].includes(event.key)) return;
    const row = handle.closest('.bill-fixed-entry');
    const entries = [...container.querySelectorAll('.bill-fixed-entry')];
    const index = entries.indexOf(row), next = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (next < 0 || next >= entries.length) return;
    event.preventDefault();
    const other = entries[next];
    const moving = [row, other];
    const oldRects = new Map(moving.map(item => [item, item.getBoundingClientRect()]));
    if (event.key === 'ArrowUp') container.insertBefore(row, other);
    else container.insertBefore(other, row);
    animateOthers(moving, oldRects);
    persistDomOrder(currentType());
    handle.focus();
    say(`${row.querySelector('.br-name')?.textContent || '固定账单'}已移至第 ${next + 1} 项`);
  });
  new MutationObserver(enhanceRows).observe(container, { childList:true });
  enhanceRows();
})();
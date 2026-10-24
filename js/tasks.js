// ===== 布局与动画 =====
// 面板 4 列 × 6 行 = 24 格，代表一天 24 小时
// 任务块大小由计划时长决定：小时数 → 格子数（尽量排成接近方形的块）
//   未完成任务 → 从左上角逐格堆放
//   完成任务   → 从右下角逐格堆放
// 状态切换后保留任务块 DOM，并为所有受布局影响的块播放弹性移动。

const COLS = 8, ROWS = 12;
// 对所有因重新布局而移动的块播放轻微弹性位移动画。
function tileTransform(tx, ty, scale = 1) {
  return 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
}
function tilePosition(transform) {
  if (!transform || transform === 'none') return { x:0, y:0 };
  try {
    const m = new DOMMatrixReadOnly(transform);
    return { x:m.m41, y:m.m42 };
  } catch (_) {
    const m = String(transform).match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (m) return { x:parseFloat(m[1]), y:parseFloat(m[2]) };
    const matrix = String(transform).match(/^matrix\(([^)]+)\)$/);
    if (matrix) { const values = matrix[1].split(',').map(Number); return { x:values[4] || 0, y:values[5] || 0 }; }
    return { x:0, y:0 };
  }
}
function tileElementPosition(el) {
  const offset = tilePosition(getComputedStyle(el).transform);
  return { x:el.offsetLeft + offset.x, y:el.offsetTop + offset.y };
}
function animateTilePosition(el, fromPosition, tx, ty, isNew) {
  const targetX = Math.round(tx), targetY = Math.round(ty);
  const dx = targetX - fromPosition.x, dy = targetY - fromPosition.y;
  const distance = Math.hypot(dx, dy);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animations = el.getAnimations ? el.getAnimations() : [];
  animations.forEach(a => a.cancel());
  el.style.left = targetX + 'px';
  el.style.top = targetY + 'px';
  el.style.transform = 'none';
  if (reduceMotion || distance < 1 || typeof el.animate !== 'function') return;

  const overshoot = Math.min(11, Math.max(2.5, distance * 0.035));
  const ox = dx / distance * overshoot;
  const oy = dy / distance * overshoot;
  const duration = Math.max(380, Math.min(820, 340 + distance * 0.38));
  el.style.willChange = 'transform';
  const startX = fromPosition.x - targetX, startY = fromPosition.y - targetY;
  const frames = isNew
    ? [{ transform:tileTransform(startX, startY), opacity:.72, offset:0 }, { transform:tileTransform(ox, oy), opacity:1, offset:.76 }, { transform:'none', opacity:1, offset:1 }]
    : [{ transform:tileTransform(startX, startY), offset:0 }, { transform:tileTransform(ox, oy), offset:.78 }, { transform:'none', offset:1 }];
  const animation = el.animate(frames, { duration, easing:'cubic-bezier(.2,.72,.25,1)', fill:'both' });
  animation.onfinish = () => {
    animation.cancel();
    el.style.transform = 'none';
    el.style.willChange = 'auto';
  };
}

// 优先完整显示文字：先按块宽计算自动折行后的行数，同时保留用户输入的换行。
let tileTextMeasureContext = null;
function textToGrid(text, cellW, cellH, gap, hasTime = false) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  if (!tileTextMeasureContext) tileTextMeasureContext = document.createElement('canvas').getContext('2d');
  tileTextMeasureContext.font = '12px FangSong, "仿宋", "STFangsong", "仿宋_GB2312", "Noto Serif CJK SC", serif';
  const longestLine = Math.max(0, ...lines.map(line => tileTextMeasureContext.measureText(line).width));
  const columns = Math.min(COLS, Math.max(1, Math.ceil((longestLine + 12 + gap) / (cellW + gap))));
  const tileWidth = columns * cellW + (columns - 1) * gap;
  const textWidth = Math.max(1, tileWidth - 12);
  const visualLines = lines.reduce((count, line) => count + Math.max(1, Math.ceil(tileTextMeasureContext.measureText(line).width / textWidth)), 0);
  const textHeight = visualLines * 12 * 1.35 + 8 + (hasTime ? 20 : 0); // 含自动折行及时间签占高
  const rows = Math.min(ROWS, Math.max(1, Math.ceil((textHeight + gap) / (cellH + gap))));
  return { c:columns, r:rows };
}

// ===== 排序优先级：有时间戳按时间排序；无时间戳按浮沉状态自然布局 =====
// 任务字段：
//   start: string，开始时间戳（有时间戳的任务按时间排序，优先）
function timeVal(t) {
  if (!t.start) return Infinity;
  const m = String(t.start).match(/(\d{1,2}):(\d{2})/);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
// 有有效时间的排在同一浮沉分组前面并按时间排序；无时间的保持原顺序，交由浮沉布局排列。
function cmpSeq(a, b) {
  const at = timeVal(a), bt = timeVal(b);
  const ah = Number.isFinite(at), bh = Number.isFinite(bt);
  if (ah !== bh) return ah ? -1 : 1;
  return ah ? at - bt : 0;
}

function render(scope, animate = true) {
  const board = document.getElementById(scope + 'Board');
  const { tasks } = getData(scope);
  let hint = board.querySelector('.board-hint');
  if (!hint) { hint = document.createElement('div'); hint.className = 'board-hint'; board.appendChild(hint); }
  hint.textContent = '长按空白处添加任务';

  const bw = board.clientWidth || board.offsetWidth || 400;
  const bh = board.clientHeight || board.offsetHeight || 600;
  const GAP = 6;
  const cellW = (bw - GAP * (COLS + 1)) / COLS;
  const cellH = (bh - GAP * (ROWS + 1)) / ROWS;

  // 计算每个块的尺寸（像素）与占格
  const tiles = tasks.map(t => {
    const { c, r } = textToGrid(t.text, cellW, cellH, GAP, !!t.start);
    const pw = c * cellW + (c - 1) * GAP;
    const ph = r * cellH + (r - 1) * GAP;
    return { t, pw, ph, c, r, tx: 0, ty: 0 };
  });

  // 按浮沉状态与时间顺序自动布局，不保留手动拖拽位置。
  const occ = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  function fits(c0, r0, c, r) {
    if (c0 < 0 || r0 < 0 || c0 + c > COLS || r0 + r > ROWS) return false;
    for (let rr = r0; rr < r0 + r; rr++)
      for (let cc = c0; cc < c0 + c; cc++)
        if (occ[rr][cc]) return false;
    return true;
  }
  function mark(u, c0, r0) {
    for (let rr = r0; rr < r0 + u.r; rr++)
      for (let cc = c0; cc < c0 + u.c; cc++) occ[rr][cc] = true;
    u.gx = c0; u.gy = r0;
  }
  function scanFind(u) {
    for (let r0 = 0; r0 <= ROWS - u.r; r0++)
      for (let c0 = 0; c0 <= COLS - u.c; c0++)
        if (fits(c0, r0, u.c, u.r)) return [c0, r0];
    return null;
  }

  const bySeq = (a, b) => cmpSeq(a.t, b.t);
  const undone = tiles.filter(x => !x.t.done).sort(bySeq);
  const done = tiles.filter(x => x.t.done).sort(bySeq);

  // 未完成块从左上角向右下浮起。
  for (const u of undone) {
    const pos = scanFind(u);
    if (pos) mark(u, pos[0], pos[1]);
  }

  // 完成块：从右下角逐格扫描沉底（镜像：向上向左填）
  const doneLeft = done.filter(x => x.gx == null);
  for (const d of doneLeft) {
    placed2: for (let r0 = ROWS - d.r; r0 >= 0; r0--) {
      for (let c0 = COLS - d.c; c0 >= 0; c0--) {
        if (fits(c0, r0, d.c, d.r)) {
          mark(d, c0, r0);
          break placed2;
        }
      }
    }
  }

  for (const u of tiles) {
    if (u.gx == null) continue;
    u.tx = GAP + u.gx * (cellW + GAP);
    u.ty = GAP + u.gy * (cellH + GAP);
  }

  // 根据块尺寸自动计算字体大小：块越小字越小（描述细体，字号偏小）
  function fitStyle(pw, ph, hasTime) {
    const s = Math.min(pw, ph);
    let fs;                                    // 任务文字字号
    if (s < 46) fs = 8;
    else if (s < 62) fs = 9.5;
    else if (s < 90) fs = 11;
    else fs = 12;
    const tfs = s < 46 ? 8 : 9;                // 时间签字号
    return { fs, tfs };
  }

  // 创建/更新 DOM
  tiles.forEach(({ t, pw, ph, tx, ty }) => {
    let el = board.querySelector('[data-id="' + t.id + '"]');
    const isNew = !el;
    const fromPosition = isNew ? null : tileElementPosition(el);
    const fit = fitStyle(pw, ph, !!t.start);
    if (isNew) {
      el = document.createElement('div');
      el.dataset.id = t.id;
      el.className = 'tile c' + (t.color % COLORS) + (t.done ? ' done' : ' balloon') + (t.start ? ' has-time' : '');
      if (t.start) {
        const tm = document.createElement('div');
        tm.className = 'tile-time'; tm.textContent = t.start;
        tm.style.fontSize = fit.tfs + 'px';
        el.appendChild(tm);
      }
      const span = document.createElement('span');
      span.className = 'tile-text';
      span.innerHTML = textToHTML(t.text);
      el.appendChild(span);
      const check = document.createElement('div');
      check.className = 'tile-check'; check.textContent = '✓'; el.appendChild(check);
      // 新块从面板中央出现
      el.style.width = pw + 'px';
      el.style.height = ph + 'px';
      el.style.fontSize = fit.fs + 'px';
      el.style.transform = tileTransform(bw/2 - pw/2, bh/2 - ph/2);
      board.appendChild(el);
      bindTileEvents(el, scope, t);
    } else {
      el.className = 'tile c' + (t.color % COLORS) + (t.done ? ' done' : ' balloon');
      el.classList.toggle('has-time', !!t.start);
      el.style.width = pw + 'px';
      el.style.height = ph + 'px';
      el.style.fontSize = fit.fs + 'px';
      const span = el.querySelector('.tile-text');
      span.innerHTML = textToHTML(t.text);
      // 时间标签：有则更新/创建，无则移除
      let tm = el.querySelector('.tile-time');
      if (t.start) {
        if (!tm) { tm = document.createElement('div'); tm.className = 'tile-time'; el.insertBefore(tm, el.querySelector('.tile-text')); }
        tm.textContent = t.start;
        tm.style.fontSize = fit.tfs + 'px';
      } else if (tm) { tm.remove(); }
    }
    if (animate) {
      animateTilePosition(el, isNew ? tilePosition(el.style.transform) : fromPosition, tx, ty, isNew);
    } else {
      if (el.getAnimations) el.getAnimations().forEach(animation => animation.cancel());
      el.style.left = Math.round(tx) + 'px';
      el.style.top = Math.round(ty) + 'px';
      el.style.transform = 'none';
      el.style.opacity = '1';
      el.style.willChange = 'auto';
    }
  });

  // 移除已删除的块
  board.querySelectorAll('.tile').forEach(el => {
    if (!tasks.find(t => String(t.id) === el.dataset.id)) el.remove();
  });

  bindBoardEvents(board, scope);
}

// ===== 交互绑定 =====
function bindTileEvents(el, scope, t) {
  el.oncontextmenu = (e) => e.preventDefault();
  let timer = null;
  function start(e) {
    if (e.button != null && e.button !== 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => { openTileMenu(scope, t, el); }, 400);
  }
  function end() {
    clearTimeout(timer);
  }

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', end);
  el.addEventListener('click', (e) => {
    toggleTile(scope, t.id);
  });
}

function bindBoardEvents(board, scope) {
  board.oncontextmenu = (e) => e.preventDefault();
  let boardTimer = null;
  function boardDown(e) {
    if (e.target !== board && !e.target.classList.contains('board-hint')) return;
    board.classList.add('pressing');
    boardTimer = setTimeout(() => { board.classList.remove('pressing'); openDialog(scope); }, 400);
  }
  function boardUp() { board.classList.remove('pressing'); clearTimeout(boardTimer); }
  board.addEventListener('touchstart', boardDown, { passive: true });
  board.addEventListener('mousedown', boardDown);
  board.addEventListener('touchend', boardUp);
  board.addEventListener('touchmove', boardUp, { passive: true });
  board.addEventListener('mouseup', boardUp);
  board.addEventListener('mouseleave', boardUp);
}

function toggleTile(scope, id) {
  const { tasks } = getData(scope);
  const t = tasks.find(x => x.id === id);
  if (t) t.done = !t.done;
  setData(scope, tasks);
  render(scope);  // 重新渲染，物理会让它飞向新区域
}

// ===== 新增任务（均在当前模块内展开） =====
// 隐藏占位节点仅供课程表星期选择器定位；打卡任务不再设置难度或块大小。
function openDialog(scope) {
  dialogScope = scope;
  ttDialogTarget = null;
  resetDialog();
  document.getElementById('dialogInput').value = '';
  document.getElementById('tpHour').value = '';
  document.getElementById('tpMinute').value = '';
  document.getElementById('overlay').classList.add('checkin-form', 'show');
  requestAnimationFrame(() => document.getElementById('dialogInput').focus());
}
function closeDialog() {
  document.getElementById('overlay').classList.remove('show', 'checkin-form');
  dialogScope = null;
  resetDialog();
  if (ttDialogTarget) {
    ttDialogTarget = null;
    const h3 = document.querySelector('#overlay .dialog h3');
    if (h3) h3.textContent = '添加任务';
    const sp = document.getElementById('ttSlotPicker');
    if (sp) sp.remove();
    // 恢复隐藏占位区的默认样式。
    const durRow = document.getElementById('durRow');
    durRow.style.display = '';
    const durLabel = durRow.previousElementSibling;
    if (durLabel && durLabel.classList.contains('dur-label')) durLabel.style.display = '';
  }
}
// 恢复弹窗为默认添加状态；小时和分钟留空表示不设置时间。
function resetDialog() {
  const title = document.getElementById('dialogTitle');
  if (title) title.textContent = '添加任务';
  document.getElementById('dialogInput').style.display = '';
  document.getElementById('timePicker').classList.remove('hidden');
  document.getElementById('tpHour').value = '';
  document.getElementById('tpMinute').value = '';
  document.getElementById('durLabel').style.display = '';
  document.getElementById('durRow').style.display = '';
  document.getElementById('btnOk').textContent = '添加';
}
function getPickedTime() {
  const hourText = document.getElementById('tpHour').value.trim();
  const minuteText = document.getElementById('tpMinute').value.trim();
  if (!hourText && !minuteText) return '';
  if (!/^\d{1,2}$/.test(hourText) || !/^\d{1,2}$/.test(minuteText)) return null;
  const h = Number(hourText), m = Number(minuteText);
  if (h > 23 || m > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function confirmAdd() {
  // 课程表添加分支
  if (ttDialogTarget) {
    const text = document.getElementById('dialogInput').value.trim();
    const start = getPickedTime();
    if (start === null) { alert('请填写有效的小时（0–23）和分钟（0–59），或都留空'); return; }
    ttDialogTarget = null;
    const h3 = document.querySelector('#overlay .dialog h3');
    if (h3) h3.textContent = '添加任务';
    // 移除星期选择器，恢复隐藏占位区的默认样式。
    const sp = document.getElementById('ttSlotPicker');
    if (sp) sp.remove();
    const durRow = document.getElementById('durRow');
    durRow.style.display = '';
    const durLabel = durRow.previousElementSibling;
    if (durLabel && durLabel.classList.contains('dur-label')) durLabel.style.display = '';
    if (!text) { closeDialog(); return; }
    const { tasks } = ttGetWeekTasks();
    tasks.push({ id: Date.now() + Math.random(), text, start, dayId: ttDialogDay, done: false, color: tasks.length % COLORS });
    ttSetWeekTasks(tasks);
    closeDialog(); renderTimetable();
    return;
  }
  const text = document.getElementById('dialogInput').value.trim();
  if (!text) { closeDialog(); return; }
  const scope = dialogScope;
  if (!scope) { closeDialog(); return; }
  const start = getPickedTime();
  if (start === null) { alert('请填写有效的小时（0–23）和分钟（0–59），或都留空'); return; }
  const { tasks } = getData(scope);
  tasks.push({ id: Date.now() + Math.random(), text, start, done: false, color: tasks.length % COLORS });
  setData(scope, tasks);
  closeDialog(); render(scope);
}

// ===== 长按块菜单 =====
function openTileMenu(scope, t, el) {
  const { tasks } = getData(scope);
  const obj = tasks.find(x => x.id === t.id);
  if (!obj) return;
  const anchor = el;
  showInlineEditor(anchor, '编辑任务', [
    { label:'', hideLabel:true, type:'textarea', value:obj.text || '' },
    ...makeTimeFields(obj.start)
  ], values => {
    const name = values[0].trim();
    const start = readTimeFields(values, 1);
    if (!name) { alert('请填写任务名称'); return false; }
    if (start === null) { alert('小时范围为 0–23，分钟范围为 0–59'); return false; }
    obj.text = name; obj.start = start;
    setData(scope, tasks); render(scope);
  }, null, () => deleteTile(scope, obj), 'centered-tile');
}
function clearTimeOf(scope, t) {
  if (!t || !scope) return;
  const { tasks } = getData(scope);
  const obj = tasks.find(x => x.id === t.id);
  if (obj) { obj.start = ''; setData(scope, tasks); render(scope); }
}
// 时间戳在打卡模块下方直接编辑
function openTimeEdit(scope, t) {
  const anchor = document.getElementById(scope + 'Board')?.parentElement;
  showInlineEditor(anchor, '设置时间', makeTimeFields(t.start), values => {
    const start = readTimeFields(values, 0);
    if (start === null) { alert('小时范围为 0–23，分钟范围为 0–59'); return false; }
    const { tasks } = getData(scope);
    const obj = tasks.find(x => x.id === t.id);
    if (obj) { obj.start = start; setData(scope, tasks); render(scope); }
  });
}
function closeTileMenu() {
  document.getElementById('tileMenu').classList.remove('show');
  menuTile = null; menuScope = null;
}
function renameTile(scope, t) {
  if (!t || !scope) return;
  const { tasks } = getData(scope);
  const obj = tasks.find(x => x.id === t.id);
  if (!obj) return;
  const anchor = document.getElementById(scope + 'Board')?.parentElement;
  showInlineEditor(anchor, '编辑任务', [{ label:'任务名称', type:'text', value:obj.text || '' }], values => {
    const name = values[0].trim();
    if (!name) return false;
    obj.text = name; setData(scope, tasks); render(scope);
  });
}
function deleteTile(scope, t) {
  if (!t || !scope) return;
  if (!confirm('确定删除这条任务吗？')) return false;
  setData(scope, getData(scope).tasks.filter(x => x.id !== t.id));
  render(scope);
  return true;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#tileMenu')) closeTileMenu();
});
document.getElementById('dialogInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmAdd(); } });
document.getElementById('btnOk').addEventListener('click', confirmAdd);
document.getElementById('btnCancel').addEventListener('click', closeDialog);
['overlay','promptOverlay','formOverlay'].forEach(id => { const el = document.getElementById(id); el.addEventListener('click', e => { if (e.target === el) { e.preventDefault(); e.stopPropagation(); } }); });
['overlay','promptOverlay','formOverlay'].forEach(id => document.querySelector('#' + id + ' .dialog').addEventListener('click', e => e.stopPropagation()));
// ===== 时间输入框（手动输入数字，留空表示不设置） =====
function bindTimeInputs() {
  const hourEl = document.getElementById('tpHour');
  const minEl = document.getElementById('tpMinute');
  ['calAddHour','calAddMinute'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, '').slice(0, 2); });
  });
  function numericOnly(el, max) {
    el.addEventListener('input', () => {
      // 去除非数字字符
      let v = el.value.replace(/\D/g, '');
      // 小时/分钟都最多 2 位
      if (v.length > 2) v = v.slice(0, 2);
      el.value = v;
    });
    el.addEventListener('blur', () => {
      let v = el.value.replace(/\D/g, '');
      if (v === '') { el.value = ''; return; }
      let n = parseInt(v, 10);
      if (n <= max) el.value = String(n).padStart(2, '0');
    });
    // 阻止非数字按键（保留退格/删除/方向键/Tab）
    el.addEventListener('keydown', (e) => {
      const ok = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End','Enter'];
      if (ok.includes(e.key) || e.ctrlKey || e.metaKey) return;
      if (!/\d/.test(e.key)) e.preventDefault();
    });
  }
  numericOnly(hourEl, 23);
  numericOnly(minEl, 59);
}
function initTimePicker() { bindTimeInputs(); }
// ===== 通用输入弹窗（替代沙箱禁用的 prompt） =====
// 支持多行：Enter 换行，Ctrl/Cmd+Enter 提交
function askInput(title, placeholder, initial) {
  return new Promise((resolve) => {
    document.getElementById('promptTitle').textContent = title;
    const inp = document.getElementById('promptInput');
    inp.placeholder = placeholder || '';
    inp.value = initial != null ? initial : '';
    document.getElementById('promptOverlay').classList.add('show');
    inp.focus();
    function done(val) {
      document.getElementById('promptOverlay').classList.remove('show');
      cleanup();
      resolve(val);
    }
    function onOk() { done(inp.value); }
    function onCancel() { done(null); }
    function onKey(e) {
      if (e.key === 'Enter') {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); onOk(); }
        // 普通 Enter：多行模式下允许换行，不提交
      }
    }
    function cleanup() {
      document.getElementById('promptOk').removeEventListener('click', onOk);
      document.getElementById('promptCancel').removeEventListener('click', onCancel);
      document.getElementById('promptOverlay').removeEventListener('click', onBackdrop);
      inp.removeEventListener('keydown', onKey);
    }
    function onBackdrop(e) { if (e.target === e.currentTarget) onCancel(); }
    document.getElementById('promptOk').addEventListener('click', onOk);
    document.getElementById('promptCancel').addEventListener('click', onCancel);
    document.getElementById('promptOverlay').addEventListener('click', onBackdrop);
    inp.addEventListener('keydown', onKey);
  });
}

// ===== 多字段表单弹窗 =====
// fields: [{ label, placeholder, value, type('text'|'password'|'textarea') }]
// 返回字段值数组；取消返回 null
function openForm(title, fields, okText) {
  return new Promise((resolve) => {
    document.getElementById('formTitle').textContent = title;
    const wrap = document.getElementById('formFields');
    wrap.innerHTML = '';
    const inputs = [];
    fields.forEach(f => {
      const box = document.createElement('div');
      box.className = 'form-field';
      const lab = document.createElement('div');
      lab.className = 'form-label'; lab.textContent = f.label;
      let inp;
      if (f.type === 'textarea') {
        inp = document.createElement('textarea');
        inp.rows = 2;
      } else {
        inp = document.createElement('input');
        inp.type = f.type || 'text';
      }
      inp.placeholder = f.placeholder || '';
      inp.value = f.value != null ? f.value : '';
      box.appendChild(lab); box.appendChild(inp);
      wrap.appendChild(box);
      inputs.push(inp);
    });
    const okBtn = document.getElementById('formOk');
    if (okText) okBtn.textContent = okText; else okBtn.textContent = '确定';
    document.getElementById('formOverlay').classList.add('show');
    if (inputs[0]) inputs[0].focus();

    function cleanup() {
      document.getElementById('formOk').removeEventListener('click', onOk);
      document.getElementById('formCancel').removeEventListener('click', onCancel);
      document.getElementById('formOverlay').removeEventListener('click', onBackdrop);
    }
    function close(vals) {
      document.getElementById('formOverlay').classList.remove('show');
      cleanup();
      resolve(vals);
    }
    function onOk() { close(inputs.map(i => i.value)); }
    function onCancel() { close(null); }
    function onBackdrop(e) { if (e.target === e.currentTarget) onCancel(); }
    document.getElementById('formOk').addEventListener('click', onOk);
    document.getElementById('formCancel').addEventListener('click', onCancel);
    document.getElementById('formOverlay').addEventListener('click', onBackdrop);
  });
}





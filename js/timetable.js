// ===== 周打卡·课程表模式 =====
// 课程表：一个整体大框，背景有纵横时间坐标（横轴 周一~周日，纵轴 上午/下午）作参照
// 任务块按文字长度决定大小，全局布局：
//   未完成任务 → 浮到整个大框左上角；完成任务 → 沉到整个大框右下角
// 任务带 dayId(1-7)/partId(am|pm)，块上显示「周X·上午/下午」标签
// 数据：按周 key 存任务数组，任务对象含 text/start/dayId/partId/done/color
const TT_DAYS = [
  { id: 1, label: '周一', short: '一' },
  { id: 2, label: '周二', short: '二' },
  { id: 3, label: '周三', short: '三' },
  { id: 4, label: '周四', short: '四' },
  { id: 5, label: '周五', short: '五' },
  { id: 6, label: '周六', short: '六' },
  { id: 7, label: '周日', short: '日' }
];
// 大框网格：7 列(周一~周日) × 18 行；任务块宽=整列宽(1列)，高=1行
const TT_COLS = 7, TT_ROWS = 18;
const TT_TILE_COLS = 1, TT_TILE_ROWS = 1; // 每块占 1 列宽 × 1 行高

function ttGetWeekTasks() {
  const all = load(KEY_TT, {});
  const wk = weekKey(currentWeekStart);
  return { wk, tasks: all[wk] || [] };
}
function ttSetWeekTasks(tasks) {
  const all = load(KEY_TT, {});
  const wk = weekKey(currentWeekStart);
  all[wk] = tasks;
  save(KEY_TT, all);
}

function switchWeekView(view) {
  weekView = view;
  document.querySelectorAll('#weekTabs .vt-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.getElementById('weekBoardWrap').classList.toggle('hidden', view !== 'board');
  document.getElementById('weekTableWrap').classList.toggle('hidden', view !== 'timetable');
  if (view === 'board') render('week');
  else renderTimetable();
}

// 时间戳 HH:MM → 「8点」/「9点30」格式
function ttPoint(start) {
  const m = String(start || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = parseInt(m[1], 10), mm = m[2];
  return h + '点' + (mm !== '00' ? mm : '');
}

// 列表模式：按星期分组的纯文字清单
// 格式：- 周一：任务A（8点，11点）；任务B（10点）
// 同一天同名任务合并，时间点依次列出；无浮沉、无网格
function renderTimetable() {
  const wrap = document.getElementById('weekTableWrap');
  wrap.innerHTML = '';

  const today = new Date();
  const dow = today.getDay();
  const todayId = dow === 0 ? 7 : dow;
  const { tasks } = ttGetWeekTasks();

  const list = document.createElement('div');
  list.className = 'tt-list';

  let any = false;
  TT_DAYS.forEach(d => {
    const dayTasks = tasks.filter(t => (t.dayId || 1) === d.id).sort(cmpSeq);
    if (!dayTasks.length) return;
    any = true;

    // 同名任务合并，时间点依次列出
    const groups = [];
    const map = {};
    for (const t of dayTasks) {
      const k = String(t.text);
      if (!map[k]) { map[k] = { text: t.text, times: [], members: [] }; groups.push(map[k]); }
      const pt = ttPoint(t.start);
      if (pt) map[k].times.push(pt);
      map[k].members.push(t);
    }

    const row = document.createElement('div');
    row.className = 'tt-row';
    const head = document.createElement('span');
    head.className = 'tt-row-day';
    head.textContent = d.label + '：';
    row.appendChild(head);

    groups.forEach((g, gi) => {
      if (gi) {
        const sep = document.createElement('span');
        sep.className = 'tt-row-sep'; sep.textContent = '；';
        row.appendChild(sep);
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'checkbox');
      const allDone = g.members.every(m => m.done);
      const someDone = g.members.some(m => m.done);
      item.className = 'tt-item' + (allDone ? ' done' : (someDone ? ' part' : ''));
      item.setAttribute('aria-checked', allDone ? 'true' : (someDone ? 'mixed' : 'false'));
      item.setAttribute('aria-label', g.text + (g.times.length ? '，' + g.times.join('，') : ''));
      const check = document.createElement('span');
      check.className = 'tt-check'; check.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'tt-label'; label.textContent = g.text + (g.times.length ? '（' + g.times.join('，') + '）' : '');
      item.append(check, label);
      // 点击：切换该组全部任务的完成状态
      item.addEventListener('click', () => {
        const { tasks: ts } = ttGetWeekTasks();
        const ids = new Set(g.members.map(m => String(m.id)));
        const objs = ts.filter(x => ids.has(String(x.id)));
        const wasAllDone = objs.every(o => o.done);
        objs.forEach(o => { o.done = !wasAllDone; });
        ttSetWeekTasks(ts);
        renderTimetable();
      });
      bindTTItemEvents(item, g);
      row.appendChild(item);
    });
    list.appendChild(row);
  });

  if (!any) {
    const hint = document.createElement('div');
    hint.className = 'tt-list-hint';
    hint.textContent = '长按空白处添加任务';
    list.appendChild(hint);
  }
  wrap.appendChild(list);
  bindTTListAdd(list);
}

// 列表条目：长按弹菜单（编辑名称/时间戳/删除），作用于该组第一个任务
let ttItemLongFired = false; // 长按标记（全局唯一，长按后抑制紧随的 click 误触）
function bindTTItemEvents(item, group) {
  item.oncontextmenu = (e) => e.preventDefault();
  let timer = null;
  let sx = 0, sy = 0;
  const rep = group.members[0];
  function down(e) {
    if (e.button != null && e.button !== 0) return;
    ttItemLongFired = false;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    timer = setTimeout(() => { ttItemLongFired = true; openTTTileMenu(rep, item); }, 400);
  }
  function move(e) {
    const p = e.touches ? e.touches[0] : e;
    if (Math.hypot(p.clientX - sx, p.clientY - sy) > 10) { clearTimeout(timer); }
  }
  function up() { clearTimeout(timer); }
  item.addEventListener('touchstart', down, { passive: true });
  item.addEventListener('touchmove', move, { passive: true });
  item.addEventListener('touchend', up);
  item.addEventListener('touchcancel', up);
  item.addEventListener('mousedown', down);
  item.addEventListener('mouseup', up);
  item.addEventListener('mouseleave', up);
}
// 长按菜单打开后，拦截紧随的 click（捕获阶段，只注册一次）
document.addEventListener('click', (e) => {
  if (ttItemLongFired) { e.preventDefault(); e.stopPropagation(); ttItemLongFired = false; }
}, true);

// 列表空白处（或空提示）长按添加任务
function bindTTListAdd(list) {
  list.oncontextmenu = (e) => e.preventDefault();
  let timer = null;
  function down(e) {
    if (e.target !== list && !e.target.classList.contains('tt-list-hint') && !e.target.classList.contains('tt-row')) return;
    list.classList.add('pressing');
    timer = setTimeout(() => { list.classList.remove('pressing'); openTTDialog(); }, 400);
  }
  function up() { list.classList.remove('pressing'); clearTimeout(timer); }
  list.addEventListener('touchstart', down, { passive: true });
  list.addEventListener('touchend', up);
  list.addEventListener('touchmove', up, { passive: true });
  list.addEventListener('mousedown', down);
  list.addEventListener('mouseup', up);
  list.addEventListener('mouseleave', up);
}

function openTTTileMenu(t, el) {
  const { tasks } = ttGetWeekTasks();
  const obj = tasks.find(x => x.id === t.id);
  if (!obj) return;
  const anchor = el.closest('.tt-row') || el;
  showInlineEditor(anchor, '编辑任务', [
    { label:'任务名称', value:obj.text || '' },
    ...makeTimeFields(obj.start)
  ], values => {
    const name = values[0].trim();
    const start = readTimeFields(values, 1);
    if (!name) { alert('请填写任务名称'); return false; }
    if (start === null) { alert('小时范围为 0–23，分钟范围为 0–59'); return false; }
    obj.text = name; obj.start = start;
    ttSetWeekTasks(tasks); renderTimetable();
  }, null, () => {
    ttSetWeekTasks(tasks.filter(x => x.id !== obj.id));
    renderTimetable();
  });
}

// 列表模式：时间戳在条目下方直接编辑
function openTTTimeEdit(t, el) {
  const anchor = el ? (el.closest('.tt-row') || el) : document.getElementById('weekTableWrap');
  showInlineEditor(anchor, '设置时间', makeTimeFields(t.start), values => {
    const start = readTimeFields(values, 0);
    if (start === null) { alert('小时范围为 0–23，分钟范围为 0–59'); return false; }
    const { tasks } = ttGetWeekTasks();
    const obj = tasks.find(x => x.id === t.id);
    if (obj) { obj.start = start; ttSetWeekTasks(tasks); renderTimetable(); }
  });
}
// 列表模式长按空白处后，在页面中填写任务
let ttDialogTarget = null;
let ttDialogDay = 1;
function openTTDialog() {
  const now = new Date();
  const dow = now.getDay();
  ttDialogDay = dow === 0 ? 7 : dow;
  ttDialogTarget = true;
  dialogScope = null;
  dismissInlineEditor();
  resetDialog();
  document.getElementById('dialogInput').value = '';
  document.getElementById('dialogTitle').textContent = '添加列表任务';
  document.getElementById('tpHour').value = '';
  document.getElementById('tpMinute').value = '';
  document.getElementById('durRow').style.display = 'none';
  document.getElementById('durLabel').style.display = 'none';
  renderTTSlotPicker();
  document.getElementById('overlay').classList.add('checkin-form', 'show');
  requestAnimationFrame(() => document.getElementById('dialogInput').focus());
}

// 在弹窗内渲染星期选择（复用 dur-row 样式，动态插入）
function renderTTSlotPicker() {
  const old = document.getElementById('ttSlotPicker');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'ttSlotPicker';

  const dl = document.createElement('div');
  dl.className = 'dur-label'; dl.textContent = '星期';
  wrap.appendChild(dl);
  const dayRow = document.createElement('div');
  dayRow.className = 'dur-row';
  TT_DAYS.forEach(d => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dur-btn' + (d.id === ttDialogDay ? ' active' : '');
    b.textContent = d.short; b.dataset.day = d.id;
    b.addEventListener('click', () => { ttDialogDay = d.id; renderTTSlotPicker(); });
    dayRow.appendChild(b);
  });
  wrap.appendChild(dayRow);

  // 插入到隐藏占位区之前。
  const durRow = document.getElementById('durRow');
  durRow.parentNode.insertBefore(wrap, durRow);
}

// ===== 日历待办 =====
// 日历待办独立存储：按日期 key 存任务数组，与日任务互不联动。
function calGetTasks(key) {
  const all = load(KEY_CAL, {});
  return all[key] || [];
}
function calSetTasks(key, tasks) {
  const all = load(KEY_CAL, {});
  all[key] = tasks; save(KEY_CAL, all);
}
function calShift(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function calDateKey(y, m, d) {
  return y + '-' + pad(m + 1) + '-' + pad(d);
}
const CN_LUNAR = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' });
const CN_SOLAR_TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const CN_SOLAR_TERM_MINUTES = [0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
function calSolarTerm(y, m, d) {
  for (let i = 0; i < CN_SOLAR_TERMS.length; i++) {
    const utc = Date.UTC(1900, 0, 6, 2, 5) + 31556925974.7 * (y - 1900) + CN_SOLAR_TERM_MINUTES[i] * 60000;
    const dt = new Date(utc);
    if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) return CN_SOLAR_TERMS[i];
  }
  return '';
}
function calDayNote(y, m, d) {
  const date = new Date(y, m, d, 12);
  const parts = CN_LUNAR.formatToParts(date);
  const lunarMonth = (parts.find(x => x.type === 'month') || {}).value || '';
  const lunarDay = (parts.find(x => x.type === 'day') || {}).value || '';
  const chineseNumber = value => {
    const chars = {零:0,〇:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    const s = String(value).replace(/[初十廿卅]/g, ch => ({初:'',十:'十',廿:'二十',卅:'三十'}[ch]));
    if (/^\d+$/.test(s)) return Number(s);
    if (s === '十') return 10;
    let total = 0, digit = 0;
    for (const ch of s) { if (ch === '十') { total += (digit || 1) * 10; digit = 0; } else if (chars[ch] !== undefined) digit = chars[ch]; }
    return total + digit;
  };
  const lunarNum = chineseNumber(lunarDay);
  const solarTerm = calSolarTerm(y, m, d);
  const solarFestivals = { '1-1':'元旦', '2-14':'情人节', '3-8':'妇女节', '4-1':'愚人节', '5-1':'劳动节', '6-1':'儿童节', '7-1':'建党节', '8-1':'建军节', '9-10':'教师节', '10-1':'国庆节', '12-24':'平安夜', '12-25':'圣诞节' };
  const lunarFestivals = { '1-1':'春节', '1-15':'元宵', '5-5':'端午', '7-7':'七夕', '7-15':'中元', '8-15':'中秋', '9-9':'重阳', '12-8':'腊八', '12-23':'小年' };
  const lunarMonthNum = chineseNumber(lunarMonth.replace(/^闰/, '').replace(/月$/, ''));
  const tomorrowParts = CN_LUNAR.formatToParts(new Date(y, m, d + 1, 12));
  const tomorrowMonth = (tomorrowParts.find(x => x.type === 'month') || {}).value || '';
  const tomorrowDay = (tomorrowParts.find(x => x.type === 'day') || {}).value || '';
  const isLunarEve = lunarMonthNum === 12 && chineseNumber(tomorrowMonth.replace(/^闰/, '').replace(/月$/, '')) === 1 && chineseNumber(tomorrowDay) === 1;
  const special = solarTerm || solarFestivals[(m + 1) + '-' + d] || lunarFestivals[lunarMonthNum + '-' + lunarNum] || (isLunarEve ? '除夕' : '');
  return { text: special || lunarDay || lunarMonth, special: !!special };
}
function renderCalendar() {
  document.getElementById('calTitle').textContent = calYear + ' 年 ' + (calMonth + 1) + ' 月';
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  const first = new Date(calYear, calMonth, 1);
  const startDow = first.getDay();          // 0=日
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  // 前导空白（上月）
  for (let i = 0; i < startDow; i++) {
    const c = document.createElement('div');
    c.className = 'cal-cell other';
    grid.appendChild(c);
  }
  // 本月日期
  for (let d = 1; d <= daysInMonth; d++) {
    const key = calDateKey(calYear, calMonth, d);
    const tasks = calGetTasks(key);
    const c = document.createElement('div');
    c.className = 'cal-cell';
    if (key === todayKey) c.classList.add('today');
    if (key === calSelKey) c.classList.add('sel');
    if (tasks.length) {
      const allDone = tasks.every(x => x.done);
      c.classList.add(allDone ? 'all-done' : 'has-task');
    }
    const dayNumber = document.createElement('span');
    dayNumber.className = 'cal-day-number';
    dayNumber.textContent = d;
    const note = document.createElement('span');
    const dayInfo = calDayNote(calYear, calMonth, d);
    note.className = 'cal-day-note' + (dayInfo.special ? ' special' : '');
    note.textContent = dayInfo.text;
    c.append(dayNumber, note);
    c.addEventListener('click', () => { calSelKey = key; renderCalendar(); });
    grid.appendChild(c);
  }
  // 渲染选中日期的待办列表
  const selTasks = calGetTasks(calSelKey);
  document.getElementById('calListTitle').textContent = calSelKey + ' 的待办';
  const items = document.getElementById('calItems');
  items.innerHTML = '';
  if (!selTasks.length) {
    const e = document.createElement('div');
    e.className = 'cal-empty'; e.textContent = '这一天还没有待办';
    items.appendChild(e);
  }
  selTasks.forEach(t => {
    const row = document.createElement('div');
    row.className = 'cal-item' + (t.done ? ' done' : '');
    const ck = document.createElement('div');
    ck.className = 'ci-check'; ck.textContent = t.done ? '✓' : '';
    ck.addEventListener('click', (e) => {
      e.stopPropagation();
      t.done = !t.done; calSetTasks(calSelKey, selTasks); renderCalendar();
    });
    const tx = document.createElement('div');
    tx.className = 'ci-text'; tx.innerHTML = textToHTML(t.text);
    const tm = document.createElement('div');
    tm.className = 'ci-time'; tm.textContent = t.start || '';
    const del = document.createElement('button');
    del.className = 'ci-del'; del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('确定删除这条待办吗？')) return;
      calSetTasks(calSelKey, selTasks.filter(x => x.id !== t.id)); renderCalendar();
    });
    row.appendChild(ck); row.appendChild(tx); row.appendChild(tm); row.appendChild(del);
    tx.classList.add('inline-editable');
    tx.addEventListener('click', e => {
      e.stopPropagation();
      const key = calSelKey, id = t.id;
      beginDirectTextEdit(tx, e, { value:t.text || '', save:value => {
        if (!value) return false;
        const latest = calGetTasks(key), item = latest.find(x => x.id === id);
        if (!item) return false;
        item.text = value; calSetTasks(key, latest); renderCalendar();
      }});
    });
    items.appendChild(row);
  });
}
function calAdd() {
  const text = document.getElementById('calAddText').value.trim();
  const hourText = document.getElementById('calAddHour').value.trim();
  const minuteText = document.getElementById('calAddMinute').value.trim();
  if (!text) { alert('请填写待办内容'); return; }
  if (!!hourText !== !!minuteText) { alert('请同时填写小时和分钟，或都留空'); return; }
  let start = '';
  if (hourText && minuteText) {
    const hour = Number(hourText), minute = Number(minuteText);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) { alert('小时范围为 0–23，分钟范围为 0–59'); return; }
    start = pad(hour) + ':' + pad(minute);
  }
  const tasks = calGetTasks(calSelKey);
  tasks.push({ id:Date.now() + Math.random(), text, start, done:false, color:tasks.length % COLORS });
  calSetTasks(calSelKey, tasks);
  document.getElementById('calAddText').value = '';
  document.getElementById('calAddHour').value = '';
  document.getElementById('calAddMinute').value = '';
  document.body.classList.remove('inline-editing');
  renderCalendar();
}
// 待办内容与时间在当前行下方直接编辑
function calEdit(t, key, anchor) {
  const tasks = calGetTasks(key);
  const obj = tasks.find(x => x.id === t.id);
  if (!obj) return;
  showInlineEditor(anchor, '编辑待办', [
    { label:'待办内容', type:'textarea', value:obj.text || '' },
    ...makeTimeFields(obj.start)
  ], values => {
    const text = values[0].trim();
    const start = readTimeFields(values, 1);
    if (!text) { alert('请填写待办内容'); return false; }
    if (start === null) { alert('小时范围为 0–23，分钟范围为 0–59'); return false; }
    obj.text = text; obj.start = start;
    calSetTasks(key, tasks); renderCalendar();
  });
}
function bindLongPress(el, onLongPress) {
  el.oncontextmenu = (e) => e.preventDefault();
  let timer = null;
  let sx = 0, sy = 0;
  function down(e) {
    if (e.button != null && e.button !== 0) return;
    lpFired = false;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    timer = setTimeout(() => { lpFired = true; onLongPress(); }, 400);
  }
  function move(e) {
    const p = e.touches ? e.touches[0] : e;
    if (Math.hypot(p.clientX - sx, p.clientY - sy) > 10) { clearTimeout(timer); }
  }
  function up() { clearTimeout(timer); }
  el.addEventListener('touchstart', down, { passive: true });
  el.addEventListener('touchmove', move, { passive: true });
  el.addEventListener('touchend', up);
  el.addEventListener('touchcancel', up);
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
}
document.addEventListener('click', (e) => {
  if (lpFired) { e.preventDefault(); e.stopPropagation(); lpFired = false; }
}, true);

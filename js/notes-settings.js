// ===== 小纸条 =====
// 记录字段：{ id, text, time }
function noteGetAll() { return load(KEY_NOTE, []); }
function noteSaveAll(list) { save(KEY_NOTE, list); }
function noteFmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function renderNote() {
  const list = noteGetAll();
  const container = document.getElementById('noteItems');
  container.innerHTML = '';
  if (!list.length) {
    const e = document.createElement('div');
    e.className = 'pwd-empty'; e.textContent = '还没有纸条';
    container.appendChild(e);
    return;
  }
  // 最新在前
  const sorted = [...list].sort((a, b) => b.time - a.time);
  sorted.forEach(n => {
    const item = document.createElement('div');
    item.className = 'note-item';
    const txt = document.createElement('div');
    txt.className = 'note-text inline-editable'; txt.textContent = n.text;
    txt.addEventListener('click', e => {
      e.stopPropagation();
      beginDirectTextEdit(txt, e, { value:n.text || '', multiline:true, save:value => {
        if (!value) return false;
        const all = noteGetAll(), item = all.find(x => x.id === n.id); if (!item) return false;
        item.text = value; item.time = Date.now(); noteSaveAll(all); renderNote();
      }});
    });
    const tm = document.createElement('div');
    tm.className = 'note-time'; tm.textContent = noteFmtTime(n.time);
    const del = document.createElement('button');
    del.className = 'note-del'; del.textContent = '×';
    del.addEventListener('click', () => {
      noteSaveAll(noteGetAll().filter(x => x.id !== n.id)); renderNote();
    });
    item.appendChild(txt); item.appendChild(tm); item.appendChild(del);
    item.classList.add('inline-editable');

    container.appendChild(item);
  });
}
function noteAdd() {
  const text = document.getElementById('noteAddText').value.trim();
  if (!text) { alert('纸条内容不能为空'); return; }
  const list = noteGetAll();
  list.push({ id:Date.now() + Math.random(), text, time:Date.now() });
  noteSaveAll(list);
  document.getElementById('noteAddText').value = '';
  document.body.classList.remove('inline-editing');
  renderNote();
}
// 纸条内容直接在该条下方编辑
function noteEdit(n, anchor) {
  showInlineEditor(anchor, '编辑纸条', [
    { label:'内容', type:'textarea', value:n.text || '' }
  ], values => {
    const text = values[0].trim();
    if (!text) { alert('纸条内容不能为空'); return false; }
    const list = noteGetAll();
    const item = list.find(x => x.id === n.id);
    if (item) { item.text = text; item.time = Date.now(); }
    noteSaveAll(list); renderNote();
  });
}
// ===== 我的 =====
function renderMine() {
  syncThemeOptions();
  document.querySelector('.mine-name').textContent = load(KEY_PROFILE_NAME, '我的打卡');
  const weekAll = load(KEY_WEEK, {});
  const dayAll = load(KEY_DAY, {});
  let done = 0, undone = 0;
  const dayKeys = new Set();
  // 周任务
  for (const k in weekAll) {
    (weekAll[k] || []).forEach(t => { if (t.done) done++; else undone++; });
  }
  // 日任务
  for (const k in dayAll) {
    const arr = dayAll[k] || [];
    if (arr.length) dayKeys.add(k);
    arr.forEach(t => { if (t.done) done++; else undone++; });
  }
  document.getElementById('statDone').textContent = done;
  document.getElementById('statUndone').textContent = undone;
  document.getElementById('statDays').textContent = dayKeys.size;
}

const APP_THEME_KEY = 'taskTrackerTheme';
const APP_THEME_OPTIONS = ['caramel','mint','berry','sea'];
function syncThemeOptions() {
  const activeTheme = document.body.dataset.theme || 'caramel';
  document.querySelectorAll('[data-theme-option]').forEach(button => {
    const active = button.dataset.themeOption === activeTheme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function setAppTheme(theme) {
  if (!APP_THEME_OPTIONS.includes(theme)) return;
  document.body.dataset.theme = theme;
  try { localStorage.setItem(APP_THEME_KEY, theme); } catch (_) {}
  syncThemeOptions();
}
function initAppTheme() {
  let theme = 'caramel';
  try { const saved = localStorage.getItem(APP_THEME_KEY); if (APP_THEME_OPTIONS.includes(saved)) theme = saved; } catch (_) {}
  setAppTheme(theme);
}

function editMineName(event) {
  if (event) event.stopPropagation();
  const anchor = document.querySelector('.mine-name');
  showInlineEditor(anchor, '编辑名称', [
    { label:'名称', value:load(KEY_PROFILE_NAME, '我的打卡') }
  ], values => {
    const name = values[0].trim();
    if (!name) { alert('名称不能为空'); return false; }
    save(KEY_PROFILE_NAME, name);
    renderMine();
  });
}

async function exportData() {
  const data = { backupVersion:1, app:'焦糖打卡', exportedAt:new Date().toISOString(), KEY_WEEK, KEY_DAY, KEY_TT, profileName:load(KEY_PROFILE_NAME, '我的打卡'), week: load(KEY_WEEK, {}), day: load(KEY_DAY, {}), tt: load(KEY_TT, {}), bill: load(KEY_BILL, []), pwd: load(KEY_PWD, []), fixed: load(KEY_FIXED, []), fixedIn: load(KEY_FIXED_IN, []), note: load(KEY_NOTE, []) };
  const contents = JSON.stringify(data, null, 2);
  const filename = '焦糖打卡' + dateKey(new Date()) + '.json';
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description:'JSON 备份文件', accept:{ 'application/json':['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([contents], { type:'application/json' }));
      await writable.close();
      alert('备份已保存。');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      alert('无法打开文件保存窗口，将使用浏览器默认下载位置。');
    }
  }
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
function importField(data, alias, legacyKey, expected, label) {
  const value = own(data, alias) ? data[alias] : (legacyKey && own(data, legacyKey) ? data[legacyKey] : undefined);
  if (value === undefined || value === null || (expected === 'object' ? typeof value !== 'object' || Array.isArray(value) : !Array.isArray(value))) {
    throw new Error('备份中的“' + label + '”缺失或格式错误');
  }
  if (expected === 'object' && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error('备份中的“' + label + '”格式错误');
  }
  return value;
}
function refreshVisiblePage() {
  if (currentPage === 'checkin') {
    if (checkinTab === 'week') {
      if (weekView === 'timetable') renderTimetable();
      else render('week');
    } else render('day');
  } else if (currentPage === 'calendar') renderCalendar();
  else if (currentPage === 'bill') renderBill();
  else if (currentPage === 'pwd') renderPwd();
  else if (currentPage === 'note') renderNote();
  renderMine();
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { alert('导入失败：备份文件超过 10 MB。'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('文件内容不是有效的备份对象');
        const staged = [
          [KEY_WEEK, importField(data, 'week', KEY_WEEK, 'object', '周任务')],
          [KEY_DAY, importField(data, 'day', KEY_DAY, 'object', '日任务')],
          [KEY_TT, importField(data, 'tt', KEY_TT, 'object', '周打卡')],
          [KEY_BILL, importField(data, 'bill', KEY_BILL, 'array', '账本')],
          [KEY_PWD, importField(data, 'pwd', KEY_PWD, 'array', '密钥记录')],
          [KEY_FIXED, importField(data, 'fixed', KEY_FIXED, 'array', '固定支出')],
          [KEY_FIXED_IN, importField(data, 'fixedIn', KEY_FIXED_IN, 'array', '固定收入')],
          [KEY_NOTE, importField(data, 'note', KEY_NOTE, 'array', '小纸条')]
        ];
        if (own(data, 'profileName') && typeof data.profileName !== 'string') throw new Error('备份中的名称格式错误');
        for (const [key, value] of staged) {
          JSON.stringify(value);
          const label = key === KEY_WEEK ? '周任务' : key === KEY_DAY ? '日任务' : key === KEY_TT ? '周打卡' : '记录';
          const values = Array.isArray(value) ? null : Object.keys(value).map(period => value[period]);
          const records = Array.isArray(value) ? value : (values || []).reduce((all, items) => all.concat(Array.isArray(items) ? items : []), []);
          if ((!Array.isArray(value) && values.some(items => !Array.isArray(items))) || records.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
            throw new Error('备份中的“' + label + '”包含无法识别的记录');
          }
        }
        if (!confirm('即将用备份覆盖本机的任务、账本、密钥和小纸条数据。建议先导出当前数据。确定导入吗？')) return;

        if (own(data, 'profileName')) staged.push([KEY_PROFILE_NAME, data.profileName]);
        const keys = staged.map(([key]) => key);
        const previous = new Map(keys.map(key => [key, storageOK ? localStorage.getItem(key) : null]));
        const previousMemory = new Map(keys.map(key => [key, memStore[key]]));
        if (storageOK) {
          try {
            for (const [key, value] of staged) localStorage.setItem(key, JSON.stringify(value));
            for (const [key] of staged) delete memStore[key];
          } catch (writeError) {
            for (const key of keys) {
              let restored = false;
              try { const old = previous.get(key); if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old); restored = true; } catch (_) {}
              if (!restored) memStore[key] = previousMemory.get(key) === undefined ? (previous.get(key) === null ? 'null' : previous.get(key)) : previousMemory.get(key);
              else if (previousMemory.get(key) === undefined) delete memStore[key];
              else memStore[key] = previousMemory.get(key);
            }
            throw new Error('浏览器存储空间不足，未能完整写入，原数据已尽量恢复。请先导出备份或清理空间后重试。');
          }
        } else {
          for (const [key, value] of staged) memStore[key] = JSON.stringify(value);
          warnVolatileStorage('导入数据仅保存在本次页面会话中，关闭后可能丢失。请尽快导出备份。');
        }
        refreshVisiblePage();
        alert(storageOK ? '导入完成。' : '导入完成，但当前浏览器不支持永久保存；请保持页面打开并尽快导出备份。');
      } catch(e) { alert('导入失败：' + (e && e.message ? e.message : '文件格式不正确')); }
    };
    reader.onerror = () => alert('导入失败：无法读取所选文件。');
    reader.readAsText(f);
  };
  inp.click();
}

function clearAllData() {
  if (!confirm('确定要清空所有打卡数据吗？此操作不可恢复！')) return;
  save(KEY_WEEK, {});
  save(KEY_DAY, {});
  save(KEY_TT, {});
  save(KEY_BILL, []);
  save(KEY_PWD, []);
  save(KEY_FIXED, []);
  save(KEY_FIXED_IN, []);
  save(KEY_NOTE, []);
  refreshVisiblePage();
}

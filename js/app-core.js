// 仅在确认另一个活动页面在线时，才拦截重复实例。
const APP_INSTANCE_ID = (Date.now() + Math.random()).toString(36);
let APP_DUPLICATE_INSTANCE = false;
function showDuplicateInstanceNotice() {
  if (APP_DUPLICATE_INSTANCE) return;
  APP_DUPLICATE_INSTANCE = true;
  const lock = document.createElement('div');
  lock.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(247,246,243,.97);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:16px sans-serif;color:#1f2329;';
  lock.textContent = '打卡工具已在另一个页面打开，请切换到已打开的页面继续使用。';
  document.body.appendChild(lock);
}
if ('BroadcastChannel' in window) {
 try {
  const appChannel = new BroadcastChannel('checkin-app-single-instance');
  appChannel.onmessage = e => {
    if (e.data && e.data.type === 'hello' && !APP_DUPLICATE_INSTANCE) {
      if (APP_INSTANCE_ID < e.data.id) appChannel.postMessage({ type:'active', id:e.data.id });
      else showDuplicateInstanceNotice();
    }
    if (e.data && e.data.type === 'active' && e.data.id === APP_INSTANCE_ID) showDuplicateInstanceNotice();
  };
  setTimeout(() => appChannel.postMessage({ type:'hello', id:APP_INSTANCE_ID }), 80);
 } catch (e) { /* 某些本地文件预览会限制跨标签通信 */ }
}
const COLORS = 8;
const KEY_WEEK = 'checkin_weeks_v6';
const KEY_DAY  = 'checkin_days_v6';
const KEY_TT   = 'checkin_timetable_v1';
const KEY_BILL = 'checkin_bills_v1';    // 记账
const KEY_PWD  = 'checkin_pwds_v1';     // 密码记录
const KEY_FIXED = 'checkin_fixed_v1';   // 月固定支出
const KEY_FIXED_IN = 'checkin_fixed_in_v1'; // 月固定收入
const KEY_NOTE = 'checkin_notes_v1'; // 小纸条
const KEY_PROFILE_NAME = 'checkin_profile_name_v1';

// 将任务文本渲染为 HTML：转义特殊字符 + 把换行符转成 <br>
function textToHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n/g, '<br>');
}

const memStore = {};
let storageOK = true;
let storageWarningShown = false;
try {
  const storageProbeKey = '__checkin_storage_probe_' + Math.random().toString(36).slice(2);
  localStorage.setItem(storageProbeKey, '1');
  localStorage.removeItem(storageProbeKey);
}
catch(e) { storageOK = false; }
function warnVolatileStorage(message) {
  if (storageWarningShown) return;
  storageWarningShown = true;
  const show = () => {
    const tip = document.createElement('div');
    tip.style.cssText = 'max-width:520px;margin:0 auto 12px;padding:10px 14px;background:#fff7e6;border:1px solid #f5c518;border-radius:12px;font-size:13px;color:#8a6d1a;line-height:1.6;';
    tip.textContent = '⚠️ ' + (message || '浏览器无法永久保存数据，当前修改仅在本次打开期间有效。请尽快导出备份。');
    const app = document.querySelector('.app');
    if (app) app.prepend(tip); else document.body.prepend(tip);
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', show, { once:true });
  else show();
}
if (!storageOK) warnVolatileStorage('当前浏览器环境不支持永久保存，数据仅本次打开期间有效。请尽快导出备份。');
function load(k, f) {
  if (Object.prototype.hasOwnProperty.call(memStore, k)) {
    try { const value = JSON.parse(memStore[k]); return value == null ? f : value; } catch(e) { return f; }
  }
  if (!storageOK) return f;
  try { return JSON.parse(localStorage.getItem(k)) || f; } catch(e) { return f; }
}
function save(k, d) {
  const s = JSON.stringify(d);
  if (!storageOK) { memStore[k] = s; return false; }
  try { localStorage.setItem(k, s); delete memStore[k]; return true; }
  catch(e) { memStore[k] = s; warnVolatileStorage('浏览器保存失败（可能是存储空间不足或受限），本次修改暂存在内存中，关闭页面后可能丢失。请尽快导出备份。'); return false; }
}

// 通用页内编辑栏：直接插入到被编辑记录之后，不弹出模态窗口。
let activeInlineEditor = null;
let activeInlineAnchor = null;
let activeInlineAnchorHTML = null;
let activeInlineReposition = null;
let activeInlineVisualViewport = null;
let activeInlineBackdrop = null;
let inlineEditorOpenedByLongPress = false;
let suppressNextInlineEditorClick = false;
let inlineEditorOpeningAnchor = null;
function dismissInlineEditor() {
  if (activeInlineReposition) {
    window.removeEventListener('scroll', activeInlineReposition, true);
    window.removeEventListener('resize', activeInlineReposition);
    if (activeInlineVisualViewport) {
      activeInlineVisualViewport.removeEventListener('resize', activeInlineReposition);
      activeInlineVisualViewport.removeEventListener('scroll', activeInlineReposition);
      activeInlineVisualViewport = null;
    }
    activeInlineReposition = null;
  }
  const closingEditor = activeInlineEditor;
  const closingBackdrop = activeInlineBackdrop;
  if (closingEditor) closingEditor.classList.add('closing');
  if (closingBackdrop) closingBackdrop.classList.add('closing');
  if (closingEditor || closingBackdrop) setTimeout(() => {
    if (closingEditor) closingEditor.remove();
    if (closingBackdrop) closingBackdrop.remove();
  }, 190);
  activeInlineBackdrop = null;
  inlineEditorOpenedByLongPress = false;
  document.body.classList.remove('inline-editing');
  if (activeInlineAnchor && activeInlineAnchorHTML !== null && activeInlineAnchor.matches('.cal-add,.bill-add,.pwd-add,.checkin-add-btn')) activeInlineAnchor.innerHTML = activeInlineAnchorHTML;
  activeInlineEditor = null; activeInlineAnchor = null; activeInlineAnchorHTML = null;
}
function beginDirectTextEdit(el, event, options) {
  if (!el || el.dataset.directEditing === 'true') return;
  const originalValue = String(options.value ?? '');
  const displayValue = String(options.displayValue ?? originalValue);
  let finished = false;
  el.dataset.directEditing = 'true';
  el.contentEditable = 'plaintext-only';
  el.classList.add('direct-editing');
  el.textContent = originalValue;
  const onBlur = () => finish(true);
  const onKeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); el.blur(); }
    else if (e.key === 'Enter' && !options.multiline) { e.preventDefault(); finish(true); el.blur(); }
    else if (e.key === 'Enter' && options.multiline && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); el.blur(); }
  };
  const cleanup = () => { el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKeydown); };
  const finish = commit => {
    if (finished) return;
    finished = true;
    cleanup();
    const value = (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
    el.removeAttribute('contenteditable');
    delete el.dataset.directEditing;
    el.classList.remove('direct-editing');
    if (commit && (value || options.allowEmpty) && value !== originalValue) {
      const saved = options.save(value);
      if (saved === false) el.textContent = displayValue;
    } else el.textContent = displayValue;
    if (options.onFinish) options.onFinish(commit);
  };
  el.addEventListener('blur', onBlur, { once:true });
  el.addEventListener('keydown', onKeydown);
  el.focus();
  if (options.caretAtEnd) {
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  } else if (event && Number.isFinite(event.clientX) && document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && el.contains(range.startContainer)) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  }
}
document.addEventListener('click', e => {
  const inForm = e.target.closest('.inline-editor,.inline-add-form,.pwd-add-fields');
  if (!inForm && !activeInlineEditor) document.body.classList.remove('inline-editing');
  if (!activeInlineEditor || activeInlineEditor.contains(e.target)) return;
  if (inlineEditorOpeningAnchor && (e.target === inlineEditorOpeningAnchor || inlineEditorOpeningAnchor.contains(e.target))) return;
  dismissInlineEditor();
});
document.addEventListener('focusin', e => {
  if (e.target.closest('.inline-editor,.inline-add-form,.pwd-add-fields')) document.body.classList.add('inline-editing');
});
function markLongPressEditorRelease() {
  if (!inlineEditorOpenedByLongPress || !activeInlineBackdrop) return;
  inlineEditorOpenedByLongPress = false;
  suppressNextInlineEditorClick = true;
  setTimeout(() => { suppressNextInlineEditorClick = false; }, 1200);
}
document.addEventListener('pointerup', markLongPressEditorRelease, true);
document.addEventListener('touchend', markLongPressEditorRelease, true);
document.addEventListener('mouseup', markLongPressEditorRelease, true);
document.addEventListener('pointercancel', () => { inlineEditorOpenedByLongPress = false; }, true);
document.addEventListener('touchcancel', () => { inlineEditorOpenedByLongPress = false; }, true);
document.addEventListener('pointerdown', () => { suppressNextInlineEditorClick = false; }, true);
document.addEventListener('click', e => {
  if (!suppressNextInlineEditorClick) return;
  suppressNextInlineEditorClick = false;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
function showInlineEditor(anchor, title, fields, onSave, onCancel, onDelete, placement) {
  if (activeInlineEditor && !activeInlineEditor.isConnected) {
    activeInlineEditor = null; activeInlineAnchor = null; activeInlineAnchorHTML = null;
    document.body.classList.remove('inline-editing');
  }
  if (activeInlineEditor && activeInlineAnchor === anchor) { dismissInlineEditor(); return null; }
  dismissInlineEditor();
  document.querySelectorAll('.inline-editor:not(.closing),.tile-editor-backdrop:not(.closing)').forEach(x => x.remove());
  const tilePlacement = ['below-tile', 'centered-tile'].includes(placement) && anchor && anchor.classList.contains('tile');
  const centeredTilePlacement = placement === 'centered-tile' && tilePlacement;
  inlineEditorOpenedByLongPress = !!tilePlacement;
  if (tilePlacement && !centeredTilePlacement) anchor.scrollIntoView({ block:'center', inline:'nearest' });
  const editor = document.createElement('div');
  editor.className = 'inline-editor';
  const heading = document.createElement('div');
  heading.className = 'inline-editor-title'; heading.textContent = title;
  editor.appendChild(heading);
  const controls = [];
  let timeRow = null;
  let timeFieldCount = 0;
  fields.forEach(f => {
    const field = document.createElement('label');
    field.className = 'inline-editor-field';
    if (f.className) field.classList.add(f.className);
    const label = document.createElement('span');
    label.textContent = f.label || '';
    const input = f.type === 'textarea' ? document.createElement('textarea') : f.type === 'select' ? document.createElement('select') : f.type === 'choice' ? document.createElement('div') : document.createElement('input');
    if (f.type !== 'textarea' && f.type !== 'select' && f.type !== 'choice') input.type = f.type || 'text';
    if (f.type === 'select') (f.options || []).forEach(option => {
      const opt = document.createElement('option');
      opt.value = String(option.value); opt.textContent = option.label; input.appendChild(opt);
    });
    if (f.type === 'choice') {
      input.className = 'inline-choice'; input.value = String(f.value ?? '');
      (f.options || []).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'inline-choice-btn'; button.textContent = option.label;
        button.classList.toggle('active', String(option.value) === input.value);
        button.addEventListener('click', () => {
          input.value = String(option.value);
          input.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
        });
        input.appendChild(button);
      });
    }
    if (f.min != null) input.min = f.min;
    if (f.max != null) input.max = f.max;
    if (f.step != null) input.step = f.step;
    if (f.maxLength != null) input.maxLength = f.maxLength;
    if (f.inputmode) input.inputMode = f.inputmode;
    if (f.type === 'textarea') input.rows = 3;
    input.placeholder = f.placeholder || '';
    input.value = f.value == null ? '' : f.value;
    if (!f.hideLabel) field.appendChild(label);
    field.appendChild(input);
    if (f.className === 'time-part') {
      if (!timeRow) {
        timeRow = document.createElement('div'); timeRow.className = 'inline-time-row';
        const timeLabel = document.createElement('span'); timeLabel.className = 'inline-time-label'; timeLabel.textContent = '时间（可选）';
        timeRow.appendChild(timeLabel); editor.appendChild(timeRow);
      }
      if (timeFieldCount > 0) { const sep = document.createElement('span'); sep.className = 'inline-time-separator'; sep.textContent = ':'; timeRow.appendChild(sep); }
      timeRow.appendChild(field); timeFieldCount++;
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); });
    } else editor.appendChild(field);
    controls.push(input);
  });
  const actions = document.createElement('div');
  actions.className = 'inline-editor-actions';
  if (onDelete) {
    const del = document.createElement('button'); del.type = 'button'; del.className = 'delete'; del.textContent = '删除';
    del.addEventListener('click', () => { onDelete(); dismissInlineEditor(); });
    actions.appendChild(del);
  }
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'save'; save.textContent = '保存';
  actions.appendChild(cancel); actions.appendChild(save); editor.appendChild(actions);
  editor.addEventListener('click', e => e.stopPropagation());
  activeInlineEditor = editor; activeInlineAnchor = anchor;
  document.body.classList.add('inline-editing');
  inlineEditorOpeningAnchor = anchor;
  queueMicrotask(() => { inlineEditorOpeningAnchor = null; });
  if (tilePlacement) editor.classList.add('tile-editor');
  if (anchor && anchor.matches('.cal-add,.bill-add,.pwd-add,.checkin-add-btn')) {
    editor.classList.add('add-editor');
    activeInlineAnchorHTML = anchor.innerHTML;
    anchor.textContent = '− 收起';
  }
  cancel.addEventListener('click', () => { dismissInlineEditor(); if (onCancel) onCancel(); });
  save.addEventListener('click', () => {
    const values = controls.map(x => x.value); const result = onSave(values);
    if (result !== false) dismissInlineEditor();
  });
  if (tilePlacement) {
    activeInlineBackdrop = document.createElement('div');
    activeInlineBackdrop.className = 'tile-editor-backdrop';
    document.body.appendChild(activeInlineBackdrop);
    document.body.appendChild(editor);
    const placeEditor = () => {
      if (!anchor.isConnected || !editor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const width = Math.min(420, vw - 24);
      const viewport = window.visualViewport;
      const viewportTop = viewport ? viewport.offsetTop : 0;
      const viewportHeight = viewport ? viewport.height : window.innerHeight;
      const left = centeredTilePlacement
        ? Math.max(12, (vw - width) / 2)
        : Math.max(12, Math.min(vw - width - 12, rect.left + rect.width / 2 - width / 2));
      editor.style.left = left + 'px';
      editor.style.width = width + 'px';
      if (centeredTilePlacement) {
        editor.style.maxHeight = Math.max(96, viewportHeight - 24) + 'px';
        const editorHeight = editor.getBoundingClientRect().height;
        editor.style.top = Math.max(viewportTop + 12, viewportTop + (viewportHeight - editorHeight) / 2) + 'px';
      } else {
        const top = Math.max(8, rect.bottom + 7);
        const bottomSpace = window.innerHeight - top - 12;
        editor.style.top = top + 'px';
        editor.style.maxHeight = Math.max(96, bottomSpace) + 'px';
      }
    };
    activeInlineReposition = placeEditor;
    window.addEventListener('scroll', placeEditor, true);
    window.addEventListener('resize', placeEditor);
    if (centeredTilePlacement && window.visualViewport) {
      activeInlineVisualViewport = window.visualViewport;
      activeInlineVisualViewport.addEventListener('resize', placeEditor);
      activeInlineVisualViewport.addEventListener('scroll', placeEditor);
    }
    placeEditor();
  }
  else if (anchor && anchor.parentNode) anchor.after(editor);
  else document.querySelector('.main-content').appendChild(editor);
  if (controls[0] && controls[0].focus) controls[0].focus();
  return editor;
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function splitTimeFields(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? [match[1], match[2]] : ['', ''];
}
function makeTimeFields(value) {
  const [hour, minute] = splitTimeFields(value);
  return [
    { label:'小时', placeholder:'小时', type:'text', className:'time-part', maxLength:2, inputmode:'numeric', value:hour },
    { label:'分钟', placeholder:'分钟', type:'text', className:'time-part', maxLength:2, inputmode:'numeric', value:minute }
  ];
}
function readTimeFields(values, index) {
  const rawHour = String(values[index] || '').trim();
  const rawMinute = String(values[index + 1] || '').trim();
  if (!rawHour && !rawMinute) return '';
  const hour = rawHour ? Number(rawHour) : 0;
  const minute = rawMinute ? Number(rawMinute) : 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return pad(hour) + ':' + pad(minute);
}
function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function getMonday(d) {
  const x = new Date(d); const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); x.setHours(0,0,0,0); return x;
}
function weekKey(d) { return dateKey(getMonday(d)); }

let currentPage = 'checkin';
let currentWeekStart = getMonday(new Date());
let currentDayDate = new Date();
let dialogScope = null;
let menuTile = null;
let menuScope = null;
// 日历待办状态
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();      // 0-11
let calSelKey = dateKey(new Date());
// 周打卡视图状态：board=面板, timetable=课程表
let weekView = 'board';

let checkinTab = 'week';
function switchCheckinTab(tab) {
  checkinTab = tab;
  const dayMatch = /^day-(\d)$/.exec(tab);
  const showDay = !!dayMatch;
  if (showDay) {
    currentDayDate = new Date(currentWeekStart);
    currentDayDate.setDate(currentWeekStart.getDate() + Number(dayMatch[1]));
  }
  const title = document.querySelector('#' + (showDay ? 'day' : 'week') + ' .topbar h1');
  if (title) { title.textContent = ''; title.style.display = 'none'; }
  document.getElementById('week').classList.toggle('hidden', showDay);
  document.getElementById('day').classList.toggle('hidden', !showDay);
  document.querySelectorAll('.checkin-tabs .vt-btn').forEach(b => b.classList.toggle('active', b.dataset.checkin === tab));
  if (showDay) render('day');
  else switchWeekView('board');
}
function goPage(page) {
  if (page === 'week') { checkinTab = 'week'; page = 'checkin'; }
  if (page === 'day') { checkinTab = 'day-' + ((new Date().getDay() + 6) % 7); page = 'checkin'; }
  currentPage = page;
  document.getElementById('week').classList.toggle('hidden', page !== 'checkin' || checkinTab !== 'week');
  document.getElementById('day').classList.toggle('hidden', page !== 'checkin' || checkinTab === 'week');
  document.getElementById('calendar').classList.toggle('hidden', page !== 'calendar');
  document.getElementById('bill').classList.toggle('hidden', page !== 'bill');
  document.getElementById('pwd').classList.toggle('hidden', page !== 'pwd');
  document.getElementById('note').classList.toggle('hidden', page !== 'note');
  document.getElementById('mine').classList.toggle('hidden', page !== 'mine');
  document.querySelectorAll('.side-link').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'checkin') switchCheckinTab(checkinTab);
  if (page === 'calendar') renderCalendar();
  if (page === 'bill') { billType = 'expense'; billTab = 'year'; billYear = new Date().getFullYear(); billMonth = new Date().getMonth(); switchBillType('expense'); }
  if (page === 'pwd') renderPwd();
  if (page === 'note') renderNote();
  if (page === 'mine') renderMine();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const activeViewId = page === 'checkin' ? (checkinTab === 'week' ? 'week' : 'day') : page;
  const activeView = document.getElementById(activeViewId);
  if (activeView) {
    activeView.classList.remove('page-enter');
    void activeView.offsetWidth;
    activeView.classList.add('page-enter');
  }
}

function getData(scope) {
  const dataKey = scope === 'week' ? weekKey(currentWeekStart) : dateKey(currentDayDate);
  const all = load(scope === 'week' ? KEY_WEEK : KEY_DAY, {});
  return { dataKey, tasks: all[dataKey] || [] };
}
function setData(scope, tasks) {
  const storeKey = scope === 'week' ? KEY_WEEK : KEY_DAY;
  const dataKey = scope === 'week' ? weekKey(currentWeekStart) : dateKey(currentDayDate);
  const all = load(storeKey, {});
  all[dataKey] = tasks; save(storeKey, all);
}

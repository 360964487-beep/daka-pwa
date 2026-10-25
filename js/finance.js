// ===== 记账 =====
// 记录字段：{ id, type:'income'|'expense', amount:number, text, note, cat, dateKey }
// 一级切换：支出/收入（billType，默认支出）
// 二级切换：年账单/固定（billTab）；年账单点某月进入月度明细(billTab='month')
let billType = 'expense';                    // 'expense' | 'income'
let billTab = 'year';                        // 'year' | 'fixed' | 'month'(月度明细内部态)
let billYear = new Date().getFullYear();
let billMonth = new Date().getMonth();       // 0-11
let billUnknownMode = false;                 // 是否查看未知日期记录
let billExpandedKey = null;
let billMonthPanel = null;
let billMonthAnimationToken = 0;
let billMonthAnimationFrame = 0;
let billMonthAnimationCleanup = null;
let billEditingId = null;
function billGetAll() { return load(KEY_BILL, []); }
function billSaveAll(list) { save(KEY_BILL, list); }
function fmtMoney(n) {
  return '¥' + (Math.round(n * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function switchBillType(type) {
  document.body.dataset.billType = type;
  billEditingId = null;
  if (document.getElementById('billEditorText')) billClearEditor();
  billType = type;
  document.getElementById('billTabExpense').classList.toggle('active', type === 'expense');
  document.getElementById('billTabIncome').classList.toggle('active', type === 'income');
  // 切换收支时，保持年账单/固定 的当前 tab，但若在月度明细则回到年账单
  if (billTab === 'month') billTab = 'year';
  switchBillTab(billTab);
}
function switchBillTab(tab) {
  billTab = tab;
  // 切到年账单/固定时，退出未知模式
  if (tab !== 'month') billUnknownMode = billExpandedKey === 'unknown';
  document.getElementById('billTabYear').classList.toggle('active', tab === 'year');
  document.getElementById('billTabFixed').classList.toggle('active', tab === 'fixed');
  document.getElementById('billYearView').classList.toggle('hidden', tab !== 'year');
  document.getElementById('billMonthView').classList.toggle('hidden', tab !== 'year' || billExpandedKey === null);
  document.getElementById('billFixedView').classList.toggle('hidden', tab !== 'fixed');
  // 固定模块文案跟随收支
  const isExpense = billType === 'expense';
  document.getElementById('billFixedHint').textContent = isExpense
    ? '每月自动计入的固定扣费（话费、会员费等），会累加到月度明细与年账单。长按右侧手柄可调整顺序。'
    : '每月自动计入的固定进账（工资、零花钱等），会累加到月度明细与年账单。长按右侧手柄可调整顺序。';
  document.getElementById('billFixedAddTitle').textContent = isExpense ? '添加固定支出' : '添加固定收入';
  renderBill();
}
function billToggleMonth(key) {
  if (billExpandedKey === key) {
    billExpandedKey = null;
    billUnknownMode = false;
    billEditingId = null;
    billClearEditor();
    document.querySelectorAll('#billYearRows .month-row.expanded').forEach(row => row.classList.remove('expanded'));
    animateBillMonthPanel(false, () => {
      renderBill();
    });
  } else {
    billExpandedKey = key;
    billUnknownMode = key === 'unknown';
    if (!billUnknownMode) billMonth = key;
    billEditingId = null;
    billClearEditor();
    renderBill();
    animateBillMonthPanel(true);
  }
}
function animateBillMonthPanel(open, onComplete) {
  if (!billMonthPanel) billMonthPanel = document.getElementById('billMonthView');
  const panel = billMonthPanel;
  const token = ++billMonthAnimationToken;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (billMonthAnimationFrame) cancelAnimationFrame(billMonthAnimationFrame);
  if (billMonthAnimationCleanup) {
    billMonthAnimationCleanup();
    billMonthAnimationCleanup = null;
  }
  const wasAnimating = !!panel.style.height && !!panel.style.transition;
  const currentHeight = wasAnimating ? panel.getBoundingClientRect().height : (open ? 0 : panel.getBoundingClientRect().height);
  const currentOpacity = wasAnimating ? getComputedStyle(panel).opacity : (open ? '0' : '1');
  const currentTransform = wasAnimating ? getComputedStyle(panel).transform : (open ? 'translateY(-7px)' : 'translateY(0)');
  const targetHeight = open ? panel.scrollHeight : 0;
  const duration = reducedMotion ? 0 : Math.max(190, Math.min(360, Math.round(Math.abs(targetHeight - currentHeight) * 0.42)));
  panel.style.transition = 'none';
  panel.style.overflow = 'hidden';
  panel.style.willChange = 'height, opacity, transform';
  panel.style.height = currentHeight + 'px';
  panel.style.opacity = currentOpacity;
  panel.style.transform = currentTransform;
  if (!open && (panel.classList.contains('hidden') || !panel.getClientRects().length)) {
    clearMotion();
    if (onComplete) onComplete();
    return;
  }
  void panel.offsetHeight;
  billMonthAnimationFrame = requestAnimationFrame(() => {
    billMonthAnimationFrame = 0;
    if (token !== billMonthAnimationToken || !panel.isConnected) return;
    const easing = 'cubic-bezier(.22,.72,.24,1)';
    panel.style.transition = `height ${duration}ms ${easing}, opacity ${Math.min(duration, 230)}ms ease, transform ${duration}ms ${easing}`;
    panel.style.height = targetHeight + 'px';
    panel.style.opacity = open ? '1' : '0';
    panel.style.transform = open ? 'translateY(0)' : 'translateY(-4px)';
    finish();
  });

  function finish() {
    let settled = false;
    let timer = 0;
    const cleanupListener = () => {
      panel.removeEventListener('transitionend', done);
      if (timer) clearTimeout(timer);
      if (billMonthAnimationCleanup === cleanupListener) billMonthAnimationCleanup = null;
    };
    const done = event => {
      if (settled || (event && (event.target !== panel || event.propertyName !== 'height'))) return;
      settled = true;
      cleanupListener();
      if (token !== billMonthAnimationToken) return;
      clearMotion();
      if (onComplete) onComplete();
    };
    panel.addEventListener('transitionend', done);
    timer = setTimeout(done, duration + 60);
    billMonthAnimationCleanup = cleanupListener;
    if (!duration) done();
  }
  function clearMotion() {
    panel.style.transition = '';
    panel.style.height = '';
    panel.style.opacity = '';
    panel.style.overflow = '';
    panel.style.willChange = '';
    panel.style.transform = '';
  }
}
function billShiftYear(delta) { billYear += delta; renderBill(); }

// 固定项（支出/收入）
function billFixedGetAll() { return load(KEY_FIXED, []); }
function billFixedSaveAll(list) { save(KEY_FIXED, list); }
function billFixedInGetAll() { return load(KEY_FIXED_IN, []); }
function billFixedInSaveAll(list) { save(KEY_FIXED_IN, list); }
function currentFixedList() { return billType === 'expense' ? billFixedGetAll() : billFixedInGetAll(); }

function renderBill() {
  if (!billMonthPanel) billMonthPanel = document.getElementById('billMonthView');
  const list = billGetAll();
  const fixedOut = billFixedGetAll();
  const fixedIn = billFixedInGetAll();
  const fixedOutTotal = fixedOut.reduce((s, f) => s + (f.amount || 0), 0);
  const fixedInTotal = fixedIn.reduce((s, f) => s + (f.amount || 0), 0);
  const isExpense = billType === 'expense';
  const TYPE = isExpense ? 'expense' : 'income';

  // ===== 月度明细 =====
  let monthList;
  if (billUnknownMode) {
    // 未知月份：dateKey 为空的记录
    monthList = list.filter(b => (!b.dateKey) && b.type === TYPE);
    document.getElementById('billMonthTitle').textContent = '其他日期';
  } else {
    const monthPrefix = billYear + '-' + pad(billMonth + 1);
    monthList = list.filter(b => b.dateKey && b.dateKey.startsWith(monthPrefix) && b.type === TYPE);
    document.getElementById('billMonthTitle').textContent = billYear + ' 年 ' + (billMonth + 1) + ' 月';
  }
  const monthFixed = billUnknownMode ? 0 : (isExpense ? fixedOutTotal : fixedInTotal);
  const monthTotal = monthList.reduce((s, b) => s + b.amount, 0) + monthFixed;
  document.getElementById('billMonthSummary').innerHTML =
    '<span class="hs-amt ' + TYPE + '">' + fmtMoney(monthTotal) + '</span>' +
    '<span class="hs-sub">' + monthList.length + ' 笔</span>';
  const mRows = document.getElementById('billMonthRows');
  mRows.innerHTML = '';
  // 固定项汇总行（置顶；未知模式无固定）
  const curFixed = currentFixedList();
  const hasAnyMonth = monthList.length || (!billUnknownMode && curFixed.length);
  if (!hasAnyMonth) {
    const e = document.createElement('div');
    e.className = 'bill-empty';
    e.textContent = billUnknownMode
      ? (isExpense ? '还没有其他日期的支出记录' : '还没有其他日期的收入记录')
      : (isExpense ? '本月还没有支出，可在上方添加' : '本月还没有收入，可在上方添加');
    mRows.appendChild(e);
  } else {
    if (!billUnknownMode && curFixed.length) {
      const fRow = document.createElement('div');
      fRow.className = 'bill-row fixed-row';
      const fName = document.createElement('div');
      fName.className = 'br-name';
      fName.textContent = isExpense ? '月固定支出' : '月固定收入';
      const fSub = document.createElement('span');
      fSub.className = 'br-sub'; fSub.textContent = curFixed.map(x => x.name).join('、');
      fName.appendChild(fSub);
      const fAmt = document.createElement('div');
      fAmt.className = 'br-amt ' + TYPE; fAmt.textContent = (isExpense ? '-' : '+') + fmtMoney(monthFixed);
      fRow.appendChild(fName); fRow.appendChild(fAmt);
      fRow.style.cursor = 'default';
      mRows.appendChild(fRow);
    }
    monthList.slice().sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || '')).forEach(b => {
      const row = document.createElement('div');
      row.className = 'bill-row';
      const name = document.createElement('div');
      name.className = 'br-name';
      const nameText = document.createElement('span');
      nameText.className = 'br-main-name inline-editable';
      nameText.textContent = b.text || (isExpense ? '支出' : '收入');
      nameText.addEventListener('click', e => {
        e.stopPropagation();
        beginDirectTextEdit(nameText, e, { value:b.text || (isExpense ? '支出' : '收入'), save:value => {
          if (!value) return false;
          const all = billGetAll(), item = all.find(x => x.id === b.id); if (!item) return false;
          item.text = value; billSaveAll(all); renderBill();
        }});
      });
      name.appendChild(nameText);
      if (b.note) {
        const sub = document.createElement('span');
        sub.className = 'br-sub inline-editable'; sub.textContent = b.note;
        sub.addEventListener('click', e => {
          e.stopPropagation();
          beginDirectTextEdit(sub, e, { value:b.note || '', allowEmpty:true, save:value => {
            const all = billGetAll(), item = all.find(x => x.id === b.id); if (!item) return false;
            item.note = value; billSaveAll(all); renderBill();
          }});
        });
        name.appendChild(sub);
      }
      const amt = document.createElement('div');
      amt.className = 'br-amt ' + b.type;
      amt.textContent = (b.type === 'income' ? '+' : '-') + fmtMoney(b.amount);
      amt.classList.add('inline-editable');
      amt.addEventListener('click', e => {
        e.stopPropagation();
        beginDirectTextEdit(amt, e, { value:String(b.amount), displayValue:(b.type === 'income' ? '+' : '-') + fmtMoney(b.amount), save:value => {
          const amount = Number(value.replace(/[^0-9.]/g, ''));
          if (!Number.isFinite(amount) || amount <= 0) { alert('金额无效'); return false; }
          const all = billGetAll(), item = all.find(x => x.id === b.id); if (!item) return false;
          item.amount = amount; billSaveAll(all); renderBill();
        }});
      });
      const del = document.createElement('button');
      del.className = 'br-del'; del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('确定删除这条账目吗？')) return;
        billSaveAll(billGetAll().filter(x => x.id !== b.id)); renderBill();
      });
      row.appendChild(name); row.appendChild(amt); row.appendChild(del);
      row.classList.add('bill-editable');
      mRows.appendChild(row);
    });
  }

  // ===== 年账单 =====
  document.getElementById('billYearTitle').textContent = billYear + ' 年';
  const yearPrefix = String(billYear);
  const yearList = list.filter(b => b.dateKey && b.dateKey.startsWith(yearPrefix) && b.type === TYPE);
  // 未知日期记录（dateKey 为空）
  const unknownList = list.filter(b => (!b.dateKey) && b.type === TYPE);
  const unknownTotal = unknownList.reduce((s, b) => s + b.amount, 0);
  const yearFixed = (isExpense ? fixedOutTotal : fixedInTotal) * 12;
  const yearTotal = yearList.reduce((s, b) => s + b.amount, 0) + unknownTotal + yearFixed;
  document.getElementById('billYearSummary').innerHTML =
    '<span class="hs-amt ' + TYPE + '">' + fmtMoney(yearTotal) + '</span>' +
    '<span class="hs-sub">' + (yearList.length + unknownList.length) + ' 笔</span>';
  const yRows = document.getElementById('billYearRows');
  yRows.innerHTML = '';
  // 未知日期行
  let expandedRow = null;
  {
    const row = document.createElement('div');
    row.className = 'bill-row month-row' + (billExpandedKey === 'unknown' ? ' expanded' : '');
    const name = document.createElement('div');
    name.className = 'br-name'; name.textContent = '其他';
    if (unknownTotal > 0) {
      const sub = document.createElement('span');
      sub.className = 'br-sub'; sub.textContent = fmtMoney(unknownTotal) + '（' + unknownList.length + ' 笔）';
      name.appendChild(sub);
    }
    const amt = document.createElement('div');
    amt.className = 'br-amt ' + TYPE;
    amt.textContent = unknownTotal > 0 ? fmtMoney(unknownTotal) : '—';
    row.appendChild(name); row.appendChild(amt);
    row.addEventListener('click', () => billToggleMonth('unknown'));
    if (billExpandedKey === 'unknown') expandedRow = row;
    yRows.appendChild(row);
  }
  // 每月合计：1月~12月
  const byMonth = Array.from({ length: 12 }, () => 0);
  yearList.forEach(b => {
    const m = parseInt(String(b.dateKey).slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) byMonth[m] += b.amount;
  });
  const monthFixedEach = isExpense ? fixedOutTotal : fixedInTotal;
  for (let m = 0; m < 12; m++) {
    const total = byMonth[m] + monthFixedEach;
    const row = document.createElement('div');
    row.className = 'bill-row month-row' + (billExpandedKey === m ? ' expanded' : '');
    const name = document.createElement('div');
    name.className = 'br-name'; name.textContent = (m + 1) + '月';
    if (monthFixedEach > 0) {
      const sub = document.createElement('span');
      sub.className = 'br-sub';
      sub.textContent = '（含固定 ' + fmtMoney(monthFixedEach) + '）';
      name.appendChild(sub);
    }
    const amt = document.createElement('div');
    amt.className = 'br-amt ' + TYPE;
    amt.textContent = total > 0 ? fmtMoney(total) : '—';
    row.appendChild(name); row.appendChild(amt);
    row.addEventListener('click', () => billToggleMonth(m));
    if (billExpandedKey === m) expandedRow = row;
    yRows.appendChild(row);
  }

  const monthView = billMonthPanel;
  const monthPlaceholder = document.getElementById('billMonthPlaceholder');
  if (billTab === 'year' && expandedRow) {
    expandedRow.after(monthView);
    monthView.classList.remove('hidden');
  } else {
    monthPlaceholder.appendChild(monthView);
    monthView.classList.add('hidden');
  }

  // ===== 固定（支出/收入跟随） =====
  renderBillFixed(curFixed);
}

function billClearEditor() {
  document.getElementById('billEditorText').value = '';
  document.getElementById('billEditorAmount').value = '';
  document.getElementById('billEditorTitle').textContent = '添加账目';
  document.getElementById('billEditorSave').textContent = '添加';
  document.getElementById('billEditorCancel').classList.add('hidden');
}
function billStartEdit(b, anchor) {
  showInlineEditor(anchor, '编辑账目', [
    { label:'项目内容', type:'text', value:b.text || '' },
    { label:'金额', type:'number', value:String(b.amount || '') }
  ], values => {
    const text = values[0].trim();
    const amount = parseFloat(values[1]);
    if (!text) { alert('请填写项目内容'); return false; }
    if (isNaN(amount) || amount <= 0) { alert('金额无效'); return false; }
    const list = billGetAll();
    const item = list.find(x => x.id === b.id);
    if (item) { item.text = text; item.amount = amount; }
    billSaveAll(list); renderBill();
  });
}
function billCancelEdit() { billEditingId = null; billClearEditor(); }
function billAdd() { billCancelEdit(); document.getElementById('billEditorText').focus(); }
function billSaveEditor() {
  const text = document.getElementById('billEditorText').value.trim();
  const amount = parseFloat(document.getElementById('billEditorAmount').value);
  if (!text) { alert('请填写项目内容'); return; }
  if (isNaN(amount) || amount <= 0) { alert('金额无效'); return false; }
  const list = billGetAll();
  if (billEditingId != null) {
    const item = list.find(x => x.id === billEditingId);
    if (item) { item.text = text; item.amount = amount; }
  } else {
    const dateKeyStr = billUnknownMode ? '' : billYear + '-' + pad(billMonth + 1) + '-01';
    list.push({ id:Date.now() + Math.random(), type:billType, amount, text, note:'', cat:'other', dateKey:dateKeyStr });
  }
  billSaveAll(list);
  billEditingId = null;
  billClearEditor();
  renderBill();
}

// ===== 固定（支出/收入）渲染与增删 =====
// 字段：{ id, name, amount }
function renderBillFixed(fixed) {
  const container = document.getElementById('billFixedRows');
  const isExpense = billType === 'expense';
  container.innerHTML = '';
  if (!fixed.length) {
    const e = document.createElement('div');
    e.className = 'bill-empty';
    e.textContent = isExpense ? '还没有固定支出' : '还没有固定收入';
    container.appendChild(e);
    return;
  }
  const total = fixed.reduce((s, f) => s + (f.amount || 0), 0);
  fixed.forEach(f => {
    const getFn = isExpense ? billFixedGetAll : billFixedInGetAll;
    const saveFn = isExpense ? billFixedSaveAll : billFixedInSaveAll;
    const row = document.createElement('div');
    row.className = 'bill-row';
    const name = document.createElement('div');
    name.className = 'br-name';
    const nameText = document.createElement('span');
    nameText.className = 'inline-editable'; nameText.textContent = f.name || '未命名';
    nameText.addEventListener('click', e => {
      e.stopPropagation();
      beginDirectTextEdit(nameText, e, { value:f.name || '未命名', save:value => {
        if (!value) return false;
        const all = getFn(), item = all.find(x => x.id === f.id); if (!item) return false;
        item.name = value; saveFn(all); renderBill();
      }});
    });
    name.appendChild(nameText);
    const sub = document.createElement('span');
    sub.className = 'br-sub'; sub.textContent = '每月固定';
    name.appendChild(sub);
    const amt = document.createElement('div');
    amt.className = 'br-amt ' + (isExpense ? 'expense' : 'income');
    amt.textContent = (isExpense ? '-' : '+') + fmtMoney(f.amount || 0);
    amt.classList.add('inline-editable');
    amt.addEventListener('click', e => {
      e.stopPropagation();
      beginDirectTextEdit(amt, e, { value:String(f.amount || ''), displayValue:(isExpense ? '-' : '+') + fmtMoney(f.amount || 0), save:value => {
        const amount = Number(value.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) { alert('金额无效'); return false; }
        const all = getFn(), item = all.find(x => x.id === f.id); if (!item) return false;
        item.amount = amount; saveFn(all); renderBill();
      }});
    });
    const del = document.createElement('button');
    del.className = 'br-del'; del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('删除固定' + (isExpense ? '支出' : '收入') + '「' + (f.name || '') + '」？')) return;
      const saveFn = isExpense ? billFixedSaveAll : billFixedInSaveAll;
      const getFn = isExpense ? billFixedGetAll : billFixedInGetAll;
      saveFn(getFn().filter(x => x.id !== f.id)); renderBill();
    });
    row.appendChild(name); row.appendChild(amt); row.appendChild(del);
    row.classList.add('bill-editable');
    container.appendChild(row);
  });
  // 底部合计行
  const tRow = document.createElement('div');
  tRow.className = 'bill-row bill-total-row';
  tRow.style.borderTop = '1px solid #e8eaed';
  tRow.style.fontWeight = '600';
  const tName = document.createElement('div');
  tName.className = 'br-name'; tName.textContent = (isExpense ? '每月固定支出合计' : '每月固定收入合计');
  const tAmt = document.createElement('div');
  tAmt.className = 'br-amt ' + (isExpense ? 'expense' : 'income');
  tAmt.textContent = (isExpense ? '-' : '+') + fmtMoney(total);
  tRow.appendChild(tName); tRow.appendChild(tAmt);
  container.appendChild(tRow);
}
function billFixedAdd() {
  const isExpense = billType === 'expense';
  const nameInput = document.getElementById('billFixedAddName');
  const amountInput = document.getElementById('billFixedAddAmount');
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  if (!name) { alert('请填写名称'); return; }
  if (isNaN(amount) || amount <= 0) { alert('金额无效'); return; }
  const getFn = isExpense ? billFixedGetAll : billFixedInGetAll;
  const saveFn = isExpense ? billFixedSaveAll : billFixedInSaveAll;
  const list = getFn();
  list.push({ id: Date.now() + Math.random(), name, amount });
  saveFn(list);
  nameInput.value = ''; amountInput.value = '';
  document.body.classList.remove('inline-editing');
  renderBill();
}
// 固定账目直接在列表行下方编辑
function billFixedEdit(f, anchor) {
  const isExpense = billType === 'expense';
  const getFn = isExpense ? billFixedGetAll : billFixedInGetAll;
  const saveFn = isExpense ? billFixedSaveAll : billFixedInSaveAll;
  showInlineEditor(anchor, '编辑固定项', [
    { label:'名称', value:f.name || '' },
    { label:'每月金额', type:'number', value:String(f.amount || '') }
  ], values => {
    const name = values[0].trim();
    const amount = parseFloat(values[1]);
    if (!name) { alert('请填写名称'); return false; }
    if (isNaN(amount) || amount <= 0) { alert('金额无效'); return false; }
    const list = getFn();
    const item = list.find(x => x.id === f.id);
    if (item) { item.name = name; item.amount = amount; }
    saveFn(list); renderBill();
  });
}// ===== 密码记录 =====
// 记录字段：{ id, name, account, password, note }


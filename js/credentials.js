function pwdGetAll() { return load(KEY_PWD, []); }
function pwdSaveAll(list) { save(KEY_PWD, list); }
function renderPwd() {
  const list = pwdGetAll();
  const container = document.getElementById('pwdItems');
  container.innerHTML = '';
  if (!list.length) {
    const e = document.createElement('div');
    e.className = 'pwd-empty'; e.textContent = '还没有密钥';
    container.appendChild(e);
    return;
  }
  list.forEach(p => {
    const item = document.createElement('div');
    item.className = 'pwd-item';
    const top = document.createElement('div');
    top.className = 'pi-top';
    const icon = document.createElement('div');
    icon.className = 'pi-icon'; icon.textContent = '🔑';
    const title = document.createElement('div');
    title.className = 'pi-title';
    const name = document.createElement('div');
    name.className = 'pi-name pi-field-value inline-editable'; name.textContent = p.name;
    name.addEventListener('click', e => {
      e.stopPropagation();
      beginDirectTextEdit(name, e, { value:p.name || '', save:value => {
        if (!value) return false;
        const all = pwdGetAll(), item = all.find(x => x.id === p.id); if (!item) return false;
        item.name = value; pwdSaveAll(all); renderPwd();
      }});
    });
    const acc = document.createElement('div');
    acc.className = 'pi-account pi-field-value inline-editable'; acc.textContent = p.account || '';
    acc.addEventListener('click', e => {
      e.stopPropagation();
      beginDirectTextEdit(acc, e, { value:p.account || '', allowEmpty:true, save:value => {
        const all = pwdGetAll(), item = all.find(x => x.id === p.id); if (!item) return false;
        item.account = value; pwdSaveAll(all); renderPwd();
      }});
    });
    const nameRow = document.createElement('div'); nameRow.className = 'pi-field';
    const nameLabel = document.createElement('span'); nameLabel.className = 'pi-field-label'; nameLabel.textContent = '名称';
    nameRow.append(nameLabel, name);
    const accountRow = document.createElement('div');
    accountRow.className = 'pi-field';
    const accountLabel = document.createElement('span'); accountLabel.className = 'pi-field-label'; accountLabel.textContent = '账号';
    accountRow.append(accountLabel, acc);
    title.append(nameRow, accountRow);
    const del = document.createElement('button');
    del.className = 'pi-del'; del.textContent = '×';
    del.addEventListener('click', () => {
      if (!confirm('确定删除「' + p.name + '」这条记录吗？')) return;
      pwdSaveAll(pwdGetAll().filter(x => x.id !== p.id)); renderPwd();
    });
    top.appendChild(icon); top.appendChild(title); top.appendChild(del);
    item.appendChild(top);
    const pwRow = document.createElement('div');
    pwRow.className = 'pi-field pi-pw-row';
    const pwLabel = document.createElement('span'); pwLabel.className = 'pi-field-label'; pwLabel.textContent = '密钥';
    const pw = document.createElement('div');
    pw.className = 'pi-pw pi-field-value masked inline-editable'; pw.textContent = '••••••••';
    pw.addEventListener('click', e => {
      e.stopPropagation();
      pw.classList.remove('masked');
      beginDirectTextEdit(pw, e, { value:p.password || '', displayValue:'••••••••', caretAtEnd:true, allowEmpty:true, save:value => {
        const all = pwdGetAll(), item = all.find(x => x.id === p.id); if (!item) return false;
        item.password = value; pwdSaveAll(all); renderPwd();
      }, onFinish:() => { if (pw.isConnected) pw.classList.add('masked'); }});
    });
    const eye = document.createElement('button');
    eye.className = 'pi-eye'; eye.textContent = '👁';
    eye.addEventListener('click', () => {
      const masked = pw.classList.toggle('masked');
      pw.textContent = masked ? '••••••••' : (p.password || '');
    });
    const copy = document.createElement('button');
    copy.className = 'pi-copy'; copy.textContent = '📋';
    copy.addEventListener('click', () => {
      const t = p.password || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(() => alert('密码已复制'));
      } else { alert('复制失败，请手动复制：' + t); }
    });
    const pwValueWrap = document.createElement('div');
    pwValueWrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;min-width:0;';
    pwValueWrap.append(pw, eye, copy);
    pwRow.append(pwLabel, pwValueWrap);

    const noteRow = document.createElement('div'); noteRow.className = 'pi-field';
    const noteLabel = document.createElement('span'); noteLabel.className = 'pi-field-label'; noteLabel.textContent = '备注';
    const noteText = document.createElement('div');
    noteText.className = 'pi-note pi-field-value inline-editable';
    noteText.textContent = p.note || '';
    noteText.addEventListener('click', e => {
      e.stopPropagation();
      beginDirectTextEdit(noteText, e, { value:p.note || '', allowEmpty:true, multiline:true, save:value => {
        const all = pwdGetAll(), item = all.find(x => x.id === p.id); if (!item) return false;
        item.note = value; pwdSaveAll(all); renderPwd();
      }});
    });
    noteRow.append(noteLabel, noteText);

    const data = document.createElement('div'); data.className = 'pi-data';
    data.append(pwRow, noteRow);
    item.append(top, data);

    container.appendChild(item);
  });
}
function pwdAdd() {
  const name = document.getElementById('pwdAddName').value.trim();
  if (!name) { alert('请填写名称'); return; }
  const list = pwdGetAll();
  list.push({ id:Date.now() + Math.random(), name, account:document.getElementById('pwdAddAccount').value.trim(), password:document.getElementById('pwdAddPassword').value, note:document.getElementById('pwdAddNote').value.trim() });
  pwdSaveAll(list);
  ['pwdAddName','pwdAddAccount','pwdAddPassword','pwdAddNote'].forEach(id => { document.getElementById(id).value = ''; });
  document.body.classList.remove('inline-editing');
  renderPwd();
}
// 密码信息直接在该记录下方编辑
function pwdEdit(p, anchor) {
  const fields = [
    { label:'名称', value:p.name || '' },
    { label:'账号', value:p.account || '' },
    { label:'密码', type:'password', value:p.password || '' },
    { label:'备注', value:p.note || '' }
  ];
  showInlineEditor(anchor, '编辑密钥', fields, values => {
    const list = pwdGetAll();
    const item = list.find(x => x.id === p.id);
    if (!item) return;
    item.name = values[0].trim() || item.name;
    item.account = values[1].trim();
    item.password = values[2];
    item.note = values[3].trim();
    pwdSaveAll(list); renderPwd();
  });
}

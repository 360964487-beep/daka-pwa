const APP_VERSION = 'v78';

function setAppUpdateStatus(message) {
  const status = document.getElementById('appUpdateStatus');
  if (status) status.textContent = message;
}

function setAppUpdateButton(label, disabled = false) {
  const button = document.getElementById('checkAppUpdateButton');
  if (!button) return;
  button.textContent = label;
  button.disabled = disabled;
}

async function checkForAppUpdate() {
  const button = document.getElementById('checkAppUpdateButton');
  if (button && button.dataset.restartReady === 'true') {
    setAppUpdateStatus('正在重启并载入新版…');
    location.reload();
    return;
  }

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
    setAppUpdateStatus('自动更新仅在 HTTPS 安装版中可用。');
    return;
  }

  setAppUpdateButton('检查中…', true);
  setAppUpdateStatus('正在连接更新服务…');

  try {
    const registration = await navigator.serviceWorker.getRegistration('./')
      || await navigator.serviceWorker.register('./sw.js');
    let foundUpdate = false;
    let updateWorker = null;

    registration.addEventListener('updatefound', () => {
      foundUpdate = true;
      setAppUpdateStatus('发现新版，正在下载并安装…');
      updateWorker = registration.installing;
      if (updateWorker) updateWorker.addEventListener('statechange', () => {
        if (updateWorker.state === 'redundant') setAppUpdateStatus('新版安装未完成，请稍后重试。');
      });
    }, { once:true });
    await registration.update();

    if (foundUpdate) {
      const start = Date.now();
      while (Date.now() - start < 12000) {
        if (updateWorker && updateWorker.state === 'activated') break;
        if (updateWorker && updateWorker.state === 'redundant') throw new Error('新版安装失败');
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!updateWorker || updateWorker.state !== 'activated') {
        throw new Error('更新仍在后台安装，请稍后再检查');
      }
      setAppUpdateButton('立即更新并重启');
      if (button) button.dataset.restartReady = 'true';
      setAppUpdateStatus('新版已就绪，点击按钮重启应用；本机记录会保留。');
      return;
    }

    setAppUpdateStatus('当前已是最新版（' + APP_VERSION + '）。');
    setAppUpdateButton('重新检查');
  } catch (_) {
    setAppUpdateStatus('检查失败：请确认网络正常后重试。');
    setAppUpdateButton('重试检查');
  }
}

const appVersionLabel = document.getElementById('appVersionLabel');
if (appVersionLabel) appVersionLabel.textContent = '当前版本 ' + APP_VERSION;

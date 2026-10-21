# 焦糖打卡 PWA

## 项目结构

- `index.html`：页面结构和静态内容。
- `styles.css`：页面样式。
- `js/`：按公共基础、任务打卡、日历、账本、密钥、小纸条与设置、周计划、DeepSeek 助手、启动入口拆分的脚本。
- `sw.js`：离线缓存与更新。
- `manifest.webmanifest` 和图标文件：PWA 安装信息与图标。

脚本通过有序的经典脚本加载，共享现有全局调用约定；`js/bootstrap.js` 最后运行，负责初始化页面。部署时需要保留 `js/` 目录结构及 `styles.css`，不能只上传 `index.html`。

## 静态检查

在项目目录运行：

```sh
node scripts/check-project.cjs
```

也可以运行 `npm run check`。检查会验证脚本语法及加载顺序、页面内联按钮引用、PWA 清单文件和 Service Worker 离线缓存资源，不需要安装第三方包。

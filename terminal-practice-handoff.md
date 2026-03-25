# Terminal Practice Web App — 專案交接文件

## 專案概述

一個純前端的 macOS 終端機練習網頁應用，讓初學者透過互動方式學習 Linux/macOS 終端機指令。

- **技術棧**：純 HTML + CSS + JavaScript（單一檔案，零依賴，無需 build）
- **部署方式**：GitHub Pages（把檔案命名為 `index.html` 推上 repo 即可）
- **字體**：Google Fonts — JetBrains Mono

---

## UI 架構

```
┌──────────────────────────────────────┐
│  Top Bar (紅黃綠圓點 + 標題 + 模式徽章) │
├──────────────────────────────────────┤
│                                      │
│  Terminal 畫面                        │
│  - 模擬 zsh prompt                    │
│  - 支援指令輸出、錯誤訊息              │
│  - 右上角浮動提示框 (hint toasts)      │
│                                      │
├──────────────────────────────────────┤
│  MacBook 虛擬鍵盤（5 行按鍵）          │
│  - 實體鍵盤按鍵時同步高亮              │
│  - 可直接點擊虛擬鍵盤輸入              │
│  - Ctrl 等修飾鍵有 toggle 狀態顯示     │
└──────────────────────────────────────┘
```

---

## 核心功能模組

### 1. 虛擬檔案系統 (`FS` 物件)

以 JavaScript 物件模擬，key 為絕對路徑，value 為 `{ type: 'dir'|'file', children?: [], content?: string, executable?: bool }`。

預設目錄結構：
```
/home/user/
├── Documents/
│   ├── notes.txt
│   ├── report.md
│   └── todo.txt
├── Downloads/
│   ├── image.png
│   └── data.csv
├── projects/
│   ├── webapp/
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   └── README.md
│   └── script.sh (executable)
├── .bashrc
└── .zshrc
```

### 2. 支援的終端機指令

| 指令 | 功能 |
|------|------|
| `ls [-l] [-a]` | 列出目錄（支援顏色區分：藍=目錄、白=檔案、綠=可執行檔） |
| `cd <path>` | 切換目錄（支援 `..`、`~`、絕對/相對路徑） |
| `pwd` | 顯示當前路徑 |
| `cat <file>` | 顯示檔案內容 |
| `head [-n N] <file>` | 顯示前 N 行 |
| `tail [-n N] <file>` | 顯示後 N 行 |
| `wc [-l] <file>` | 計算行數/字數 |
| `mkdir <dir>` | 建立資料夾 |
| `touch <file>` | 建立空檔案 |
| `cp <src> <dest>` | 複製 |
| `mv <src> <dest>` | 移動/改名 |
| `rm [-r] <file>` | 刪除 |
| `grep <pattern> <file>` | 搜尋文字（紅色高亮匹配） |
| `find [dir]` | 遞迴列出路徑 |
| `echo <text>` | 輸出文字 |
| `clear` | 清除螢幕 |
| `vi/vim <file>` | 進入 Vim 編輯器 |
| `whoami` | 顯示使用者 |
| `date` | 顯示日期 |
| `help` | 列出所有指令 |

### 3. Ctrl 快捷鍵（全部有實際游標/文字操作）

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl+A` | 游標移到行首 |
| `Ctrl+E` | 游標移到行尾 |
| `Ctrl+B` | 游標左移一格 |
| `Ctrl+F` | 游標右移一格 |
| `Ctrl+U` | 刪除游標到行首 |
| `Ctrl+K` | 刪除游標到行尾 |
| `Ctrl+W` | 刪除前一個單字 |
| `Ctrl+C` | 中斷輸入 |
| `Ctrl+L` | 清除螢幕 |

### 4. Tab 自動補全

- 支援巢狀路徑補全（如 `Documents/no` → `Documents/notes.txt`）
- 邏輯：將輸入拆成 `dirPrefix`（最後一個 `/` 前的部分）和 `partial`（`/` 後的部分），對 `dirPrefix` 做 `resolvePath()` 找到目標目錄再搜尋 children
- 唯一匹配時自動補全（目錄自動加 `/`）
- 多個匹配時顯示候選列表並填入共同前綴

### 5. Vim 模式

進入方式：`vi <filename>` 或 `vim <filename>`

三種子模式：
- **Normal**：`h/j/k/l` 移動、`0/$` 行首行尾、`G` 跳最後行、`x` 刪字元、`d` 刪行、`:` 進命令模式
- **Insert**：`i/a/A/o/O` 進入、`Esc` 回 Normal、支援打字/Backspace/Enter/Tab
- **Command**：`:w` 存檔、`:wq` 存檔離開、`:q` 離開、`:q!` 強制離開、`:N` 跳到第 N 行

### 6. 指令解說提示系統

- 每次執行指令後，右上角自動彈出紫色提示框解說該指令的用途
- Ctrl 組合鍵按完也會跳出對應解說
- Vim 模式中按鍵也有即時解說
- 提示框 6 秒後自動淡出消失
- 提示資料存在 `cmdExplain`、`ctrlExplain` 兩個物件中

### 7. 虛擬鍵盤

- MacBook 五行鍵盤佈局（含 Fn、⌃、⌥、⌘、Space）
- 實體鍵盤按鍵時對應虛擬按鍵同步閃綠色高亮（200ms）
- 可直接點擊虛擬鍵盤輸入
- Ctrl 鍵有 toggle 模式（粉色邊框表示按住狀態），點一次 Ctrl 再點字母鍵 = Ctrl+字母
- 虛擬鍵盤觸發後自動釋放 Ctrl 狀態

---

## 關鍵狀態變數

```javascript
let cwd = '/home/user';    // 當前工作目錄
let inputBuf = '';          // 輸入緩衝區
let cursorPos = 0;          // ★ 游標在 inputBuf 中的位置
let cmdHistory = [];        // 指令歷史
let histIdx = -1;           // 歷史瀏覽索引
let mode = 'normal';        // 'normal' | 'vi-normal' | 'vi-insert' | 'vi-command'
let viState = null;         // Vim 編輯器狀態物件
let ctrlHeld = false;       // Ctrl 是否被按住
let shiftHeld = false;      // Shift 是否被按住
let termLines = [];         // 終端機已輸出的 HTML 行
```

---

## CSS 主題變數

```css
--bg: #1a1a2e            /* 頁面背景 */
--terminal-bg: #0d0d0d   /* 終端機背景 */
--text-green: #00ff41    /* 主要綠色（提示符、游標） */
--text-white: #e0e0e0    /* 一般文字 */
--prompt-blue: #5eaeff   /* 路徑顏色、目錄顏色 */
--prompt-user: #ff79c6   /* 使用者名稱顏色 */
--key-bg: #3a3a4a        /* 鍵盤按鍵背景 */
--key-pressed: #00ff41   /* 按鍵按下高亮 */
--keyboard-bg: #2a2a3a   /* 鍵盤區背景 */
```

提示框顏色分類：
- `.hint`（藍）— 一般提示
- `.success`（綠）— 成功
- `.info`（橘）— 資訊
- `.explain`（紫）— 指令解說

---

## 已知限制 / 未來可改進

1. **Vim undo 未實作** — 按 `u` 只顯示 "Already at oldest change"
2. **dd 需按兩次 d** — 目前按一次 `d` 就刪整行，真正的 vim 需要按兩次
3. **沒有 pipe / redirect** — 不支援 `|`、`>`、`>>` 等
4. **grep 不支援 -i / -r 等 flags**
5. **沒有 chmod / chown / ln** 等進階指令
6. **沒有環境變數 / alias 系統**
7. **沒有 Tab 補全指令名稱** — 目前只補全檔案/路徑
8. **行動裝置上虛擬鍵盤可能太小** — 有基本 RWD 但可再優化
9. **沒有 Esc 鍵在虛擬鍵盤上** — 可以新增
10. **沒有音效回饋**

---

## 部署到 GitHub Pages

```bash
# 1. 建 repo
gh repo create terminal-practice --public

# 2. 把 terminal-practice.html 重新命名為 index.html
mv terminal-practice.html index.html

# 3. 推上去
git init
git add index.html
git commit -m "init: terminal practice app"
git branch -M main
git remote add origin git@github.com:你的帳號/terminal-practice.git
git push -u origin main

# 4. 到 GitHub repo → Settings → Pages → Source: main branch, / (root) → Save
# 5. 等 1 分鐘後訪問 https://你的帳號.github.io/terminal-practice/
```

---

## 原始碼

完整原始碼在同目錄的 `terminal-practice.html`（664 行，單一檔案）。

主要程式碼區塊對應行數：
- **CSS 樣式**：L8–L98
- **HTML 結構**：L101–L113
- **檔案系統 FS**：L119–L139
- **狀態變數**：L144–L152
- **指令解說資料**：L157–L204
- **終端機渲染**：L209–L267
- **路徑解析**：L272–L283
- **Tab 補全**：L288–L337
- **指令執行 dispatcher**：L342–L385
- **各指令實作**：L390–L425
- **Vim 模式**：L430–L494
- **提示框系統**：L499–L507
- **鍵盤輸入處理**：L512–L568
- **虛擬鍵盤**：L573–L650
- **初始化**：L655–L662

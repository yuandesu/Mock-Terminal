// levels-data.js — World & Level Definitions
// Level types: 'cursor' (bash readline), 'shell' (real terminal commands)

const WORLDS = [
  {
    id: 'w1',
    title: 'Bash 游標',
    emoji: '⌨️',
    levels: [
      {
        id: 'w1l1', type: 'cursor', boss: false,
        title: '跳到行首',
        desc: '游標在指令中間，把它移到最前面',
        buffer: 'git commit -m "fix authentication bug"',
        cursorStart: 15,
        win: { cursorAt: 0 },
        hint: 'Ctrl + A',
        par: 1
      },
      {
        id: 'w1l2', type: 'cursor', boss: false,
        title: '跳到行尾',
        desc: '游標在行首，把它移到最後面',
        buffer: 'npm install --save-dev webpack',
        cursorStart: 0,
        win: { cursorAt: 'end' },
        hint: 'Ctrl + E',
        par: 1
      },
      {
        id: 'w1l3', type: 'cursor', boss: false,
        title: '往前跳一個字',
        desc: '游標在行首，跳過第一個單字（npm）',
        buffer: 'npm run build',
        cursorStart: 0,
        win: { cursorAt: 3 },
        hint: 'Alt + F',
        par: 1
      },
      {
        id: 'w1l4', type: 'cursor', boss: false,
        title: '刪到行首',
        desc: '游標在 "ls" 前，把前面多餘的 "sudo " 全部刪掉',
        buffer: 'sudo ls /home/user',
        cursorStart: 5,
        win: { bufferIs: 'ls /home/user', cursorAt: 0 },
        hint: 'Ctrl + U',
        par: 1
      },
      {
        id: 'w1boss', type: 'cursor', boss: true,
        title: '⭐ BOSS：修正 typo',
        desc: '"chekout" 少了一個 c，改成 "checkout" 再按 Enter',
        buffer: 'git chekout -b feature/login',
        cursorStart: 27,
        win: { bufferIs: 'git checkout -b feature/login', requireEnter: true },
        hint: null,
        par: 5
      }
    ]
  },
  {
    id: 'w2',
    title: '檔案操作',
    emoji: '📁',
    levels: [
      {
        id: 'w2l1', type: 'shell', boss: false,
        title: '建立資料夾',
        desc: '在目前目錄建立一個叫 practice 的資料夾',
        setup: [],
        win: { dirExists: '/home/user/practice' },
        hint: 'mkdir',
        par: 1
      },
      {
        id: 'w2l2', type: 'shell', boss: false,
        title: '建立檔案',
        desc: '在 practice 資料夾裡建立一個空白的 hello.txt',
        setup: ['mkdir practice'],
        win: { fileExists: '/home/user/practice/hello.txt' },
        hint: 'touch',
        par: 1
      },
      {
        id: 'w2l3', type: 'shell', boss: false,
        title: '複製檔案',
        desc: '把 practice/hello.txt 複製一份叫 hello.bak（同資料夾）',
        setup: ['mkdir practice', 'touch practice/hello.txt'],
        win: { fileExists: '/home/user/practice/hello.bak' },
        hint: 'cp',
        par: 1
      },
      {
        id: 'w2l4', type: 'shell', boss: false,
        title: '移動檔案',
        desc: '把 practice/hello.bak 移到 /tmp/hello.bak',
        setup: ['mkdir practice', 'touch practice/hello.txt', 'cp practice/hello.txt practice/hello.bak'],
        win: { fileExists: '/tmp/hello.bak' },
        hint: 'mv',
        par: 1
      },
      {
        id: 'w2boss', type: 'shell', boss: true,
        title: '⭐ BOSS：整理專案',
        desc: '桌面有幾個散落的檔案：把 app.js 和 index.html 移到 src/，把 style.css 移到 assets/，README.md 留原地',
        setup: ['touch app.js', 'touch index.html', 'touch style.css', 'touch README.md'],
        win: { allExist: ['/home/user/src/app.js', '/home/user/src/index.html', '/home/user/assets/style.css'] },
        hint: null,
        par: 5
      }
    ]
  }
];

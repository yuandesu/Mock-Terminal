// filesystem.js — Virtual filesystem data
const FS = {
  '/': { type: 'dir', children: ['home'] },
  '/home': { type: 'dir', children: ['user'] },
  '/home/user': { type: 'dir', children: ['Documents', 'Downloads', 'projects', '.bashrc', '.zshrc'] },
  '/home/user/Documents': { type: 'dir', children: ['notes.txt', 'report.md', 'todo.txt'] },
  '/home/user/Documents/notes.txt': {
    type: 'file',
    content: '這是一個筆記檔案。\n記得完成作業！\n明天開會時間：14:00',
  },
  '/home/user/Documents/report.md': {
    type: 'file',
    content: '# 月報告\n\n## 進度\n- 完成前端設計\n- API 串接中\n\n## 待辦\n- 測試部署',
  },
  '/home/user/Documents/todo.txt': {
    type: 'file',
    content: '1. 學習 Linux 指令\n2. 練習 vim\n3. 完成專案部署',
  },
  '/home/user/Downloads': { type: 'dir', children: ['image.png', 'data.csv'] },
  '/home/user/Downloads/image.png': { type: 'file', content: '[binary PNG data]' },
  '/home/user/Downloads/data.csv': {
    type: 'file',
    content: 'name,age,city\nAlice,28,Taipei\nBob,32,Tokyo\nCarol,25,Osaka',
  },
  '/home/user/projects': { type: 'dir', children: ['webapp', 'script.sh'] },
  '/home/user/projects/webapp': { type: 'dir', children: ['index.html', 'style.css', 'app.js', 'README.md'] },
  '/home/user/projects/webapp/index.html': {
    type: 'file',
    content: '<!DOCTYPE html>\n<html>\n<head><title>My App</title></head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>',
  },
  '/home/user/projects/webapp/style.css': {
    type: 'file',
    content: 'body {\n  margin: 0;\n  font-family: sans-serif;\n  background: #f0f0f0;\n}\nh1 { color: #333; }',
  },
  '/home/user/projects/webapp/app.js': {
    type: 'file',
    content: 'console.log("App started");\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\ngreet("World");',
  },
  '/home/user/projects/webapp/README.md': {
    type: 'file',
    content: '# WebApp\n\nA simple web application.\n\n## Setup\nnpm install\nnpm start',
  },
  '/home/user/projects/script.sh': {
    type: 'file',
    executable: true,
    content: '#!/bin/bash\necho "Running backup..."\ntar -czf backup.tar.gz ~/Documents\necho "Backup complete!"',
  },
  '/home/user/.bashrc': {
    type: 'file',
    content: '# .bashrc\nexport PATH=$PATH:/usr/local/bin\nalias ll="ls -la"',
  },
  '/home/user/.zshrc': {
    type: 'file',
    content: '# .zshrc\nexport ZSH=$HOME/.oh-my-zsh\nZSH_THEME="robbyrussell"',
  },
};

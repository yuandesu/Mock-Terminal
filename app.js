// app.js — Core application logic
// Depends on: filesystem.js, lang/zh.js, lang/en.js, lang/ja.js (loaded before this)

const TRANSLATIONS = { zh: LANG_ZH, en: LANG_EN, ja: LANG_JA };

// ── State ──────────────────────────────
let cwd        = '/home/user';
let inputBuf   = '';
let cursorPos  = 0;
let cmdHistory = [];
let histIdx    = -1;
let mode       = 'normal';
let viState    = null;
let ctrlHeld   = false;
let shiftHeld  = false;
let currentLang   = 'zh';
let isLightMode   = false;

function T() { return TRANSLATIONS[currentLang]; }
let cmdExplain  = T().cmdExplain;
let ctrlExplain = T().ctrlExplain;

// ── Theme & Language ───────────────────
function toggleTheme() {
  isLightMode = !isLightMode;
  document.body.classList.toggle('light-mode', isLightMode);
  document.getElementById('themeBtn').textContent = isLightMode ? '🌙' : '☀️';
}

function switchLang(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  cmdExplain  = T().cmdExplain;
  ctrlExplain = T().ctrlExplain;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  document.getElementById('topTitle').textContent = T().title;
  termLines = [];
  addHtmlLine(`<span class="output-line" style="color:#888">${T().welcome1}</span>`);
  addHtmlLine(`<span class="output-line" style="color:#888">${T().welcome2}</span>`);
  addHtmlLine(`<span class="output-line" style="color:#888">${T().separator}</span>`);
  refresh();
  showHint('hint', T().langTitle, T().langText);
}

// ── Explanation lookup ─────────────────
function getExplanation(cmd) {
  const t = cmd.trim(), parts = t.split(/\s+/), base = parts[0];
  const flags = parts.filter(p => p.startsWith('-')).sort().join(' ');
  const withFlags = base + (flags ? ' ' + flags : '');
  return cmdExplain[t] || cmdExplain[withFlags] || cmdExplain[base] || null;
}

// ── Terminal rendering ─────────────────
const termEl = document.getElementById('terminal');
const hintEl = document.getElementById('hintContainer');
let termLines = [];

function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function getPrompt() {
  const p = cwd.replace('/home/user', '~') || '/';
  return `<span class="prompt-user">user@macbook</span>:<span class="prompt-path">${p}</span><span class="prompt-symbol">$ </span>`;
}

function renderTerminal() {
  if (mode !== 'normal') return;
  const before = escHtml(inputBuf.substring(0, cursorPos));
  const ch     = cursorPos < inputBuf.length ? escHtml(inputBuf[cursorPos]) : ' ';
  const after  = escHtml(inputBuf.substring(cursorPos + 1));
  termEl.innerHTML = termLines.join('') + getPrompt() +
    `<span class="output-line">${before}<span class="cursor-block">${ch}</span>${after}</span>`;
  termEl.scrollTop = termEl.scrollHeight;
}

function renderVi() {
  const v    = viState;
  const rows = Math.floor((termEl.clientHeight - 30) / 24) || 20;
  let html   = '';
  for (let i = 0; i < rows - 1; i++) {
    if (i < v.lines.length) {
      let line = escHtml(v.lines[i]);
      if (v.mode === 'normal' && i === v.cursorRow) {
        const ch = v.lines[i][v.cursorCol] || ' ';
        line = escHtml(v.lines[i].substring(0, v.cursorCol)) +
          `<span style="background:var(--text-green);color:#000">${escHtml(ch)}</span>` +
          escHtml(v.lines[i].substring(v.cursorCol + 1));
      } else if (v.mode === 'insert' && i === v.cursorRow) {
        line = escHtml(v.lines[i].substring(0, v.cursorCol)) +
          `<span class="cursor-block"> </span>` +
          escHtml(v.lines[i].substring(v.cursorCol));
      }
      html += `<div class="output-line">${line || ' '}</div>`;
    } else {
      html += `<div class="vi-tilde">~</div>`;
    }
  }
  let status = '';
  if (v.mode === 'insert')  status = '-- INSERT --';
  else if (v.mode === 'command') status = ':' + escHtml(v.commandBuf);
  else status = escHtml(v.message || '');
  html += `<div class="vi-status">${status}<span style="float:right">${v.cursorRow+1},${v.cursorCol+1}</span></div>`;
  termEl.innerHTML = html;
}

function refresh() {
  if (mode === 'normal')        renderTerminal();
  else if (mode.startsWith('vi')) renderVi();
}

function addPromptLine(cmd) { termLines.push(`<div class="prompt-line">${getPrompt()}<span class="output-line">${escHtml(cmd)}</span></div>`); }
function addOutLine(text, cls = 'output-line') { termLines.push(`<div class="${cls}">${escHtml(text)}</div>`); }
function addHtmlLine(html) { termLines.push(`<div>${html}</div>`); }

// ── Path resolution ────────────────────
function resolvePath(p) {
  if (!p) return cwd;
  if (p === '~') return '/home/user';
  if (p.startsWith('~/')) p = '/home/user/' + p.slice(2);
  else if (!p.startsWith('/')) p = cwd + '/' + p;
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return '/' + parts.join('/');
}

// ── Tab completion ─────────────────────
function doTabComplete() {
  const parts    = inputBuf.split(/\s+/);
  const lastPart = parts[parts.length - 1] || '';
  if (!lastPart) return;

  const slashIdx = lastPart.lastIndexOf('/');
  const dirPrefix = slashIdx >= 0 ? lastPart.substring(0, slashIdx + 1) : '';
  const partial   = slashIdx >= 0 ? lastPart.substring(slashIdx + 1) : lastPart;

  const searchDir = resolvePath(dirPrefix ? dirPrefix.replace(/\/$/, '') : '.');
  const node = FS[searchDir];
  if (!node || node.type !== 'dir') return;

  const matches = node.children.filter(c => c.startsWith(partial));

  if (matches.length === 1) {
    const fullPath = searchDir === '/' ? '/' + matches[0] : searchDir + '/' + matches[0];
    const isDir    = FS[fullPath] && FS[fullPath].type === 'dir';
    parts[parts.length - 1] = dirPrefix + matches[0] + (isDir ? '/' : '');
    inputBuf  = parts.join(' ');
    cursorPos = inputBuf.length;
  } else if (matches.length > 1) {
    addPromptLine(inputBuf);
    addHtmlLine(matches.map(m => {
      const fullPath = searchDir === '/' ? '/' + m : searchDir + '/' + m;
      const cls = FS[fullPath] && FS[fullPath].type === 'dir' ? 'dir-color' : 'file-color';
      return `<span class="${cls}">${escHtml(m)}</span>`;
    }).join('  '));
    let common = matches[0];
    for (let i = 1; i < matches.length; i++) while (!matches[i].startsWith(common)) common = common.slice(0, -1);
    if (common.length > partial.length) {
      parts[parts.length - 1] = dirPrefix + common;
      inputBuf  = parts.join(' ');
      cursorPos = inputBuf.length;
    }
  }
}

// ── Command execution ──────────────────
function execCmd(raw) {
  const cmd = raw.trim();
  if (!cmd) { addPromptLine(''); refresh(); return; }
  addPromptLine(cmd);
  cmdHistory.push(cmd);
  histIdx = cmdHistory.length;

  const parts = cmd.split(/\s+/);
  const c = parts[0], args = parts.slice(1);
  let isError = false;

  try {
    switch (c) {
      case 'ls':    doLs(args);   break;
      case 'cd':    doCd(args);   break;
      case 'pwd':   addOutLine(cwd); break;
      case 'cat':   doCat(args);  break;
      case 'head':  doHead(args); break;
      case 'tail':  doTail(args); break;
      case 'wc':    doWc(args);   break;
      case 'echo':  addOutLine(args.join(' ').replace(/^["']|["']$/g, '')); break;
      case 'mkdir': doMkdir(args); break;
      case 'touch': doTouch(args); break;
      case 'rm':    doRm(args);   break;
      case 'cp':    doCp(args);   break;
      case 'mv':    doMv(args);   break;
      case 'grep':  doGrep(args); break;
      case 'find':  doFind(args); break;
      case 'clear': termLines = []; break;
      case 'vi': case 'vim': doVi(args); break;
      case 'whoami': addOutLine('user'); break;
      case 'date':  addOutLine(new Date().toLocaleString('zh-TW')); break;
      case 'help':  doHelp(); break;
      default: addOutLine(`zsh: command not found: ${c}`, 'error-line'); isError = true;
    }
  } catch (e) { addOutLine(e.message, 'error-line'); isError = true; }

  if (!isError) {
    const explain = getExplanation(cmd);
    if (explain) setTimeout(() => showHint('explain', `📖 ${explain.title}`, explain.text), 100);
  }
  refresh();
}

// ── Commands ───────────────────────────
function doLs(args) {
  let showAll = false, showLong = false, target = null;
  for (const a of args) {
    if (a.startsWith('-')) { if (a.includes('a')) showAll = true; if (a.includes('l')) showLong = true; }
    else target = a;
  }
  const p = resolvePath(target), node = FS[p];
  if (!node || node.type !== 'dir') { addOutLine(`ls: ${target || p}: No such file or directory`, 'error-line'); return; }
  let items = [...node.children];
  if (showAll) items = ['.', '...', ...items];
  if (showLong) {
    items.forEach(name => {
      const full = p === '/' ? '/' + name : p + '/' + name;
      const n    = FS[full];
      const isDir = n && n.type === 'dir';
      const perm  = isDir ? 'drwxr-xr-x' : (n && n.executable ? '-rwxr-xr-x' : '-rw-r--r--');
      const size  = n && n.content ? n.content.length : 4096;
      const cls   = isDir ? 'dir-color' : (n && n.executable ? 'exec-color' : 'file-color');
      addHtmlLine(`<span class="output-line">${perm}  1 user  staff  ${String(size).padStart(5)}  Mar 21 10:00  </span><span class="${cls}">${escHtml(name)}</span>`);
    });
  } else {
    addHtmlLine(items.map(name => {
      if (name === '.' || name === '..') return `<span class="dir-color">${name}</span>`;
      const full = p === '/' ? '/' + name : p + '/' + name, n = FS[full];
      const cls  = n && n.type === 'dir' ? 'dir-color' : (n && n.executable ? 'exec-color' : 'file-color');
      return `<span class="${cls}">${escHtml(name)}</span>`;
    }).join('  '));
  }
}
function doCd(args) {
  const target = args[0] || '~', p = resolvePath(target);
  if (!FS[p])                   { addOutLine(`cd: no such file or directory: ${target}`, 'error-line'); return; }
  if (FS[p].type !== 'dir')     { addOutLine(`cd: not a directory: ${target}`, 'error-line'); return; }
  cwd = p;
}
function doCat(args) {
  if (!args.length) { addOutLine('usage: cat <file>', 'error-line'); return; }
  const p = resolvePath(args[0]), node = FS[p];
  if (!node)              { addOutLine(`cat: ${args[0]}: No such file or directory`, 'error-line'); return; }
  if (node.type === 'dir') { addOutLine(`cat: ${args[0]}: Is a directory`, 'error-line'); return; }
  node.content.split('\n').forEach(l => addOutLine(l));
}
function doHead(args) {
  let n = 10, file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' || /^-\d+$/.test(args[i])) n = parseInt(args[i] === '-n' ? args[++i] : args[i].slice(1));
    else file = args[i];
  }
  if (!file) { addOutLine('usage: head [-n N] <file>', 'error-line'); return; }
  const p = resolvePath(file), node = FS[p];
  if (!node || node.type === 'dir') { addOutLine(`head: ${file}: No such file or directory`, 'error-line'); return; }
  node.content.split('\n').slice(0, n).forEach(l => addOutLine(l));
}
function doTail(args) {
  let n = 10, file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' || /^-\d+$/.test(args[i])) n = parseInt(args[i] === '-n' ? args[++i] : args[i].slice(1));
    else file = args[i];
  }
  if (!file) { addOutLine('usage: tail [-n N] <file>', 'error-line'); return; }
  const p = resolvePath(file), node = FS[p];
  if (!node || node.type === 'dir') { addOutLine(`tail: ${file}: No such file or directory`, 'error-line'); return; }
  node.content.split('\n').slice(-n).forEach(l => addOutLine(l));
}
function doWc(args) {
  let countLines = false, file = null;
  for (const a of args) { if (a === '-l') countLines = true; else file = a; }
  if (!file) { addOutLine('usage: wc [-l] <file>', 'error-line'); return; }
  const p = resolvePath(file), node = FS[p];
  if (!node || node.type === 'dir') { addOutLine(`wc: ${file}: No such file or directory`, 'error-line'); return; }
  const lines = node.content.split('\n');
  if (countLines) addOutLine(`       ${lines.length} ${file}`);
  else { const words = node.content.split(/\s+/).filter(Boolean).length; addOutLine(`       ${lines.length}       ${words}      ${node.content.length} ${file}`); }
}
function doMkdir(args) {
  if (!args.length) { addOutLine('usage: mkdir <dir>', 'error-line'); return; }
  const name = args[0], p = resolvePath(name);
  if (FS[p]) { addOutLine(`mkdir: ${name}: File exists`, 'error-line'); return; }
  FS[p] = { type: 'dir', children: [] };
  const parent = p.substring(0, p.lastIndexOf('/')) || '/';
  if (FS[parent]) FS[parent].children.push(name.split('/').pop());
}
function doTouch(args) {
  if (!args.length) { addOutLine('usage: touch <file>', 'error-line'); return; }
  const name = args[0], p = resolvePath(name);
  if (!FS[p]) {
    FS[p] = { type: 'file', content: '' };
    const parent = p.substring(0, p.lastIndexOf('/')) || '/';
    if (FS[parent]) FS[parent].children.push(name.split('/').pop());
  }
}
function doRm(args) {
  let recursive = false, files = [];
  for (const a of args) { if (a === '-r' || a === '-rf' || a === '-fr') recursive = true; else files.push(a); }
  files.forEach(f => {
    const p = resolvePath(f), node = FS[p];
    if (!node)                    { addOutLine(`rm: ${f}: No such file or directory`, 'error-line'); return; }
    if (node.type === 'dir' && !recursive) { addOutLine(`rm: ${f}: is a directory`, 'error-line'); return; }
    delete FS[p];
    const parent = p.substring(0, p.lastIndexOf('/')) || '/';
    if (FS[parent]) FS[parent].children = FS[parent].children.filter(c => c !== f.split('/').pop());
  });
}
function doCp(args) {
  if (args.length < 2) { addOutLine('usage: cp <src> <dest>', 'error-line'); return; }
  const src = resolvePath(args[0]), dest = resolvePath(args[1]);
  if (!FS[src]) { addOutLine(`cp: ${args[0]}: No such file or directory`, 'error-line'); return; }
  FS[dest] = { ...FS[src], content: FS[src].content };
  const parent = dest.substring(0, dest.lastIndexOf('/')) || '/';
  const dname  = dest.split('/').pop();
  if (FS[parent] && !FS[parent].children.includes(dname)) FS[parent].children.push(dname);
}
function doMv(args) {
  if (args.length < 2) { addOutLine('usage: mv <src> <dest>', 'error-line'); return; }
  doCp(args);
  const src = resolvePath(args[0]), sname = args[0].split('/').pop();
  const sparent = src.substring(0, src.lastIndexOf('/')) || '/';
  delete FS[src];
  if (FS[sparent]) FS[sparent].children = FS[sparent].children.filter(c => c !== sname);
}
function doGrep(args) {
  if (args.length < 2) { addOutLine('usage: grep <pattern> <file>', 'error-line'); return; }
  const [pat, file] = args;
  const p = resolvePath(file), node = FS[p];
  if (!node) { addOutLine(`grep: ${file}: No such file or directory`, 'error-line'); return; }
  const re = new RegExp(pat, 'gi');
  node.content.split('\n').forEach(l => {
    if (re.test(l)) addHtmlLine(`<span class="output-line">${escHtml(l).replace(new RegExp(pat, 'gi'), m => `<span style="color:#ff6b6b;font-weight:bold">${m}</span>`)}</span>`);
  });
}
function doFind(args) {
  const target = args[0] || '.', base = resolvePath(target);
  function walk(path) {
    addOutLine(path.replace(base, target === '.' ? '.' : target));
    const n = FS[path];
    if (n && n.type === 'dir') n.children.forEach(c => walk(path + '/' + c));
  }
  if (FS[base]) walk(base);
  else addOutLine(`find: ${target}: No such file or directory`, 'error-line');
}
function doHelp() {
  addOutLine(T().helpTitle);
  T().helpCmds.forEach(([c, d]) => addHtmlLine(`<span class="exec-color">${escHtml(c.padEnd(28))}</span><span class="output-line">${escHtml(d)}</span>`));
}

// ── Vim mode ───────────────────────────
function doVi(args) {
  if (!args.length) { addOutLine('usage: vi <file>', 'error-line'); return; }
  const file = args[0], p = resolvePath(file);
  if (!FS[p]) {
    FS[p] = { type: 'file', content: '' };
    const par = p.substring(0, p.lastIndexOf('/')) || '/';
    const nm  = file.split('/').pop();
    if (FS[par] && !FS[par].children.includes(nm)) FS[par].children.push(nm);
  }
  if (FS[p].type === 'dir') { addOutLine(`vi: ${file}: is a directory`, 'error-line'); return; }
  viState = { path: p, filename: file, lines: FS[p].content.split('\n'), cursorRow: 0, cursorCol: 0, mode: 'normal', commandBuf: '', message: `"${file}" ${FS[p].content.split('\n').length}L, ${FS[p].content.length}C`, modified: false, pendingOp: null };
  mode = 'vi-normal';
  document.getElementById('modeBadge').textContent = 'VIM - NORMAL';
  document.getElementById('modeBadge').style.color = '#ff6b6b';
  showHint('info', T().viEnterHint, T().viEnterText);
  refresh();
}

function viHandleKey(key) {
  const v = viState; if (!v) return;
  if (v.mode === 'command') {
    if (key === 'Enter')    { viExecCommand(v.commandBuf); v.commandBuf = ''; v.mode = 'normal'; }
    else if (key === 'Escape')    { v.commandBuf = ''; v.mode = 'normal'; }
    else if (key === 'Backspace') { v.commandBuf = v.commandBuf.slice(0, -1); if (!v.commandBuf) v.mode = 'normal'; }
    else if (key.length === 1)    v.commandBuf += key;
  } else if (v.mode === 'insert') {
    if (key === 'Escape') {
      v.mode = 'normal'; v.cursorCol = Math.max(0, v.cursorCol - 1);
      document.getElementById('modeBadge').textContent = 'VIM - NORMAL';
      showHint('explain', T().viEscHint, T().viEscText);
    } else if (key === 'Enter') {
      const l = v.lines[v.cursorRow];
      v.lines[v.cursorRow] = l.substring(0, v.cursorCol);
      v.lines.splice(v.cursorRow + 1, 0, l.substring(v.cursorCol));
      v.cursorRow++; v.cursorCol = 0; v.modified = true;
    } else if (key === 'Backspace') {
      if (v.cursorCol > 0) {
        const l = v.lines[v.cursorRow];
        v.lines[v.cursorRow] = l.substring(0, v.cursorCol - 1) + l.substring(v.cursorCol);
        v.cursorCol--; v.modified = true;
      } else if (v.cursorRow > 0) {
        v.cursorCol = v.lines[v.cursorRow - 1].length;
        v.lines[v.cursorRow - 1] += v.lines[v.cursorRow];
        v.lines.splice(v.cursorRow, 1);
        v.cursorRow--; v.modified = true;
      }
    } else if (key === 'ArrowLeft')  { v.cursorCol = Math.max(0, v.cursorCol - 1); }
    else if (key === 'ArrowRight') { v.cursorCol = Math.min(v.lines[v.cursorRow].length, v.cursorCol + 1); }
    else if (key === 'ArrowUp')    { if (v.cursorRow > 0) { v.cursorRow--; v.cursorCol = Math.min(v.cursorCol, v.lines[v.cursorRow].length); } }
    else if (key === 'ArrowDown')  { if (v.cursorRow < v.lines.length - 1) { v.cursorRow++; v.cursorCol = Math.min(v.cursorCol, v.lines[v.cursorRow].length); } }
    else if (key === 'Tab') {
      const l = v.lines[v.cursorRow];
      v.lines[v.cursorRow] = l.substring(0, v.cursorCol) + '  ' + l.substring(v.cursorCol);
      v.cursorCol += 2; v.modified = true;
    } else if (key.length === 1) {
      const l = v.lines[v.cursorRow];
      v.lines[v.cursorRow] = l.substring(0, v.cursorCol) + key + l.substring(v.cursorCol);
      v.cursorCol++; v.modified = true;
    }
  } else {
    const viExpl = T().viExpl;
    switch (key) {
      case 'i': v.mode='insert'; document.getElementById('modeBadge').textContent='VIM - INSERT'; break;
      case 'a': v.mode='insert'; v.cursorCol=Math.min(v.cursorCol+1,v.lines[v.cursorRow].length); document.getElementById('modeBadge').textContent='VIM - INSERT'; break;
      case 'A': v.mode='insert'; v.cursorCol=v.lines[v.cursorRow].length; document.getElementById('modeBadge').textContent='VIM - INSERT'; break;
      case 'o': v.lines.splice(v.cursorRow+1,0,''); v.cursorRow++; v.cursorCol=0; v.mode='insert'; document.getElementById('modeBadge').textContent='VIM - INSERT'; v.modified=true; break;
      case 'O': v.lines.splice(v.cursorRow,0,''); v.cursorCol=0; v.mode='insert'; document.getElementById('modeBadge').textContent='VIM - INSERT'; v.modified=true; break;
      case 'h': case 'ArrowLeft':  v.cursorCol=Math.max(0,v.cursorCol-1); break;
      case 'l': case 'ArrowRight': v.cursorCol=Math.min(Math.max(0,v.lines[v.cursorRow].length-1),v.cursorCol+1); break;
      case 'j': case 'ArrowDown':  if(v.cursorRow<v.lines.length-1){v.cursorRow++;v.cursorCol=Math.min(v.cursorCol,Math.max(0,v.lines[v.cursorRow].length-1));} break;
      case 'k': case 'ArrowUp':    if(v.cursorRow>0){v.cursorRow--;v.cursorCol=Math.min(v.cursorCol,Math.max(0,v.lines[v.cursorRow].length-1));} break;
      case '0': v.cursorCol=0; break;
      case '$': v.cursorCol=Math.max(0,v.lines[v.cursorRow].length-1); break;
      case 'g': v.cursorRow=0; v.cursorCol=0; break;
      case 'G': v.cursorRow=v.lines.length-1; v.cursorCol=0; break;
      case 'x': if(v.lines[v.cursorRow].length>0){v.lines[v.cursorRow]=v.lines[v.cursorRow].substring(0,v.cursorCol)+v.lines[v.cursorRow].substring(v.cursorCol+1);v.cursorCol=Math.min(v.cursorCol,Math.max(0,v.lines[v.cursorRow].length-1));v.modified=true;} break;
      case 'd':
        if (v.pendingOp === 'd') {
          if (v.lines.length > 1) { v.lines.splice(v.cursorRow, 1); v.cursorRow = Math.min(v.cursorRow, v.lines.length - 1); }
          else v.lines[0] = '';
          v.cursorCol = 0; v.modified = true; v.message = '1 line deleted'; v.pendingOp = null;
        } else {
          v.pendingOp = 'd'; v.message = 'd';
        }
        break;
      case 'u': v.message='Already at oldest change'; break;
      case ':': v.mode='command'; v.commandBuf=''; v.pendingOp=null; break;
      case 'Escape': v.message=''; v.pendingOp=null; break;
    }
    if (viExpl[key]) showHint('explain', `📖 Vim: ${key}`, viExpl[key]);
  }
  refresh();
}

function viExecCommand(cmd) {
  const v = viState, ce = T().viCmdExpl;
  if (cmd === 'w' || cmd === 'wq' || cmd === 'x') {
    FS[v.path].content = v.lines.join('\n');
    v.message = `"${v.filename}" ${v.lines.length}L written`;
    v.modified = false;
    if (cmd === 'wq' || cmd === 'x') { showHint('explain', ce[cmd][0], ce[cmd][1]); exitVi(); }
    else showHint('explain', ce['w'][0], ce['w'][1]);
  } else if (cmd === 'q') {
    if (v.modified) v.message = 'E37: No write since last change (add ! to override)';
    else { showHint('explain', ce['q'][0], ce['q'][1]); exitVi(); }
  } else if (cmd === 'q!') {
    showHint('explain', ce['q!'][0], ce['q!'][1]); exitVi();
  } else if (cmd.match(/^\d+$/)) {
    v.cursorRow = Math.min(parseInt(cmd) - 1, v.lines.length - 1); v.cursorCol = 0;
    const jmp = T().viLineJump(cmd); showHint('explain', jmp[0], jmp[1]);
  } else {
    v.message = `E492: Not an editor command: ${cmd}`;
  }
}

function exitVi() {
  viState = null; mode = 'normal';
  document.getElementById('modeBadge').textContent = 'NORMAL';
  document.getElementById('modeBadge').style.color = '#aaa';
  refresh();
}

// ── Hints ──────────────────────────────
function showHint(type, title, text) {
  const existing = hintEl.querySelectorAll(`.hint-toast.${type}`);
  if (existing.length > 2) existing[0].remove();
  const el = document.createElement('div');
  el.className = `hint-toast ${type}`;
  el.innerHTML = `<div class="hint-title">${title}</div><div>${text}</div>`;
  hintEl.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 6000);
}

// ── Keyboard input ─────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'F5' && e.key !== 'F12' && !(e.ctrlKey && e.key === 'r')) e.preventDefault();
  pressKeyVisual(findKeyId(e));

  if (e.key === 'Shift')   { shiftHeld = true; return; }
  if (e.key === 'Control') { ctrlHeld = true; updateModifierVisual(); return; }
  if (e.key === 'Alt' || e.key === 'Meta') return;

  if (mode.startsWith('vi')) { viHandleKey(e.key); return; }

  if (e.ctrlKey || ctrlHeld) {
    const k = e.key.toLowerCase();
    switch (k) {
      case 'a': cursorPos = 0; break;
      case 'e': cursorPos = inputBuf.length; break;
      case 'b': cursorPos = Math.max(0, cursorPos - 1); break;
      case 'f': cursorPos = Math.min(inputBuf.length, cursorPos + 1); break;
      case 'u': inputBuf = inputBuf.substring(cursorPos); cursorPos = 0; break;
      case 'k': inputBuf = inputBuf.substring(0, cursorPos); break;
      case 'w': {
        let i = cursorPos - 1;
        while (i >= 0 && inputBuf[i] === ' ') i--;
        while (i >= 0 && inputBuf[i] !== ' ') i--;
        inputBuf = inputBuf.substring(0, i + 1) + inputBuf.substring(cursorPos);
        cursorPos = i + 1;
        break;
      }
      case 'c': inputBuf = ''; cursorPos = 0; addPromptLine('^C'); break;
      case 'l': termLines = []; break;
    }
    if (ctrlExplain[k]) showHint('explain', `📖 ${ctrlExplain[k].title}`, ctrlExplain[k].text);
    refresh(); return;
  }

  if (e.key === 'Enter')       { execCmd(inputBuf); inputBuf = ''; cursorPos = 0; }
  else if (e.key === 'Backspace') { if (cursorPos > 0) { inputBuf = inputBuf.substring(0, cursorPos - 1) + inputBuf.substring(cursorPos); cursorPos--; } }
  else if (e.key === 'Delete')    { if (cursorPos < inputBuf.length) inputBuf = inputBuf.substring(0, cursorPos) + inputBuf.substring(cursorPos + 1); }
  else if (e.key === 'ArrowLeft')  { cursorPos = Math.max(0, cursorPos - 1); }
  else if (e.key === 'ArrowRight') { cursorPos = Math.min(inputBuf.length, cursorPos + 1); }
  else if (e.key === 'Home')  { cursorPos = 0; }
  else if (e.key === 'End')   { cursorPos = inputBuf.length; }
  else if (e.key === 'ArrowUp')   { if (cmdHistory.length > 0) { histIdx = Math.max(0, histIdx - 1); inputBuf = cmdHistory[histIdx] || ''; cursorPos = inputBuf.length; } }
  else if (e.key === 'ArrowDown') { if (histIdx < cmdHistory.length - 1) { histIdx++; inputBuf = cmdHistory[histIdx]; } else { histIdx = cmdHistory.length; inputBuf = ''; } cursorPos = inputBuf.length; }
  else if (e.key === 'Tab')       { doTabComplete(); }
  else if (e.key.length === 1)    { inputBuf = inputBuf.substring(0, cursorPos) + e.key + inputBuf.substring(cursorPos); cursorPos++; }
  refresh();
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift')   shiftHeld = false;
  if (e.key === 'Control') { ctrlHeld = false; updateModifierVisual(); }
});

// ── Virtual keyboard ───────────────────
const kbLayout = [
  [{l:'`',s:'~'},{l:'1',s:'!'},{l:'2',s:'@'},{l:'3',s:'#'},{l:'4',s:'$'},{l:'5',s:'%'},{l:'6',s:'^'},{l:'7',s:'&'},{l:'8',s:'*'},{l:'9',s:'('},{l:'0',s:')'},{l:'-',s:'_'},{l:'=',s:'+'},{l:'Delete',w:'wide-2',k:'Backspace'}],
  [{l:'Tab',w:'wide-2',k:'Tab'},{l:'Q'},{l:'W'},{l:'E'},{l:'R'},{l:'T'},{l:'Y'},{l:'U'},{l:'I'},{l:'O'},{l:'P'},{l:'[',s:'{'},{l:']',s:'}'},{l:'\\',s:'|'}],
  [{l:'Caps',w:'wide-3',k:'CapsLock'},{l:'A'},{l:'S'},{l:'D'},{l:'F'},{l:'G'},{l:'H'},{l:'J'},{l:'K'},{l:'L'},{l:';',s:':'},{l:"'",s:'"'},{l:'Return',w:'wide-3',k:'Enter'}],
  [{l:'Shift',w:'wide-4',k:'ShiftL'},{l:'Z'},{l:'X'},{l:'C'},{l:'V'},{l:'B'},{l:'N'},{l:'M'},{l:',',s:'<'},{l:'.',s:'>'},{l:'/',s:'?'},{l:'Shift',w:'wide-3',k:'ShiftR'}],
  [{l:'Fn',w:'wide-1'},{l:'⌃',w:'wide-1',k:'CtrlL'},{l:'⌥',w:'wide-1',k:'AltL'},{l:'⌘',w:'wide-2',k:'MetaL'},{l:'',w:'space',k:'Space'},{l:'⌘',w:'wide-2',k:'MetaR'},{l:'⌥',w:'wide-1',k:'AltR'},{l:'←',k:'ArrowLeft'},{l:'↑↓',k:'ArrowUpDown'},{l:'→',k:'ArrowRight'}],
];

function buildKeyboard() {
  const kb = document.getElementById('keyboard');
  kbLayout.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach(key => {
      const el  = document.createElement('div');
      el.className = 'key' + (key.w ? ' ' + key.w : '');
      const kid = key.k || key.l;
      el.dataset.key = kid;
      el.innerHTML = key.s
        ? `<span class="sub">${escHtml(key.s)}</span><span class="main">${escHtml(key.l)}</span>`
        : `<span class="main">${escHtml(key.l)}</span>`;
      el.addEventListener('mousedown', (ev) => { ev.preventDefault(); simulateKey(kid); });
      rowEl.appendChild(el);
    });
    kb.appendChild(rowEl);
  });
}

function pressKeyVisual(keyId) {
  document.querySelectorAll(`.key[data-key="${CSS.escape(keyId)}"]`).forEach(el => {
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 200);
  });
}

function updateModifierVisual() {
  document.querySelectorAll('.key[data-key="CtrlL"]').forEach(el => el.classList.toggle('modifier-active', ctrlHeld));
}

function findKeyId(e) {
  if (e.code === 'ShiftLeft')  return 'ShiftL';
  if (e.code === 'ShiftRight') return 'ShiftR';
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') return 'CtrlL';
  if (e.code === 'AltLeft')    return 'AltL';
  if (e.code === 'AltRight')   return 'AltR';
  if (e.code === 'MetaLeft')   return 'MetaL';
  if (e.code === 'MetaRight')  return 'MetaR';
  if (e.key === 'Backspace')   return 'Backspace';
  if (e.key === 'Enter')       return 'Enter';
  if (e.key === 'Tab')         return 'Tab';
  if (e.key === ' ')           return 'Space';
  if (e.key === 'CapsLock')    return 'CapsLock';
  if (e.key === 'ArrowLeft')   return 'ArrowLeft';
  if (e.key === 'ArrowRight')  return 'ArrowRight';
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return 'ArrowUpDown';
  const upper = e.key.toUpperCase();
  return upper.length === 1 ? upper : e.key;
}

function simulateKey(kid) {
  let key = kid;
  if (kid === 'ShiftL' || kid === 'ShiftR') { shiftHeld = !shiftHeld; return; }
  if (kid === 'CtrlL')  { ctrlHeld = !ctrlHeld; updateModifierVisual(); return; }
  if (['AltL','AltR','MetaL','MetaR','Fn','CapsLock'].includes(kid)) return;
  if (kid === 'Space')        key = ' ';
  else if (kid === 'ArrowUpDown') key = 'ArrowUp';
  else if (kid.length === 1)  key = shiftHeld ? kid.toUpperCase() : kid.toLowerCase();

  document.dispatchEvent(new KeyboardEvent('keydown', { key, code: kid, ctrlKey: ctrlHeld, shiftKey: shiftHeld, bubbles: true }));
  if (ctrlHeld) { ctrlHeld = false; updateModifierVisual(); }
}

// ── Init ───────────────────────────────
buildKeyboard();
addHtmlLine(`<span class="output-line" style="color:#888">${T().welcome1}</span>`);
addHtmlLine(`<span class="output-line" style="color:#888">${T().welcome2}</span>`);
addHtmlLine(`<span class="output-line" style="color:#888">${T().separator}</span>`);
refresh();
setTimeout(() => showHint('hint', T().startHintTitle, T().startHintText), 600);

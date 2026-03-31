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
let killBuf    = '';
let rsMode     = false;
let consecutiveKey  = { key: null, count: 0 };
let rsBuf      = '';
let rsMatchIdx = -1;
let rsSaved    = '';
let currentLang   = 'zh';
let isLightMode   = false;

// ── Task Mode State ─────────────────────
let taskMode         = false;
let taskTheme        = null;   // active theme object (null = selector visible)
let taskIdx          = 0;
let taskPanelOpen    = false;
let taskHintShown    = false;
let taskFlags        = {};
let taskAdvanceTimer = null;
let completedThemes  = [];     // IDs of completed themes (persisted)

// ── Pipe / Redirect State ───────────────
let captureBuf       = null;   // string[] while capturing stdout, null otherwise

function T() { return TRANSLATIONS[currentLang]; }
let cmdExplain  = T().cmdExplain;
let ctrlExplain = T().ctrlExplain;

// ── Tips Panel ────────────────────────
let tipsOpen = false;

function dispatchKey(opts) {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...opts }));
}

const TIPS_ACTIONS = {
  ctrl_a: () => dispatchKey({ key: 'a', ctrlKey: true }),
  ctrl_e: () => dispatchKey({ key: 'e', ctrlKey: true }),
  ctrl_b: () => dispatchKey({ key: 'b', ctrlKey: true }),
  ctrl_f: () => dispatchKey({ key: 'f', ctrlKey: true }),
  ctrl_u: () => dispatchKey({ key: 'u', ctrlKey: true }),
  ctrl_k: () => dispatchKey({ key: 'k', ctrlKey: true }),
  ctrl_w: () => dispatchKey({ key: 'w', ctrlKey: true }),
  ctrl_y: () => dispatchKey({ key: 'y', ctrlKey: true }),
  ctrl_r: () => dispatchKey({ key: 'r', ctrlKey: true }),
  ctrl_c: () => dispatchKey({ key: 'c', ctrlKey: true }),
  ctrl_l: () => dispatchKey({ key: 'l', ctrlKey: true }),
  arrow_left:  () => dispatchKey({ key: 'ArrowLeft' }),
  arrow_right: () => dispatchKey({ key: 'ArrowRight' }),
  arrow_up:    () => dispatchKey({ key: 'ArrowUp' }),
  arrow_down:  () => dispatchKey({ key: 'ArrowDown' }),
  backspace:   () => dispatchKey({ key: 'Backspace' }),
  tab:         () => dispatchKey({ key: 'Tab' }),
  vi_h: () => viHandleKey('h'),
  vi_j: () => viHandleKey('j'),
  vi_k: () => viHandleKey('k'),
  vi_l: () => viHandleKey('l'),
  vi_0: () => viHandleKey('0'),
  vi_$: () => viHandleKey('$'),
  vi_G: () => viHandleKey('G'),
  vi_g: () => viHandleKey('g'),
  vi_i: () => viHandleKey('i'),
  vi_a: () => viHandleKey('a'),
  vi_A: () => viHandleKey('A'),
  vi_o: () => viHandleKey('o'),
  vi_O: () => viHandleKey('O'),
  vi_x: () => viHandleKey('x'),
  vi_u: () => viHandleKey('u'),
  vi_dd:     () => { viHandleKey('d'); viHandleKey('d'); },
  vi_esc:    () => viHandleKey('Escape'),
  vi_cmd_w:  () => { viHandleKey(':'); 'w' .split('').forEach(c => viHandleKey(c)); viHandleKey('Enter'); },
  vi_cmd_wq: () => { viHandleKey(':'); 'wq'.split('').forEach(c => viHandleKey(c)); viHandleKey('Enter'); },
  vi_cmd_q:  () => { viHandleKey(':'); 'q' .split('').forEach(c => viHandleKey(c)); viHandleKey('Enter'); },
  vi_cmd_qb: () => { viHandleKey(':'); 'q!'.split('').forEach(c => viHandleKey(c)); viHandleKey('Enter'); },
};

function buildTipsGroups() {
  const t = T(), ti = t.tips, ce = t.ctrlExplain, ve = t.viExpl;
  const isViInsert  = viState && viState.mode === 'insert';
  const isViNormal  = viState && viState.mode !== 'insert';

  if (isViInsert) {
    return {
      title: ti.viInsertTitle,
      groups: [
        { name: ti.groups.move, items: [
          { key: '←', desc: ti.extra.arrowLeft,    action: 'arrow_left' },
          { key: '→', desc: ti.extra.arrowRight,   action: 'arrow_right' },
          { key: '↑', desc: ti.extra.viCursorUp,   action: 'arrow_up' },
          { key: '↓', desc: ti.extra.viCursorDown, action: 'arrow_down' },
        ]},
        { name: ti.groups.escape, items: [
          { key: 'Esc', desc: ti.extra.viEsc, action: 'vi_esc' },
        ]},
        { name: ti.groups.delete, items: [
          { key: '⌫', desc: ti.extra.backspace, action: 'backspace' },
        ]},
      ],
    };
  }

  if (isViNormal) {
    return {
      title: ti.viNormalTitle,
      groups: [
        { name: ti.groups.move, items: [
          { key: 'h', desc: ve.h, action: 'vi_h' },
          { key: 'j', desc: ve.j, action: 'vi_j' },
          { key: 'k', desc: ve.k, action: 'vi_k' },
          { key: 'l', desc: ve.l, action: 'vi_l' },
          { key: '0', desc: ve['0'], action: 'vi_0' },
          { key: '$', desc: ve['$'], action: 'vi_$' },
          { key: 'g', desc: ve.g,   action: 'vi_g' },
          { key: 'G', desc: ve.G,   action: 'vi_G' },
        ]},
        { name: ti.groups.enterInsert, items: [
          { key: 'i', desc: ve.i, action: 'vi_i' },
          { key: 'a', desc: ve.a, action: 'vi_a' },
          { key: 'A', desc: ve.A, action: 'vi_A' },
          { key: 'o', desc: ve.o, action: 'vi_o' },
          { key: 'O', desc: ve.O, action: 'vi_O' },
        ]},
        { name: ti.groups.operations, items: [
          { key: 'x',  desc: ve.x, action: 'vi_x' },
          { key: 'dd', desc: ve.d, action: 'vi_dd' },
          { key: 'u',  desc: ti.extra.viUndo, action: 'vi_u' },
        ]},
        { name: ti.groups.commands, items: [
          { key: ':w',  desc: ti.extra.viCmdW,  action: 'vi_cmd_w' },
          { key: ':wq', desc: ti.extra.viCmdWq, action: 'vi_cmd_wq' },
          { key: ':q',  desc: ti.extra.viCmdQ,  action: 'vi_cmd_q' },
          { key: ':q!', desc: ti.extra.viCmdQb, action: 'vi_cmd_qb' },
        ]},
      ],
    };
  }

  // Terminal normal mode
  return {
    title: ti.terminalTitle,
    groups: [
      { name: ti.groups.cursor, items: [
        { key: 'Ctrl+A', desc: ce.a.text, action: 'ctrl_a' },
        { key: 'Ctrl+E', desc: ce.e.text, action: 'ctrl_e' },
        { key: 'Ctrl+B', desc: ce.b.text, action: 'ctrl_b' },
        { key: 'Ctrl+F', desc: ce.f.text, action: 'ctrl_f' },
        { key: '←',     desc: ti.extra.arrowLeft,  action: 'arrow_left' },
        { key: '→',     desc: ti.extra.arrowRight, action: 'arrow_right' },
      ]},
      { name: ti.groups.delete, items: [
        { key: 'Ctrl+U', desc: ce.u.text, action: 'ctrl_u' },
        { key: 'Ctrl+K', desc: ce.k.text, action: 'ctrl_k' },
        { key: 'Ctrl+W', desc: ce.w.text, action: 'ctrl_w' },
        { key: 'Ctrl+Y', desc: ce.y.text, action: 'ctrl_y' },
        { key: '⌫',     desc: ti.extra.backspace, action: 'backspace' },
      ]},
      { name: ti.groups.history, items: [
        { key: '↑',     desc: ti.extra.histPrev, action: 'arrow_up' },
        { key: '↓',     desc: ti.extra.histNext, action: 'arrow_down' },
        { key: 'Ctrl+R', desc: ce.r.text, action: 'ctrl_r' },
      ]},
      { name: ti.groups.other, items: [
        { key: 'Tab',    desc: ti.extra.tab, action: 'tab' },
        { key: 'Ctrl+C', desc: ce.c.text,   action: 'ctrl_c' },
        { key: 'Ctrl+L', desc: ce.l.text,   action: 'ctrl_l' },
      ]},
    ],
  };
}

function renderTipsPanel() {
  const data   = buildTipsGroups();
  document.getElementById('tipsPanelTitle').textContent = data.title;
  document.getElementById('tipsBody').innerHTML = data.groups.map(g => `
    <div class="tips-group">
      <div class="tips-group-name">${escHtml(g.name)}</div>
      ${g.items.map(item => `
        <div class="tips-item" onclick="executeTip('${item.action}')">
          <span class="tips-key">${escHtml(item.key)}</span>
          <span class="tips-desc" title="${escHtml(item.desc)}">${escHtml(item.desc)}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function toggleTips() {
  tipsOpen = !tipsOpen;
  document.getElementById('tipsPanel').classList.toggle('open', tipsOpen);
  document.getElementById('tipsBtn').classList.toggle('active', tipsOpen);
  if (tipsOpen) renderTipsPanel();
}

function executeTip(actionId) {
  const fn = TIPS_ACTIONS[actionId];
  if (fn) fn();
}

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
  if (taskMode) { if (taskTheme) renderTaskPanel(); else showThemeSelector(); }
}

// ── Progress Persistence ────────────────
const SAVE_KEY = 'MT_v2';

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: '2',
      fs: FS,
      cwd,
      cmdHistory,
      taskThemeId:      taskTheme ? taskTheme.id : null,
      taskIdx,
      completedThemes,
    }));
  } catch(e) {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.version !== '2') { localStorage.removeItem(SAVE_KEY); return; }
    if (d.fs)           Object.keys(d.fs).forEach(k => { FS[k] = d.fs[k]; });
    if (d.cwd)          cwd = d.cwd;
    if (d.cmdHistory)   { cmdHistory = d.cmdHistory; histIdx = cmdHistory.length; }
    if (d.completedThemes) completedThemes = d.completedThemes;
    if (d.taskThemeId) {
      const theme = TASK_THEMES.find(t => t.id === d.taskThemeId);
      if (theme) {
        taskTheme = theme;
        taskIdx   = d.taskIdx || 0;
      }
    }
  } catch(e) { localStorage.removeItem(SAVE_KEY); }
}

function resetProgress() {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
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

function rsFindMatch(from) {
  for (let i = from; i >= 0; i--) {
    if (rsBuf === '' || cmdHistory[i].includes(rsBuf)) { rsMatchIdx = i; return; }
  }
  rsMatchIdx = -1;
}

function renderTerminal() {
  if (mode !== 'normal') return;
  if (rsMode) {
    const match = rsMatchIdx >= 0 ? escHtml(cmdHistory[rsMatchIdx]) : '';
    termEl.innerHTML = termLines.join('') +
      `<div class="prompt-line"><span style="color:#888">(reverse-i-search)\`${escHtml(rsBuf)}':</span> <span class="output-line">${match}<span class="cursor-block"> </span></span></div>`;
    termEl.scrollTop = termEl.scrollHeight;
    return;
  }
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
  if (mode === 'normal')          renderTerminal();
  else if (mode.startsWith('vi')) renderVi();
  if (tipsOpen) renderTipsPanel();
}

function addPromptLine(cmd) { termLines.push(`<div class="prompt-line">${getPrompt()}<span class="output-line">${escHtml(cmd)}</span></div>`); }
function addOutLine(text, cls = 'output-line') {
  if (captureBuf !== null) { captureBuf.push(text); return; }
  termLines.push(`<div class="${cls}">${escHtml(text)}</div>`);
}
function addHtmlLine(html) {
  if (captureBuf !== null) { captureBuf.push(stripHtml(html)); return; }
  termLines.push(`<div>${html}</div>`);
}
function stripHtml(html) { return html.replace(/<[^>]+>/g, ''); }

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
// ── Pipeline helpers ────────────────────
function hasPipeOrRedirect(cmd) { return /[|>]/.test(cmd); }

function runPipeline(raw) {
  // Separate redirect suffix (check >> before >)
  let pipeStr = raw, redirectFile = null, appendMode = false;
  const appendIdx = raw.lastIndexOf('>>');
  const overwriteIdx = raw.lastIndexOf('>');
  if (appendIdx !== -1) {
    pipeStr = raw.slice(0, appendIdx).trimEnd();
    redirectFile = raw.slice(appendIdx + 2).trim();
    appendMode = true;
  } else if (overwriteIdx !== -1) {
    pipeStr = raw.slice(0, overwriteIdx).trimEnd();
    redirectFile = raw.slice(overwriteIdx + 1).trim();
    appendMode = false;
  }

  const stages = pipeStr.split('|').map(s => s.trim()).filter(Boolean);
  let stdin = null;

  for (let i = 0; i < stages.length; i++) {
    const isLastToTerminal = i === stages.length - 1 && !redirectFile;
    if (!isLastToTerminal) {
      captureBuf = [];
      execCmdCore(stages[i], stdin);
      stdin = [...captureBuf];
      captureBuf = null;
    } else {
      execCmdCore(stages[i], stdin);
    }
  }

  if (redirectFile) {
    const content = (stdin || []).join('\n');
    const p = resolvePath(redirectFile);
    if (appendMode && FS[p]?.type === 'file') {
      FS[p].content += (FS[p].content ? '\n' : '') + content;
    } else {
      const parent = p.substring(0, p.lastIndexOf('/')) || '/';
      const name = p.split('/').pop();
      FS[p] = { type: 'file', content };
      if (FS[parent] && !FS[parent].children.includes(name)) FS[parent].children.push(name);
    }
  }
}

// Core command dispatcher — returns isError, accepts optional stdin lines for pipe
function execCmdCore(cmd, stdin) {
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
      case 'wc':    doWc(args, stdin);   break;
      case 'echo':  addOutLine(args.join(' ').replace(/^["']|["']$/g, '')); break;
      case 'mkdir': doMkdir(args); break;
      case 'touch': doTouch(args); break;
      case 'rm':    doRm(args);   break;
      case 'cp':    doCp(args);   break;
      case 'mv':    doMv(args);   break;
      case 'grep':  doGrep(args, stdin); break;
      case 'find':  doFind(args); break;
      case 'clear': termLines = []; break;
      case 'vi': case 'vim': doVi(args); break;
      case 'whoami': addOutLine('user'); break;
      case 'date':  addOutLine(new Date().toLocaleString('zh-TW')); break;
      case 'which': doWhich(args); break;
      case 'help':  doHelp(); break;
      case 'reset': resetProgress(); break;
      default: addOutLine(`zsh: command not found: ${c}`, 'error-line'); isError = true;
    }
  } catch (e) { addOutLine(e.message, 'error-line'); isError = true; }
  return isError;
}

function execCmd(raw) {
  const cmd = raw.trim();
  if (!cmd) { addPromptLine(''); refresh(); return; }
  addPromptLine(cmd);
  cmdHistory.push(cmd);
  histIdx = cmdHistory.length;

  let isError = false;
  if (hasPipeOrRedirect(cmd)) {
    runPipeline(cmd);
  } else {
    isError = execCmdCore(cmd, null);
    if (!isError && !taskMode) {
      const explain = getExplanation(cmd);
      if (explain) setTimeout(() => showHint('explain', `📖 ${explain.title}`, explain.text), 100);
    }
  }
  if (taskMode) checkTaskCompletion(cmd);
  saveProgress();
  refresh();
}

// ── Commands ───────────────────────────
const WHICH_PATHS = {
  ls: '/bin/ls', pwd: '/bin/pwd', cat: '/bin/cat', echo: '/bin/echo', mkdir: '/bin/mkdir',
  rm: '/bin/rm', cp: '/bin/cp', mv: '/bin/mv', date: '/bin/date', clear: '/usr/bin/clear',
  head: '/usr/bin/head', tail: '/usr/bin/tail', wc: '/usr/bin/wc', grep: '/usr/bin/grep',
  find: '/usr/bin/find', touch: '/usr/bin/touch', whoami: '/usr/bin/whoami',
  vi: '/usr/bin/vi', vim: '/usr/bin/vim', which: '/usr/bin/which',
};
function doWhich(args) {
  if (!args.length) { addOutLine('usage: which <command>', 'error-line'); return; }
  args.forEach(cmd => {
    if (WHICH_PATHS[cmd]) addOutLine(WHICH_PATHS[cmd]);
    else addOutLine(`which: ${cmd}: not found`, 'error-line');
  });
}
function fmtSize(bytes, human) {
  if (!human) return String(bytes).padStart(6);
  if (bytes < 1024) return `${bytes}B`.padStart(5);
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`.padStart(5);
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`.padStart(5);
}
function doLs(args) {
  let showAll = false, showLong = false, human = false, target = null;
  for (const a of args) {
    if (a.startsWith('-')) { if (a.includes('a')) showAll = true; if (a.includes('l')) showLong = true; if (a.includes('h')) human = true; }
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
      const bytes = n && n.content ? n.content.length : 4096;
      const cls   = isDir ? 'dir-color' : (n && n.executable ? 'exec-color' : 'file-color');
      addHtmlLine(`<span class="output-line">${perm}  1 user  staff  ${fmtSize(bytes, human)}  Mar 21 10:00  </span><span class="${cls}">${escHtml(name)}</span>`);
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
  (node.content || '').split('\n').forEach(l => addOutLine(l));
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
  (node.content || '').split('\n').slice(0, n).forEach(l => addOutLine(l));
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
  (node.content || '').split('\n').slice(-n).forEach(l => addOutLine(l));
}
function doWc(args, stdin = null) {
  let countLines = false, file = null;
  for (const a of args) { if (a === '-l') countLines = true; else file = a; }
  let lines, label;
  if (file) {
    const p = resolvePath(file), node = FS[p];
    if (!node || node.type === 'dir') { addOutLine(`wc: ${file}: No such file or directory`, 'error-line'); return; }
    lines = node.content.split('\n'); label = file;
  } else if (stdin !== null) {
    lines = stdin; label = '';
  } else {
    addOutLine('usage: wc [-l] <file>', 'error-line'); return;
  }
  const content = lines.join('\n');
  if (countLines) addOutLine(`       ${lines.length}${label ? ' ' + label : ''}`);
  else { const words = content.split(/\s+/).filter(Boolean).length; addOutLine(`       ${lines.length}       ${words}      ${content.length}${label ? ' ' + label : ''}`); }
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
function doGrep(args, stdin = null) {
  if (args.length < 1) { addOutLine('usage: grep <pattern> [<file>]', 'error-line'); return; }
  const pat = args[0];
  let lines;
  if (args.length >= 2) {
    const p = resolvePath(args[1]), node = FS[p];
    if (!node) { addOutLine(`grep: ${args[1]}: No such file or directory`, 'error-line'); return; }
    lines = node.content.split('\n');
  } else if (stdin !== null) {
    lines = stdin;
  } else {
    addOutLine('usage: grep <pattern> [<file>]', 'error-line'); return;
  }
  const re = new RegExp(pat, 'gi');
  lines.forEach(l => {
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
  viState = { path: p, filename: file, lines: FS[p].content.split('\n'), cursorRow: 0, cursorCol: 0, mode: 'normal', commandBuf: '', message: `"${file}" ${FS[p].content.split('\n').length}L, ${FS[p].content.length}C`, modified: false, pendingOp: null, history: [], insertSnapshot: null, insertDirty: false };
  mode = 'vi-normal';
  document.getElementById('modeBadge').textContent = 'VIM - NORMAL';
  document.getElementById('modeBadge').style.color = '#ff6b6b';
  showHint('info', T().viEnterHint, T().viEnterText);
  refresh();
}

function viPushHistory() {
  const v = viState;
  v.history.push({ lines: [...v.lines], cursorRow: v.cursorRow, cursorCol: v.cursorCol });
  if (v.history.length > 100) v.history.shift();
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
      if (v.insertDirty && v.insertSnapshot) {
        v.history.push(v.insertSnapshot);
        if (v.history.length > 100) v.history.shift();
      }
      v.insertSnapshot = null; v.insertDirty = false;
      v.mode = 'normal'; v.cursorCol = Math.max(0, v.cursorCol - 1);
      document.getElementById('modeBadge').textContent = 'VIM - NORMAL';
      if (!taskMode) showHint('explain', T().viEscHint, T().viEscText);
    } else if (key === 'Enter') {
      const l = v.lines[v.cursorRow];
      v.lines[v.cursorRow] = l.substring(0, v.cursorCol);
      v.lines.splice(v.cursorRow + 1, 0, l.substring(v.cursorCol));
      v.cursorRow++; v.cursorCol = 0; v.modified = true; v.insertDirty = true;
    } else if (key === 'Backspace') {
      if (v.cursorCol > 0) {
        const l = v.lines[v.cursorRow];
        v.lines[v.cursorRow] = l.substring(0, v.cursorCol - 1) + l.substring(v.cursorCol);
        v.cursorCol--; v.modified = true; v.insertDirty = true;
      } else if (v.cursorRow > 0) {
        v.cursorCol = v.lines[v.cursorRow - 1].length;
        v.lines[v.cursorRow - 1] += v.lines[v.cursorRow];
        v.lines.splice(v.cursorRow, 1);
        v.cursorRow--; v.modified = true; v.insertDirty = true;
      }
    } else if (key === 'ArrowLeft')  { v.cursorCol = Math.max(0, v.cursorCol - 1); }
    else if (key === 'ArrowRight') { v.cursorCol = Math.min(v.lines[v.cursorRow].length, v.cursorCol + 1); }
    else if (key === 'ArrowUp')    { if (v.cursorRow > 0) { v.cursorRow--; v.cursorCol = Math.min(v.cursorCol, v.lines[v.cursorRow].length); } }
    else if (key === 'ArrowDown')  { if (v.cursorRow < v.lines.length - 1) { v.cursorRow++; v.cursorCol = Math.min(v.cursorCol, v.lines[v.cursorRow].length); } }
    else if (key === 'Tab') {
      const l = v.lines[v.cursorRow];
      v.lines[v.cursorRow] = l.substring(0, v.cursorCol) + '  ' + l.substring(v.cursorCol);
      v.cursorCol += 2; v.modified = true; v.insertDirty = true;
    } else if (key.length === 1) {
      const l = v.lines[v.cursorRow];
      v.lines[v.cursorRow] = l.substring(0, v.cursorCol) + key + l.substring(v.cursorCol);
      v.cursorCol++; v.modified = true; v.insertDirty = true;
    }
  } else {
    const viExpl = T().viExpl;
    switch (key) {
      case 'i': v.insertSnapshot={lines:[...v.lines],cursorRow:v.cursorRow,cursorCol:v.cursorCol}; v.insertDirty=false; v.mode='insert'; document.getElementById('modeBadge').textContent='VIM - INSERT'; break;
      case 'a': v.insertSnapshot={lines:[...v.lines],cursorRow:v.cursorRow,cursorCol:v.cursorCol}; v.insertDirty=false; v.mode='insert'; v.cursorCol=Math.min(v.cursorCol+1,v.lines[v.cursorRow].length); document.getElementById('modeBadge').textContent='VIM - INSERT'; break;
      case 'A': v.insertSnapshot={lines:[...v.lines],cursorRow:v.cursorRow,cursorCol:v.cursorCol}; v.insertDirty=false; v.mode='insert'; v.cursorCol=v.lines[v.cursorRow].length; document.getElementById('modeBadge').textContent='VIM - INSERT'; break;
      case 'o': v.insertSnapshot={lines:[...v.lines],cursorRow:v.cursorRow,cursorCol:v.cursorCol}; v.insertDirty=true; v.lines.splice(v.cursorRow+1,0,''); v.cursorRow++; v.cursorCol=0; v.mode='insert'; document.getElementById('modeBadge').textContent='VIM - INSERT'; v.modified=true; break;
      case 'O': v.insertSnapshot={lines:[...v.lines],cursorRow:v.cursorRow,cursorCol:v.cursorCol}; v.insertDirty=true; v.lines.splice(v.cursorRow,0,''); v.cursorCol=0; v.mode='insert'; document.getElementById('modeBadge').textContent='VIM - INSERT'; v.modified=true; break;
      case 'h': case 'ArrowLeft':  v.cursorCol=Math.max(0,v.cursorCol-1); break;
      case 'l': case 'ArrowRight': v.cursorCol=Math.min(Math.max(0,v.lines[v.cursorRow].length-1),v.cursorCol+1); break;
      case 'j': case 'ArrowDown':  if(v.cursorRow<v.lines.length-1){v.cursorRow++;v.cursorCol=Math.min(v.cursorCol,Math.max(0,v.lines[v.cursorRow].length-1));} break;
      case 'k': case 'ArrowUp':    if(v.cursorRow>0){v.cursorRow--;v.cursorCol=Math.min(v.cursorCol,Math.max(0,v.lines[v.cursorRow].length-1));} break;
      case '0': v.cursorCol=0; break;
      case '$': v.cursorCol=Math.max(0,v.lines[v.cursorRow].length-1); break;
      case 'g': v.cursorRow=0; v.cursorCol=0; break;
      case 'G': v.cursorRow=v.lines.length-1; v.cursorCol=0; break;
      case 'x':
        if (v.lines[v.cursorRow].length > 0) {
          viPushHistory();
          v.lines[v.cursorRow] = v.lines[v.cursorRow].substring(0,v.cursorCol) + v.lines[v.cursorRow].substring(v.cursorCol+1);
          v.cursorCol = Math.min(v.cursorCol, Math.max(0, v.lines[v.cursorRow].length-1));
          v.modified = true;
        }
        break;
      case 'd':
        if (v.pendingOp === 'd') {
          viPushHistory();
          if (v.lines.length > 1) { v.lines.splice(v.cursorRow, 1); v.cursorRow = Math.min(v.cursorRow, v.lines.length - 1); }
          else v.lines[0] = '';
          v.cursorCol = 0; v.modified = true; v.message = '1 line deleted'; v.pendingOp = null;
        } else {
          v.pendingOp = 'd'; v.message = 'd';
        }
        break;
      case 'u':
        if (v.history.length === 0) {
          v.message = 'Already at oldest change';
        } else {
          const snap = v.history.pop();
          v.lines = [...snap.lines];
          v.cursorRow = snap.cursorRow;
          v.cursorCol = snap.cursorCol;
          v.modified = true;
          v.message = '1 change';
        }
        break;
      case ':': v.mode='command'; v.commandBuf=''; v.pendingOp=null; break;
      case 'Escape': v.message=''; v.pendingOp=null; break;
    }
    if (viExpl[key] && !taskMode) showHint('explain', `📖 Vim: ${key}`, viExpl[key]);
  }
  refresh();
}

function viExecCommand(cmd) {
  const v = viState, ce = T().viCmdExpl;
  if (cmd === 'w' || cmd === 'wq' || cmd === 'x') {
    FS[v.path].content = v.lines.join('\n');
    v.message = `"${v.filename}" ${v.lines.length}L written`;
    v.modified = false;
    if (cmd === 'wq' || cmd === 'x') { if (!taskMode) showHint('explain', ce[cmd][0], ce[cmd][1]); taskFlags.viSavedAndQuit = true; exitVi(); }
    else if (!taskMode) showHint('explain', ce['w'][0], ce['w'][1]);
  } else if (cmd === 'q') {
    if (v.modified) v.message = 'E37: No write since last change (add ! to override)';
    else { if (!taskMode) showHint('explain', ce['q'][0], ce['q'][1]); exitVi(); }
  } else if (cmd === 'q!') {
    if (!taskMode) showHint('explain', ce['q!'][0], ce['q!'][1]); exitVi();
  } else if (cmd.match(/^\d+$/)) {
    v.cursorRow = Math.min(parseInt(cmd) - 1, v.lines.length - 1); v.cursorCol = 0;
    if (!taskMode) { const jmp = T().viLineJump(cmd); showHint('explain', jmp[0], jmp[1]); }
  } else {
    v.message = `E492: Not an editor command: ${cmd}`;
  }
}

function exitVi() {
  viState = null; mode = 'normal';
  document.getElementById('modeBadge').textContent = 'NORMAL';
  document.getElementById('modeBadge').style.color = '#aaa';
  taskFlags.viExited = true;
  if (taskMode) checkTaskCompletion('');
  saveProgress();
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

// ── Task Mode ──────────────────────────
function toggleTaskMode() {
  if (taskMode) {
    exitTaskMode();
  } else {
    taskMode = true;
    document.getElementById('taskModeBtn').classList.add('active');
    document.getElementById('taskBar').style.display = 'block';
    if (taskTheme) {
      taskPanelOpen = true;
      renderTaskPanel();
    } else {
      taskPanelOpen = true;
      showThemeSelector();
    }
  }
}

function exitTaskMode() {
  taskMode = false;
  taskTheme = null;
  if (taskAdvanceTimer) { clearTimeout(taskAdvanceTimer); taskAdvanceTimer = null; }
  taskPanelOpen = false;
  document.getElementById('taskModeBtn').classList.remove('active');
  document.getElementById('taskBar').style.display = 'none';
  saveProgress();
}

function toggleTaskPanel() {
  taskPanelOpen = !taskPanelOpen;
  if (taskTheme) renderTaskPanel(); else showThemeSelector();
}

function showThemeSelector() {
  const th = T().themes;
  const body = document.getElementById('taskBarBody');
  document.getElementById('taskBarLabel').textContent = th.selectorTitle;
  document.getElementById('taskBarTitle').textContent = '';
  document.getElementById('taskBackBtn').style.display = 'none';
  const cards = TASK_THEMES.map(theme => {
    const info = th[theme.id];
    const done = completedThemes.includes(theme.id);
    return `<div class="theme-card${done ? ' done' : ''}" onclick="selectTheme('${theme.id}')">` +
      `<span class="theme-card-icon">${theme.icon}</span>` +
      `<span class="theme-card-name">${info.name}</span>` +
      `<span class="theme-card-desc">${info.desc}</span>` +
      `<span class="theme-card-meta">${theme.tasks.length} ${th.tasksLabel}${done ? ' · ✓' : ''}</span>` +
      `</div>`;
  }).join('');
  body.innerHTML = `<div class="theme-selector"><div class="theme-grid">${cards}</div></div>`;
  body.style.display = 'block';
  document.getElementById('taskExpandBtn').classList.add('open');
}

function selectTheme(id) {
  taskTheme = TASK_THEMES.find(t => t.id === id);
  taskIdx = 0; taskHintShown = false; taskFlags = {};
  taskPanelOpen = true;
  document.getElementById('taskBackBtn').style.display = '';
  renderTaskPanel();
  saveProgress();
}

function backToThemeSelector() {
  if (taskAdvanceTimer) { clearTimeout(taskAdvanceTimer); taskAdvanceTimer = null; }
  taskTheme = null; taskIdx = 0; taskFlags = {};
  saveProgress();
  showThemeSelector();
}

function markThemeComplete(id) {
  if (!completedThemes.includes(id)) completedThemes.push(id);
  saveProgress();
}

function renderTaskPanel() {
  const t = T().tasks;
  const th = T().themes;
  const info = t.lists[taskTheme.id][taskIdx];
  const task = taskTheme.tasks[taskIdx];
  document.getElementById('taskBarLabel').textContent =
    `${th[taskTheme.id].name}  ${taskIdx + 1}${t.of}${taskTheme.tasks.length}`;
  document.getElementById('taskBarTitle').textContent = info.title;
  const body = document.getElementById('taskBarBody');
  body.innerHTML =
    `<div class="task-desc" id="taskDesc"></div>` +
    `<div class="task-footer">` +
      `<span class="task-nav-btn" onclick="toggleTaskHint(event)">💡 Hint</span>` +
      `<span class="task-nav-btn" onclick="prevTask()">← Prev</span>` +
      `<span class="task-nav-btn" onclick="skipTask(null)">Skip →</span>` +
      `<span class="task-nav-btn reset-btn" onclick="resetProgress()">↺ Reset</span>` +
    `</div>` +
    `<div class="task-hint-line" id="taskHintLine" style="display:none"></div>`;
  document.getElementById('taskDesc').textContent = info.desc;
  const hintEl2 = document.getElementById('taskHintLine');
  hintEl2.textContent = task.hint;
  hintEl2.style.display = taskHintShown ? 'block' : 'none';
  body.style.display = taskPanelOpen ? 'block' : 'none';
  document.getElementById('taskExpandBtn').classList.toggle('open', taskPanelOpen);
}

function toggleTaskHint(e) {
  if (e) e.stopPropagation();
  taskHintShown = !taskHintShown;
  const el = document.getElementById('taskHintLine');
  if (el) el.style.display = taskHintShown ? 'block' : 'none';
}

function skipTask(e) {
  if (e) e.stopPropagation();
  if (taskAdvanceTimer) { clearTimeout(taskAdvanceTimer); taskAdvanceTimer = null; }
  if (taskTheme && taskIdx < taskTheme.tasks.length - 1) {
    taskIdx++; taskHintShown = false; taskFlags = {}; renderTaskPanel();
  } else {
    backToThemeSelector();
  }
  saveProgress();
}

function prevTask() {
  if (taskAdvanceTimer) { clearTimeout(taskAdvanceTimer); taskAdvanceTimer = null; }
  if (taskIdx > 0) { taskIdx--; taskHintShown = false; taskFlags = {}; renderTaskPanel(); }
  saveProgress();
}

function checkTaskCompletion(raw) {
  if (!taskMode || !taskTheme || taskAdvanceTimer !== null) return;
  const task = taskTheme.tasks[taskIdx];
  if (!task) return;

  const c = task.check;
  let passed = false;

  if (c.type === 'cmd_match') {
    passed = c.pattern.test(raw.trim());
  } else if (c.type === 'cwd_equals') {
    passed = cwd === c.path;
  } else if (c.type === 'fs_new_dir') {
    const base = FS[c.baseDir];
    passed = base && base.children.some(name => !c.builtins.includes(name) && FS[`${c.baseDir}/${name}`]?.type === 'dir');
  } else if (c.type === 'flag') {
    passed = !!taskFlags[c.flag];
    if (passed) taskFlags[c.flag] = false;
  }

  if (!passed) return;

  const t = T().tasks;
  showHint('success', t.successTitle, t.successText.replace('{n}', taskIdx + 1));
  taskAdvanceTimer = setTimeout(() => {
    taskAdvanceTimer = null;
    taskFlags = {};
    if (taskIdx < taskTheme.tasks.length - 1) {
      taskIdx++; taskHintShown = false; renderTaskPanel();
    } else {
      markThemeComplete(taskTheme.id);
      showHint('success', t.allDoneTitle, t.allDoneText);
      setTimeout(() => backToThemeSelector(), 2000);
    }
    saveProgress();
  }, 2500);
}

// ── Smart Hints ────────────────────────
const SMART_HINT_THRESHOLDS = {
  ArrowLeft:  { threshold: 3, hintKey: 'arrowLeft' },
  ArrowRight: { threshold: 3, hintKey: 'arrowRight' },
  Backspace:  { threshold: 4, hintKey: 'backspace' },
  ArrowUp:    { threshold: 5, hintKey: 'arrowUp' },
};

function checkSmartHint(key) {
  if (consecutiveKey.key === key) {
    consecutiveKey.count++;
  } else {
    consecutiveKey = { key, count: 1 };
  }
  const cfg = SMART_HINT_THRESHOLDS[key];
  if (!cfg) return;
  if (consecutiveKey.count === cfg.threshold) {
    const h = T().smartHints[cfg.hintKey];
    showHint('smart', h.title, h.text);
  }
}

// ── Keyboard input ─────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'F5' && e.key !== 'F12') e.preventDefault();
  pressKeyVisual(findKeyId(e));

  if (e.key === 'Shift')   { shiftHeld = true; return; }
  if (e.key === 'Control') { ctrlHeld = true; updateModifierVisual(); return; }
  if (e.key === 'Alt' || e.key === 'Meta') return;

  if (typeof ChallengeEngine !== 'undefined' && ChallengeEngine.active) { ChallengeEngine.handleKey(e.key); return; }
  if (mode.startsWith('vi')) { viHandleKey(e.key); return; }

  // Reverse search mode
  if (rsMode) {
    if (e.key === 'Escape' || (e.ctrlKey && (e.key.toLowerCase() === 'g'))) {
      rsMode = false; inputBuf = rsSaved; cursorPos = inputBuf.length;
    } else if (e.key === 'Enter') {
      rsMode = false;
      const cmd = rsMatchIdx >= 0 ? cmdHistory[rsMatchIdx] : rsBuf;
      inputBuf = ''; cursorPos = 0;
      execCmd(cmd);
    } else if (e.key === 'Backspace') {
      rsBuf = rsBuf.slice(0, -1); rsFindMatch(cmdHistory.length - 1);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'r') {
      if (rsMatchIdx > 0) rsFindMatch(rsMatchIdx - 1); else rsMatchIdx = -1;
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      rsMode = false; inputBuf = ''; cursorPos = 0; addPromptLine('^C');
    } else if (!e.ctrlKey && e.key.length === 1) {
      rsBuf += e.key; rsFindMatch(cmdHistory.length - 1);
    }
    refresh(); return;
  }

  if (e.ctrlKey || ctrlHeld) {
    const k = e.key.toLowerCase();
    switch (k) {
      case 'a': cursorPos = 0; break;
      case 'e': cursorPos = inputBuf.length; break;
      case 'b': cursorPos = Math.max(0, cursorPos - 1); break;
      case 'f': cursorPos = Math.min(inputBuf.length, cursorPos + 1); break;
      case 'u': killBuf = inputBuf.substring(0, cursorPos); inputBuf = inputBuf.substring(cursorPos); cursorPos = 0; break;
      case 'k': killBuf = inputBuf.substring(cursorPos); inputBuf = inputBuf.substring(0, cursorPos); break;
      case 'w': {
        let i = cursorPos - 1;
        while (i >= 0 && inputBuf[i] === ' ') i--;
        while (i >= 0 && inputBuf[i] !== ' ') i--;
        killBuf = inputBuf.substring(i + 1, cursorPos);
        inputBuf = inputBuf.substring(0, i + 1) + inputBuf.substring(cursorPos);
        cursorPos = i + 1;
        break;
      }
      case 'y': inputBuf = inputBuf.substring(0, cursorPos) + killBuf + inputBuf.substring(cursorPos); cursorPos += killBuf.length; break;
      case 'r':
        rsMode = true; rsBuf = ''; rsSaved = inputBuf;
        rsMatchIdx = cmdHistory.length - 1; rsFindMatch(rsMatchIdx);
        break;
      case 'c': inputBuf = ''; cursorPos = 0; addPromptLine('^C'); break;
      case 'l': termLines = []; break;
    }
    if (ctrlExplain[k] && !taskMode) showHint('explain', `📖 ${ctrlExplain[k].title}`, ctrlExplain[k].text);
    refresh(); return;
  }

  if (e.key === 'Enter')       { execCmd(inputBuf); inputBuf = ''; cursorPos = 0; }
  else if (e.key === 'Backspace') { checkSmartHint('Backspace'); if (cursorPos > 0) { inputBuf = inputBuf.substring(0, cursorPos - 1) + inputBuf.substring(cursorPos); cursorPos--; } }
  else if (e.key === 'Delete')    { if (cursorPos < inputBuf.length) inputBuf = inputBuf.substring(0, cursorPos) + inputBuf.substring(cursorPos + 1); }
  else if (e.key === 'ArrowLeft')  { checkSmartHint('ArrowLeft');  cursorPos = Math.max(0, cursorPos - 1); }
  else if (e.key === 'ArrowRight') { checkSmartHint('ArrowRight'); cursorPos = Math.min(inputBuf.length, cursorPos + 1); }
  else if (e.key === 'Home')  { cursorPos = 0; }
  else if (e.key === 'End')   { cursorPos = inputBuf.length; }
  else if (e.key === 'ArrowUp')   { checkSmartHint('ArrowUp'); if (cmdHistory.length > 0) { histIdx = Math.max(0, histIdx - 1); inputBuf = cmdHistory[histIdx] || ''; cursorPos = inputBuf.length; } }
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
loadProgress();
buildKeyboard();
if (typeof ChallengeEngine !== 'undefined') {
  ChallengeEngine.init();
  if (window.location.hash.startsWith('#c=')) {
    ChallengeEngine.deserialize(window.location.hash.slice(3));
  }
}
addHtmlLine(`<span class="output-line" style="color:#888">${T().welcome1}</span>`);
addHtmlLine(`<span class="output-line" style="color:#888">${T().welcome2}</span>`);
addHtmlLine(`<span class="output-line" style="color:#888">${T().separator}</span>`);
refresh();
setTimeout(() => showHint('hint', T().startHintTitle, T().startHintText), 600);

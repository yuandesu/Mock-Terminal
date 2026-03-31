// level-runner.js — Level Mode Engine
// Depends on: levels-data.js (loaded before this)

const LevelRunner = (() => {
  let active    = false;
  let levelType = null;
  let lvl       = null;   // current level
  let wld       = null;   // current world
  let hudEl     = null;

  // cursor level state
  let cbuf    = '';
  let cpos    = 0;
  let ksCount = 0;
  let done    = false;

  // ── Progress ─────────────────────────────
  const lsKey  = id => `lv_${id}`;
  const getBest = id => parseInt(localStorage.getItem(lsKey(id))) || 0;
  function saveBest(id, stars) { if (stars > getBest(id)) localStorage.setItem(lsKey(id), stars); }
  function calcStars(ks, par) { return ks <= par ? 3 : ks <= par * 2 ? 2 : 1; }
  function starsHtml(n, cls) {
    return `<span class="lv-stars ${cls || ''}">${'★'.repeat(n)}<span class="lv-stars-empty">${'★'.repeat(3 - n)}</span></span>`;
  }

  // ── Helpers ──────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
  }
  function getNext() {
    if (!wld || !lvl) return null;
    const i = wld.levels.findIndex(l => l.id === lvl.id);
    return wld.levels[i + 1] || null;
  }

  // ── Map ──────────────────────────────────
  function renderMap() {
    const mapEl = hudEl.querySelector('#lv-map');
    if (!mapEl) return;
    mapEl.innerHTML = WORLDS.map(w => {
      const track = w.levels.map((lv, i) => {
        const stars = getBest(lv.id);
        const done  = stars > 0;
        const connector = i < w.levels.length - 1
          ? `<div class="lv-conn">${lv.boss ? '' : '—'}</div>` : '';
        return `
          <div class="lv-node${lv.boss ? ' lv-boss' : ''}${done ? ' lv-done' : ''}"
               data-id="${lv.id}" data-wid="${w.id}" title="${lv.title}">
            <div class="lv-node-icon">${lv.boss ? '★' : i + 1}</div>
            ${done ? `<div class="lv-node-stars">${'★'.repeat(stars)}</div>` : `<div class="lv-node-label">${lv.title}</div>`}
          </div>${connector}`;
      }).join('');
      return `
        <div class="lv-world-row">
          <div class="lv-world-label">${w.emoji} ${w.title}</div>
          <div class="lv-track">${track}</div>
        </div>`;
    }).join('');
    hudEl.querySelectorAll('.lv-node').forEach(node => {
      node.addEventListener('click', () => {
        const world = WORLDS.find(w => w.id === node.dataset.wid);
        const level = world?.levels.find(l => l.id === node.dataset.id);
        if (level && world) startLevel(level, world);
      });
    });
  }

  // ── Show / hide ──────────────────────────
  function showHud() {
    if (hudEl) hudEl.style.display = 'flex';
    document.querySelector('.terminal-wrap').style.display   = 'none';
    document.querySelector('.keyboard-section').style.display = 'none';
  }
  function hideHud() {
    if (hudEl) hudEl.style.display = 'none';
    document.querySelector('.terminal-wrap').style.display   = '';
    document.querySelector('.keyboard-section').style.display = '';
    hideShellBar();
  }

  function showShellBar() {
    let bar = document.getElementById('lv-shell-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'lv-shell-bar';
      const tw = document.querySelector('.terminal-wrap');
      tw.parentNode.insertBefore(bar, tw);
    }
    bar.style.display = 'flex';
    bar.innerHTML = `
      <div class="lv-shell-task">
        <strong>${lvl.title}</strong>${lvl.boss ? ' <span class="lv-boss-badge">BOSS</span>' : ''}：${lvl.desc}
        ${lvl.hint ? `<span class="lv-hint-badge">💡 ${lvl.hint}</span>` : ''}
      </div>
      <button class="lv-quit-btn" id="lvShellQuit">← Map</button>`;
    bar.querySelector('#lvShellQuit').addEventListener('click', () => showMap());
  }
  function hideShellBar() {
    const bar = document.getElementById('lv-shell-bar');
    if (bar) bar.style.display = 'none';
  }

  // ── Cursor rendering ─────────────────────
  function renderCursor() {
    const el = hudEl.querySelector('#lv-cursor-buf');
    if (!el) return;
    const pre  = esc(cbuf.substring(0, cpos));
    const cur  = esc(cbuf[cpos] || ' ');
    const post = esc(cbuf.substring(cpos + 1));
    el.innerHTML = `<span class="lv-prompt">$ </span>${pre}<span class="ch-cursor">${cur}</span>${post}`;
    const keysEl = hudEl.querySelector('#lv-keys');
    if (keysEl) keysEl.textContent = ksCount;
  }

  // ── Cursor win check ─────────────────────
  function checkCursorWin(viaEnter) {
    if (done) return;
    const w = lvl.win;
    if (w.requireEnter && !viaEnter) return;
    const posTarget = w.cursorAt === 'end' ? cbuf.length : w.cursorAt;
    const posOk = (w.cursorAt === undefined) || cpos === posTarget;
    const bufOk = (w.bufferIs === undefined) || cbuf === w.bufferIs;
    if (posOk && bufOk) winCursorLevel();
  }

  function winCursorLevel() {
    done = true;
    const stars = calcStars(ksCount, lvl.par);
    saveBest(lvl.id, stars);
    const resultEl = hudEl.querySelector('#lv-result');
    if (!resultEl) return;
    resultEl.style.display = 'flex';
    const next = getNext();
    resultEl.innerHTML = `
      ${starsHtml(stars, 'lv-result-stars')}
      <div class="lv-result-sub">${ksCount} key${ksCount !== 1 ? 's' : ''} &nbsp;·&nbsp; Par: ${lvl.par}</div>
      <div class="lv-result-btns">
        ${next ? `<button class="ch-btn" id="lvNext">Next →</button>` : ''}
        <button class="ch-btn ch-exit-btn" id="lvExit">← Map</button>
      </div>`;
    resultEl.querySelector('#lvNext')?.addEventListener('click', () => startLevel(getNext(), wld));
    resultEl.querySelector('#lvExit')?.addEventListener('click', () => showMap());
  }

  // ── Shell win check ──────────────────────
  function afterCommand() {
    if (!active || levelType !== 'shell' || done) return;
    ksCount++;
    const w = lvl.win;
    let ok = false;
    if      (w.dirExists)  ok = typeof FS !== 'undefined' && FS[w.dirExists]?.type === 'dir';
    else if (w.fileExists) ok = typeof FS !== 'undefined' && FS[w.fileExists]?.type === 'file';
    else if (w.allExist)   ok = w.allExist.every(p => typeof FS !== 'undefined' && !!FS[p]);
    if (!ok) return;
    done = true;
    const stars = calcStars(ksCount, lvl.par);
    saveBest(lvl.id, stars);
    showShellWin(stars);
  }

  function showShellWin(stars) {
    const bar = document.getElementById('lv-shell-bar');
    if (!bar) return;
    const next = getNext();
    bar.innerHTML = `
      <div class="lv-shell-win">
        ✅ 完成！${starsHtml(stars)}
        ${next ? `<button class="ch-btn" id="lvShellNext">Next →</button>` : ''}
        <button class="ch-btn ch-exit-btn" id="lvShellExit">← Map</button>
      </div>`;
    bar.querySelector('#lvShellNext')?.addEventListener('click', () => startLevel(next, wld));
    bar.querySelector('#lvShellExit')?.addEventListener('click', () => showMap());
    active = false;
    LevelRunner.active = false;
  }

  // ── Cursor key handler ───────────────────
  function handleKey(e) {
    if (!active || done || levelType !== 'cursor') return;
    ksCount++;
    const k    = e.key;
    const ctrl = e.ctrlKey;
    const alt  = e.altKey;

    if (ctrl) {
      switch (k.toLowerCase()) {
        case 'a': cpos = 0; break;
        case 'e': cpos = cbuf.length; break;
        case 'b': cpos = Math.max(0, cpos - 1); break;
        case 'f': cpos = Math.min(cbuf.length, cpos + 1); break;
        case 'u': cbuf = cbuf.substring(cpos); cpos = 0; break;
        case 'k': cbuf = cbuf.substring(0, cpos); break;
        case 'w': {
          let i = cpos - 1;
          while (i >= 0 && cbuf[i] === ' ') i--;
          while (i >= 0 && cbuf[i] !== ' ') i--;
          cbuf = cbuf.substring(0, i + 1) + cbuf.substring(cpos);
          cpos = i + 1;
          break;
        }
        default: ksCount--; return;
      }
    } else if (alt) {
      switch (k.toLowerCase()) {
        case 'f': {
          let i = cpos;
          while (i < cbuf.length && cbuf[i] === ' ') i++;
          while (i < cbuf.length && cbuf[i] !== ' ') i++;
          cpos = i; break;
        }
        case 'b': {
          let i = cpos - 1;
          while (i >= 0 && cbuf[i] === ' ') i--;
          while (i >= 0 && cbuf[i] !== ' ') i--;
          cpos = i + 1; break;
        }
        case 'd': {
          let i = cpos;
          while (i < cbuf.length && cbuf[i] === ' ') i++;
          while (i < cbuf.length && cbuf[i] !== ' ') i++;
          cbuf = cbuf.substring(0, cpos) + cbuf.substring(i); break;
        }
        default: ksCount--; return;
      }
    } else {
      switch (k) {
        case 'ArrowLeft':  cpos = Math.max(0, cpos - 1); break;
        case 'ArrowRight': cpos = Math.min(cbuf.length, cpos + 1); break;
        case 'Home':       cpos = 0; break;
        case 'End':        cpos = cbuf.length; break;
        case 'Backspace':
          if (cpos > 0) { cbuf = cbuf.substring(0, cpos - 1) + cbuf.substring(cpos); cpos--; } break;
        case 'Delete':
          if (cpos < cbuf.length) cbuf = cbuf.substring(0, cpos) + cbuf.substring(cpos + 1); break;
        case 'Enter':
          renderCursor(); checkCursorWin(true); return;
        case 'Escape': break;
        default:
          if (k.length === 1) { cbuf = cbuf.substring(0, cpos) + k + cbuf.substring(cpos); cpos++; }
          else { ksCount--; return; }
      }
    }
    renderCursor();
    checkCursorWin(false);
  }

  // ── Start level ──────────────────────────
  function startLevel(level, world) {
    if (!level || !world) return;
    lvl  = level;
    wld  = world;
    done = false;
    ksCount = 0;
    levelType = level.type;
    active = true;
    LevelRunner.active = true;
    LevelRunner.levelType = level.type;

    if (levelType === 'cursor') {
      cbuf = level.buffer;
      cpos = level.cursorStart;
      showHud();
      const mapWrap = hudEl.querySelector('#lv-map-wrap');
      const playEl  = hudEl.querySelector('#lv-play');
      if (mapWrap) mapWrap.style.display = 'none';
      if (playEl)  playEl.style.display  = 'flex';
      const titleEl  = hudEl.querySelector('#lv-play-title');
      const descEl   = hudEl.querySelector('#lv-play-desc');
      const hintEl   = hudEl.querySelector('#lv-play-hint');
      const resultEl = hudEl.querySelector('#lv-result');
      if (titleEl)  titleEl.textContent = level.title;
      if (descEl)   descEl.textContent  = level.desc;
      if (hintEl)   hintEl.textContent  = level.hint ? `💡 提示：${level.hint}` : '';
      if (resultEl) resultEl.style.display = 'none';
      renderCursor();

    } else if (levelType === 'shell') {
      // reset to home dir and run setup commands silently
      if (typeof cwd !== 'undefined') cwd = '/home/user';
      if (level.setup?.length && typeof runSilent === 'function') {
        level.setup.forEach(cmd => runSilent(cmd));
      }
      if (typeof refresh === 'function') refresh();
      showShellBar();
    }
  }

  // ── Show map ─────────────────────────────
  function showMap() {
    active = false;
    LevelRunner.active = false;
    LevelRunner.levelType = null;
    levelType = null;
    done = false;
    showHud();
    const mapWrap = hudEl.querySelector('#lv-map-wrap');
    const playEl  = hudEl.querySelector('#lv-play');
    if (mapWrap) { mapWrap.style.display = 'flex'; renderMap(); }
    if (playEl)  playEl.style.display = 'none';
    hideShellBar();
  }

  // ── Init ─────────────────────────────────
  function init() {
    hudEl = document.getElementById('level-hud');
    if (!hudEl) return;
    hudEl.innerHTML = `
      <div id="lv-map-wrap" style="display:none;flex-direction:column;flex:1;overflow-y:auto">
        <div class="lv-map-header">
          <span class="lv-map-title">📚 Levels</span>
          <button class="lv-quit-btn" id="lvMapClose">✕</button>
        </div>
        <div id="lv-map"></div>
      </div>
      <div id="lv-play" style="display:none;flex-direction:column;flex:1;padding:24px 28px;gap:12px">
        <div class="lv-play-top">
          <button class="lv-quit-btn" id="lvPlayBack">← Map</button>
          <span class="lv-play-title-text" id="lv-play-title"></span>
        </div>
        <div class="lv-play-desc" id="lv-play-desc"></div>
        <div class="lv-play-hint" id="lv-play-hint"></div>
        <div class="lv-cursor-area">
          <div id="lv-cursor-buf" class="lv-cursor-buf"></div>
        </div>
        <div class="lv-play-footer">Keys:&nbsp;<strong id="lv-keys">0</strong></div>
        <div id="lv-result" style="display:none;flex-direction:column;align-items:center;gap:16px;padding:32px 0"></div>
      </div>`;
    hudEl.querySelector('#lvMapClose').addEventListener('click', () => hideHud());
    hudEl.querySelector('#lvPlayBack').addEventListener('click', () => showMap());
  }

  return { active: false, levelType: null, init, showMap, handleKey, afterCommand };
})();

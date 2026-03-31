// challenge.js — Vim Challenge Mode Engine
// Depends on: challenge-scenarios.js (loaded before this)

const ChallengeEngine = (() => {
  // ── Private state ──────────────────────
  let active         = false;
  let scenario       = null;
  let cv             = null;   // isolated vim state
  let yankBuf        = '';
  let keystrokeCount = 0;
  let keystrokeLog   = [];     // [{k, t}] — key + delta ms from prev event
  let startTime      = null;
  let prevEventTime  = null;
  let timerInterval  = null;
  let opponentData   = null;   // {keystrokes, ms} decoded from friend's URL
  let completed      = false;
  let hudEl          = null;

  // ── Helpers ────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/ /g, '&nbsp;');
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function elapsedStr() {
    if (!startTime) return '0:00';
    const s = Math.floor((Date.now() - startTime) / 1000);
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  }

  function lsKey(id) { return `ch_best_${id}`; }

  function getPersonalBest() {
    try { return JSON.parse(localStorage.getItem(lsKey(scenario.id))); } catch { return null; }
  }

  function savePersonalBest(ks, ms) {
    const best = getPersonalBest();
    if (!best || ks < best.ks || (ks === best.ks && ms < best.ms)) {
      localStorage.setItem(lsKey(scenario.id), JSON.stringify({ ks, ms }));
    }
  }

  // ── Word motion helpers ────────────────
  function wordForward(lines, row, col) {
    const line = lines[row];
    let c = col;
    while (c < line.length && /\S/.test(line[c])) c++;
    while (c < line.length && /\s/.test(line[c])) c++;
    return [row, Math.min(c, Math.max(0, line.length - 1))];
  }

  function wordEnd(lines, row, col) {
    const line = lines[row];
    let c = col + 1;
    if (c >= line.length) return [row, col];
    while (c < line.length - 1 && /\s/.test(line[c])) c++;
    while (c < line.length - 1 && /\S/.test(line[c + 1])) c++;
    return [row, c];
  }

  function wordBack(lines, row, col) {
    const line = lines[row];
    let c = col - 1;
    if (c < 0) return [row, 0];
    while (c > 0 && /\s/.test(line[c])) c--;
    while (c > 0 && /\S/.test(line[c - 1])) c--;
    return [row, c];
  }

  // ── Text object: find symmetric delimiter pair ──
  function findDelimPair(line, col, delim) {
    const pos = [];
    for (let i = 0; i < line.length; i++) if (line[i] === delim) pos.push(i);
    for (let i = 0; i + 1 < pos.length; i += 2) {
      if (col >= pos[i] && col <= pos[i + 1]) return [pos[i], pos[i + 1]];
    }
    return null;
  }

  // ── Vim history ────────────────────────
  function pushHistory() {
    cv.history.push({ lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol });
    if (cv.history.length > 50) cv.history.shift();
  }

  function execCmd(cmd) {
    if (/^\d+$/.test(cmd)) {
      cv.cursorRow = Math.min(parseInt(cmd) - 1, cv.lines.length - 1);
      cv.cursorCol = 0;
    } else {
      cv.message = `E492: Not an editor command: ${cmd}`;
    }
  }

  // ── Key handler (superset of app.js viHandleKey) ──
  function handleKey(key) {
    if (!active || !cv || completed) return;

    const now = Date.now();
    keystrokeLog.push({ k: key, t: prevEventTime ? now - prevEventTime : 0 });
    prevEventTime = now;
    keystrokeCount++;

    if (cv.mode === 'command') {
      if      (key === 'Enter')     { execCmd(cv.commandBuf); cv.commandBuf = ''; cv.mode = 'normal'; }
      else if (key === 'Escape')    { cv.commandBuf = ''; cv.mode = 'normal'; }
      else if (key === 'Backspace') { cv.commandBuf = cv.commandBuf.slice(0, -1); if (!cv.commandBuf) cv.mode = 'normal'; }
      else if (key.length === 1)    cv.commandBuf += key;

    } else if (cv.mode === 'insert') {
      if (key === 'Escape') {
        if (cv.insertDirty && cv.insertSnapshot) {
          cv.history.push(cv.insertSnapshot);
          if (cv.history.length > 50) cv.history.shift();
        }
        cv.insertSnapshot = null; cv.insertDirty = false;
        cv.mode = 'normal'; cv.cursorCol = Math.max(0, cv.cursorCol - 1);
      } else if (key === 'Enter') {
        const l = cv.lines[cv.cursorRow];
        cv.lines[cv.cursorRow] = l.substring(0, cv.cursorCol);
        cv.lines.splice(cv.cursorRow + 1, 0, l.substring(cv.cursorCol));
        cv.cursorRow++; cv.cursorCol = 0; cv.insertDirty = true;
      } else if (key === 'Backspace') {
        if (cv.cursorCol > 0) {
          const l = cv.lines[cv.cursorRow];
          cv.lines[cv.cursorRow] = l.substring(0, cv.cursorCol - 1) + l.substring(cv.cursorCol);
          cv.cursorCol--; cv.insertDirty = true;
        } else if (cv.cursorRow > 0) {
          cv.cursorCol = cv.lines[cv.cursorRow - 1].length;
          cv.lines[cv.cursorRow - 1] += cv.lines[cv.cursorRow];
          cv.lines.splice(cv.cursorRow, 1);
          cv.cursorRow--; cv.insertDirty = true;
        }
      } else if (key === 'ArrowLeft')  { cv.cursorCol = Math.max(0, cv.cursorCol - 1); }
      else if (key === 'ArrowRight') { cv.cursorCol = Math.min(cv.lines[cv.cursorRow].length, cv.cursorCol + 1); }
      else if (key === 'ArrowUp')    { if (cv.cursorRow > 0) { cv.cursorRow--; cv.cursorCol = Math.min(cv.cursorCol, cv.lines[cv.cursorRow].length); } }
      else if (key === 'ArrowDown')  { if (cv.cursorRow < cv.lines.length - 1) { cv.cursorRow++; cv.cursorCol = Math.min(cv.cursorCol, cv.lines[cv.cursorRow].length); } }
      else if (key.length === 1) {
        const l = cv.lines[cv.cursorRow];
        cv.lines[cv.cursorRow] = l.substring(0, cv.cursorCol) + key + l.substring(cv.cursorCol);
        cv.cursorCol++; cv.insertDirty = true;
      }

    } else { // normal mode

      // ── Text object execution (ci/ca + delimiter char) ──
      if (cv.pendingOp === 'ci' || cv.pendingOp === 'ca') {
        const isInner   = cv.pendingOp === 'ci';
        const closeMap  = { '(': ')', '[': ']', '{': '}', '<': '>' };
        const line      = cv.lines[cv.cursorRow];
        let range = null;

        if (closeMap[key]) {
          // bracket pair — search outward from cursor position
          let depth = 0, l = -1, r = -1;
          for (let i = cv.cursorCol; i >= 0; i--) {
            if (line[i] === closeMap[key]) depth++;
            if (line[i] === key) { if (depth === 0) { l = i; break; } depth--; }
          }
          depth = 0;
          for (let i = cv.cursorCol; i < line.length; i++) {
            if (line[i] === key) depth++;
            if (line[i] === closeMap[key]) { if (depth === 0) { r = i; break; } depth--; }
          }
          if (l !== -1 && r !== -1) range = [l, r];
        } else {
          range = findDelimPair(line, cv.cursorCol, key);
        }

        if (range) {
          pushHistory();
          const [l, r] = range;
          const start  = isInner ? l + 1 : l;
          const end    = isInner ? r     : r + 1;
          cv.lines[cv.cursorRow] = line.substring(0, start) + line.substring(end);
          cv.cursorCol = start;
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = false;
          cv.mode = 'insert';
        }
        cv.pendingOp = null;
        render(); checkWin(); return;
      }

      // ── Operator chains ──
      if (cv.pendingOp === 'c') {
        if (key === 'i') { cv.pendingOp = 'ci'; render(); return; }
        if (key === 'a') { cv.pendingOp = 'ca'; render(); return; }
        if (key === 'c') { // cc — change whole line
          pushHistory();
          cv.lines[cv.cursorRow] = ''; cv.cursorCol = 0;
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = true; cv.mode = 'insert'; cv.pendingOp = null;
          render(); checkWin(); return;
        }
        cv.pendingOp = null;
      }

      if (cv.pendingOp === 'd') {
        if (key === 'd') {
          pushHistory();
          if (cv.lines.length > 1) { cv.lines.splice(cv.cursorRow, 1); cv.cursorRow = Math.min(cv.cursorRow, cv.lines.length - 1); }
          else cv.lines[0] = '';
          cv.cursorCol = 0; cv.message = '1 line deleted'; cv.pendingOp = null;
          render(); checkWin(); return;
        }
        cv.pendingOp = null;
      }

      if (cv.pendingOp === 'y') {
        if (key === 'y') {
          yankBuf = cv.lines[cv.cursorRow] + '\n';
          cv.message = '1 line yanked'; cv.pendingOp = null;
          render(); return;
        }
        cv.pendingOp = null;
      }

      // ── Normal mode keys ──
      switch (key) {
        case 'i':
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = false; cv.mode = 'insert';
          break;
        case 'a':
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = false; cv.mode = 'insert';
          cv.cursorCol = Math.min(cv.cursorCol + 1, cv.lines[cv.cursorRow].length);
          break;
        case 'A':
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = false; cv.mode = 'insert';
          cv.cursorCol = cv.lines[cv.cursorRow].length;
          break;
        case 'o':
          pushHistory();
          cv.lines.splice(cv.cursorRow + 1, 0, ''); cv.cursorRow++; cv.cursorCol = 0;
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = true; cv.mode = 'insert';
          break;
        case 'O':
          pushHistory();
          cv.lines.splice(cv.cursorRow, 0, ''); cv.cursorCol = 0;
          cv.insertSnapshot = { lines: [...cv.lines], cursorRow: cv.cursorRow, cursorCol: cv.cursorCol };
          cv.insertDirty = true; cv.mode = 'insert';
          break;
        case 'h': case 'ArrowLeft':
          cv.cursorCol = Math.max(0, cv.cursorCol - 1); break;
        case 'l': case 'ArrowRight':
          cv.cursorCol = Math.min(Math.max(0, cv.lines[cv.cursorRow].length - 1), cv.cursorCol + 1); break;
        case 'j': case 'ArrowDown':
          if (cv.cursorRow < cv.lines.length - 1) { cv.cursorRow++; cv.cursorCol = Math.min(cv.cursorCol, Math.max(0, cv.lines[cv.cursorRow].length - 1)); } break;
        case 'k': case 'ArrowUp':
          if (cv.cursorRow > 0) { cv.cursorRow--; cv.cursorCol = Math.min(cv.cursorCol, Math.max(0, cv.lines[cv.cursorRow].length - 1)); } break;
        case '0': cv.cursorCol = 0; break;
        case '$': cv.cursorCol = Math.max(0, cv.lines[cv.cursorRow].length - 1); break;
        case 'g': cv.cursorRow = 0; cv.cursorCol = 0; break;
        case 'G': cv.cursorRow = cv.lines.length - 1; cv.cursorCol = 0; break;
        case 'w': { const [r, c] = wordForward(cv.lines, cv.cursorRow, cv.cursorCol); cv.cursorRow = r; cv.cursorCol = c; break; }
        case 'b': { const [r, c] = wordBack(cv.lines, cv.cursorRow, cv.cursorCol); cv.cursorRow = r; cv.cursorCol = c; break; }
        case 'e': { const [r, c] = wordEnd(cv.lines, cv.cursorRow, cv.cursorCol); cv.cursorRow = r; cv.cursorCol = c; break; }
        case 'x':
          if (cv.lines[cv.cursorRow].length > 0) {
            pushHistory();
            cv.lines[cv.cursorRow] = cv.lines[cv.cursorRow].substring(0, cv.cursorCol) + cv.lines[cv.cursorRow].substring(cv.cursorCol + 1);
            cv.cursorCol = Math.min(cv.cursorCol, Math.max(0, cv.lines[cv.cursorRow].length - 1));
          }
          break;
        case 'd': cv.pendingOp = 'd'; break;
        case 'y': cv.pendingOp = 'y'; break;
        case 'c': cv.pendingOp = 'c'; break;
        case 'p':
          if (yankBuf.endsWith('\n')) {
            pushHistory();
            cv.lines.splice(cv.cursorRow + 1, 0, yankBuf.slice(0, -1));
            cv.cursorRow++; cv.cursorCol = 0;
          } else if (yankBuf) {
            pushHistory();
            const l = cv.lines[cv.cursorRow];
            cv.lines[cv.cursorRow] = l.substring(0, cv.cursorCol + 1) + yankBuf + l.substring(cv.cursorCol + 1);
            cv.cursorCol += yankBuf.length;
          }
          break;
        case 'P':
          if (yankBuf.endsWith('\n')) {
            pushHistory();
            cv.lines.splice(cv.cursorRow, 0, yankBuf.slice(0, -1));
            cv.cursorCol = 0;
          }
          break;
        case 'u':
          if (cv.history.length > 0) {
            const snap = cv.history.pop();
            cv.lines = [...snap.lines]; cv.cursorRow = snap.cursorRow; cv.cursorCol = snap.cursorCol;
            cv.message = '1 change';
          }
          break;
        case ':': cv.mode = 'command'; cv.commandBuf = ''; cv.pendingOp = null; break;
        case 'Escape': cv.message = ''; cv.pendingOp = null; break;
      }
    }

    render();
    checkWin();
  }

  // ── Win condition ─────────────────────
  function checkWin() {
    if (!active || completed || !cv) return;
    if (cv.mode !== 'normal') return;
    if (cv.lines.join('\n') === scenario.target) {
      completed = true;
      clearInterval(timerInterval);
      const ms = Date.now() - startTime;
      savePersonalBest(keystrokeCount, ms);
      showResult(keystrokeCount, ms);
    }
  }

  // ── Render editor + stats ──────────────
  function render() {
    if (!hudEl || !cv) return;
    const editorEl = hudEl.querySelector('#ch-editor');
    if (!editorEl) return;

    let html = '';
    const numLines = Math.max(cv.lines.length, 3);
    for (let i = 0; i < numLines; i++) {
      if (i < cv.lines.length) {
        let line = esc(cv.lines[i]);
        if (cv.mode === 'normal' && i === cv.cursorRow) {
          const ch = cv.lines[i][cv.cursorCol] || ' ';
          line = esc(cv.lines[i].substring(0, cv.cursorCol)) +
            `<span class="ch-cursor">${esc(ch)}</span>` +
            esc(cv.lines[i].substring(cv.cursorCol + 1));
        } else if (cv.mode === 'insert' && i === cv.cursorRow) {
          line = esc(cv.lines[i].substring(0, cv.cursorCol)) +
            `<span class="cursor-block">&nbsp;</span>` +
            esc(cv.lines[i].substring(cv.cursorCol));
        }
        html += `<div class="output-line">${line || '&nbsp;'}</div>`;
      } else {
        html += `<div class="vi-tilde">~</div>`;
      }
    }
    let status = '';
    if      (cv.mode === 'insert')  status = '-- INSERT --';
    else if (cv.mode === 'command') status = ':' + esc(cv.commandBuf);
    else status = esc(cv.message || (cv.pendingOp ? cv.pendingOp : ''));
    html += `<div class="vi-status">${status}<span style="float:right">${cv.cursorRow + 1},${cv.cursorCol + 1}</span></div>`;
    editorEl.innerHTML = html;

    const keysEl = hudEl.querySelector('#ch-keys');
    if (keysEl) keysEl.textContent = keystrokeCount;

    const parEl = hudEl.querySelector('#ch-par-indicator');
    if (parEl && keystrokeCount > 0) {
      const diff = keystrokeCount - scenario.par_keystrokes;
      if (diff < 0)       { parEl.textContent = 'Under par!'; parEl.className = 'ch-par-good'; }
      else if (diff === 0){ parEl.textContent = 'At par';     parEl.className = 'ch-par-good'; }
      else                { parEl.textContent = `+${diff} over par`; parEl.className = 'ch-par-over'; }
    } else if (parEl) {
      parEl.textContent = '';
    }
  }

  // ── Result card ────────────────────────
  function showResult(ks, ms) {
    render();
    const resultEl = hudEl.querySelector('#ch-result');
    if (!resultEl) return;
    resultEl.style.display = 'flex';

    const secs    = (ms / 1000).toFixed(1);
    const parKs   = scenario.par_keystrokes;
    const parSecs = scenario.par_seconds;
    const grade   = ks <= parKs ? '✅ Under par' : ks <= parKs * 2 ? '⚠️ Over par' : '❌ Way over par';

    let oppHtml = '';
    if (opponentData) {
      const oppSecs = (opponentData.ms / 1000).toFixed(1);
      const youWin  = ks < opponentData.keystrokes || (ks === opponentData.keystrokes && ms < opponentData.ms);
      oppHtml = `<div class="ch-opp">${youWin ? '🏆 You beat them!' : '💀 They beat you.'}&nbsp; Opponent: ${opponentData.keystrokes} keys / ${oppSecs}s</div>`;
    }

    const best    = getPersonalBest();
    const bestHtml = best
      ? `<div class="ch-best">Personal best: ${best.ks} keys / ${(best.ms / 1000).toFixed(1)}s</div>`
      : '';

    resultEl.innerHTML = `
      <div class="ch-result-score">
        ${grade}<br>
        <strong>${ks} keys</strong> / ${secs}s &nbsp; <span class="ch-par-ref">Par: ${parKs} / ${parSecs}s</span>
      </div>
      ${oppHtml}
      ${bestHtml}
      <div class="ch-result-btns">
        <button class="ch-btn ch-share-btn" id="chShareBtn">🔗 Challenge a friend</button>
        <button class="ch-btn" id="chNextBtn">Next →</button>
        <button class="ch-btn ch-exit-btn" id="chExitBtn">✕ Exit</button>
      </div>
    `;

    hudEl.querySelector('#chShareBtn').addEventListener('click', () => {
      const url = getShareUrl(ks, ms);
      navigator.clipboard.writeText(url).then(() => {
        const btn = hudEl.querySelector('#chShareBtn');
        if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { if (btn) btn.textContent = '🔗 Challenge a friend'; }, 2000); }
      });
    });

    hudEl.querySelector('#chNextBtn').addEventListener('click', () => {
      const idx  = CHALLENGE_SCENARIOS.findIndex(s => s.id === scenario.id);
      const next = CHALLENGE_SCENARIOS[(idx + 1) % CHALLENGE_SCENARIOS.length];
      pickScenario(next);
    });

    hudEl.querySelector('#chExitBtn').addEventListener('click', () => exit());
  }

  // ── URL encode / decode ───────────────
  function serialize(ks, ms) {
    const data = { sid: scenario.id, ks, ms, log: keystrokeLog };
    const full = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    if (full.length <= 1500) return full;
    return btoa(unescape(encodeURIComponent(JSON.stringify({ sid: scenario.id, ks, ms }))));
  }

  function getShareUrl(ks, ms) {
    return `${location.origin}${location.pathname}#c=${serialize(ks, ms)}`;
  }

  // ── Show / hide mechanics ─────────────
  function showHud() {
    hudEl.style.display = 'flex';
    document.querySelector('.terminal-wrap').style.display   = 'none';
    document.querySelector('.keyboard-section').style.display = 'none';
    const btn = document.getElementById('challengeBtn');
    if (btn) btn.classList.add('active');
  }

  function hideHud() {
    hudEl.style.display = 'none';
    document.querySelector('.terminal-wrap').style.display   = '';
    document.querySelector('.keyboard-section').style.display = '';
    const btn = document.getElementById('challengeBtn');
    if (btn) btn.classList.remove('active');
  }

  // ── Scenario lifecycle ─────────────────
  function startScenario(sc) {
    scenario      = sc;
    yankBuf       = '';
    keystrokeCount = 0;
    keystrokeLog  = [];
    prevEventTime = null;
    completed     = false;

    cv = {
      lines:          scenario.buffer.split('\n'),
      cursorRow:      scenario.cursor[0],
      cursorCol:      scenario.cursor[1],
      mode:           'normal',
      commandBuf:     '',
      message:        '',
      pendingOp:      null,
      history:        [],
      insertSnapshot: null,
      insertDirty:    false
    };

    clearInterval(timerInterval);
    startTime = Date.now();

    // Populate static fields
    const titleEl = hudEl.querySelector('#ch-title');
    const descEl  = hudEl.querySelector('#ch-desc');
    const parEl   = hudEl.querySelector('#ch-par-ref-bar');
    const tgtEl   = hudEl.querySelector('#ch-target-buf');
    const resEl   = hudEl.querySelector('#ch-result');
    if (titleEl) titleEl.textContent = sc.title;
    if (descEl)  descEl.textContent  = sc.description;
    if (parEl)   parEl.textContent   = `Par: ${sc.par_keystrokes} keys / ${sc.par_seconds}s`;
    if (tgtEl)   tgtEl.textContent   = sc.target;
    if (resEl)   resEl.style.display = 'none';

    timerInterval = setInterval(() => {
      const timerEl = hudEl.querySelector('#ch-timer-val');
      if (timerEl && !completed) timerEl.textContent = elapsedStr();
    }, 500);

    active = true;
    ChallengeEngine.active = true;
    render();
  }

  function pickScenario(sc) {
    opponentData = null; // clear opponent when manually picking
    const menuEl = hudEl.querySelector('#ch-menu');
    const mainEl = hudEl.querySelector('#ch-main');
    if (menuEl) menuEl.style.display = 'none';
    if (mainEl) mainEl.style.display = 'flex';
    startScenario(sc);
  }

  function exit() {
    active = false;
    ChallengeEngine.active = false;
    clearInterval(timerInterval);
    cv = null;
    hideHud();
  }

  // ── Menu ──────────────────────────────
  function showMenu() {
    if (!hudEl) return;
    const menuEl = hudEl.querySelector('#ch-menu');
    const mainEl = hudEl.querySelector('#ch-main');
    if (menuEl) menuEl.style.display = 'flex';
    if (mainEl) mainEl.style.display = 'none';
    showHud();
    // Refresh best scores on open
    hudEl.querySelectorAll('.ch-card').forEach(card => {
      const sc   = CHALLENGE_SCENARIOS.find(s => s.id === card.dataset.id);
      if (!sc) return;
      const best = (() => { try { return JSON.parse(localStorage.getItem(lsKey(sc.id))); } catch { return null; } })();
      const bestEl = card.querySelector('.ch-card-best');
      if (bestEl) bestEl.textContent = best ? `${best.ks}k / ${(best.ms / 1000).toFixed(1)}s` : '';
    });
  }

  // ── Deserialize from URL fragment ─────
  function deserialize(fragment) {
    if (!hudEl) return;
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(fragment))));
      const sc   = CHALLENGE_SCENARIOS.find(s => s.id === data.sid);
      if (!sc) { showMenu(); return; }

      opponentData = { keystrokes: data.ks, ms: data.ms };
      const menuEl = hudEl.querySelector('#ch-menu');
      const mainEl = hudEl.querySelector('#ch-main');
      if (menuEl) menuEl.style.display = 'none';
      if (mainEl) mainEl.style.display = 'flex';
      showHud();
      startScenario(sc);
    } catch (e) {
      showMenu();
    }
  }

  // ── Init (called once after DOM ready) ─
  function init() {
    hudEl = document.getElementById('challenge-hud');
    if (!hudEl) return;

    const cards = CHALLENGE_SCENARIOS.map(sc => {
      const best = (() => { try { return JSON.parse(localStorage.getItem(lsKey(sc.id))); } catch { return null; } })();
      return `
        <div class="ch-card" data-id="${sc.id}">
          <div class="ch-card-title">${sc.title}</div>
          <div class="ch-card-desc">${sc.description}</div>
          <div class="ch-card-meta">Par: ${sc.par_keystrokes} keys / ${sc.par_seconds}s
            <span class="ch-card-best">${best ? `${best.ks}k / ${(best.ms / 1000).toFixed(1)}s` : ''}</span>
          </div>
        </div>`;
    }).join('');

    hudEl.innerHTML = `
      <div id="ch-menu" style="display:none;flex-direction:column;flex:1">
        <div class="ch-menu-header">
          <span class="ch-menu-title">⚡ Vim Challenge</span>
          <button class="ch-close-btn" id="chMenuClose">✕ Exit</button>
        </div>
        <div class="ch-menu-sub">Pick a challenge. Solve it in the fewest keystrokes possible.</div>
        <div class="ch-cards">${cards}</div>
      </div>
      <div id="ch-main" style="display:none;flex-direction:column;flex:1;min-height:0">
        <div class="ch-info-bar">
          <div class="ch-info-left">
            <span class="ch-title-text" id="ch-title"></span>
            <span class="ch-desc-text" id="ch-desc"></span>
          </div>
          <div class="ch-timer-box">⏱ <span id="ch-timer-val">0:00</span></div>
        </div>
        <div class="ch-target-area">
          <div class="ch-section-label">TARGET</div>
          <pre id="ch-target-buf" class="ch-target-buf"></pre>
        </div>
        <div class="ch-section-label">YOUR BUFFER</div>
        <div id="ch-editor" class="ch-editor"></div>
        <div class="ch-stats-bar">
          <span>Keys:&nbsp;<strong id="ch-keys">0</strong></span>
          <span id="ch-par-indicator"></span>
          <span id="ch-par-ref-bar" class="ch-par-ref-bar"></span>
          <button class="ch-btn ch-exit-sm" id="chMainExit">✕</button>
        </div>
        <div id="ch-result" style="display:none"></div>
      </div>
    `;

    hudEl.querySelectorAll('.ch-card').forEach(card => {
      card.addEventListener('click', () => {
        const sc = CHALLENGE_SCENARIOS.find(s => s.id === card.dataset.id);
        if (sc) pickScenario(sc);
      });
    });

    hudEl.querySelector('#chMenuClose').addEventListener('click', () => exit());
    hudEl.querySelector('#chMainExit').addEventListener('click', () => exit());
  }

  return {
    active:      false,
    init,
    showMenu,
    handleKey,
    deserialize
  };
})();

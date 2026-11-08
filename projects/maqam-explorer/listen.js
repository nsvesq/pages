// Maqam Explorer — Listen & Identify
// Records or loads a melody, tracks its pitch (YIN) in the browser, folds the
// pitches into 24 quarter-tone pitch classes, and ranks every maqam/tonic pair.
// Depends on globals from index.html: MAQAMAT, AJNAS, MOST_COMMON, ALL_ROOTS,
// noteName, ddMaqam, ddKey, ddAcc, render, isPlaying, toggleDrone.
(function () {
  'use strict';

  const SR = 11025;          // analysis sample rate
  const WIN = 768, HOP = 256; // YIN window / hop (samples at SR)
  const FMIN = 60, FMAX = 900;
  const MAX_REC = 45;        // seconds

  const $ = id => document.getElementById(id);
  let actx = null, srcBlob = null, srcBuf = null, srcUrl = null, lastResult = null, selIdx = 0;

  function ctx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  const status = t => { $('lsStatus').textContent = t; };
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // ── Decoding / resampling ────────────────────────────────────────────
  function decode(ab) {
    const c = ctx();
    return new Promise((res, rej) => {
      const p = c.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }
  async function toMono(buf, start, len) {
    len = Math.max(0.5, Math.min(len, buf.duration - start));
    const off = new OfflineAudioContext(1, Math.ceil(len * SR), SR);
    const s = off.createBufferSource();
    s.buffer = buf; s.connect(off.destination); s.start(0, start, len);
    const r = await off.startRendering();
    return r.getChannelData(0);
  }

  // ── YIN pitch tracking ───────────────────────────────────────────────
  async function track(x, onProg) {
    const tMin = Math.floor(SR / FMAX), tMax = Math.ceil(SR / FMIN);
    const n = Math.max(0, Math.floor((x.length - WIN - tMax - 2) / HOP));
    const rms = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let s = 0; const o = k * HOP;
      for (let j = 0; j < WIN; j++) { const v = x[o + j]; s += v * v; }
      rms[k] = Math.sqrt(s / WIN);
    }
    const sorted = Array.from(rms).sort((a, b) => a - b);
    const loud = sorted[Math.floor(n * 0.95)] || 0;
    const gate = Math.max(0.002, loud * 0.08);
    const d = new Float32Array(tMax + 2);
    const out = new Array(n);
    for (let k = 0; k < n; k++) {
      const o = k * HOP, t = (o + WIN / 2) / SR;
      if (rms[k] < gate) { out[k] = { t, f: 0 }; continue; }
      for (let tau = 1; tau <= tMax + 1; tau++) {
        let s = 0;
        for (let j = 0; j < WIN; j++) { const df = x[o + j] - x[o + j + tau]; s += df * df; }
        d[tau] = s;
      }
      let run = 0;
      for (let tau = 1; tau <= tMax + 1; tau++) { run += d[tau]; d[tau] = run > 0 ? d[tau] * tau / run : 1; }
      let tau = -1;
      for (let i = tMin; i <= tMax; i++) {
        if (d[i] < 0.15) { while (i + 1 <= tMax && d[i + 1] < d[i]) i++; tau = i; break; }
      }
      if (tau < 0) {
        let m = tMin;
        for (let i = tMin; i <= tMax; i++) if (d[i] < d[m]) m = i;
        if (d[m] < 0.3) tau = m;
      }
      if (tau < 0) { out[k] = { t, f: 0 }; continue; }
      const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a - 2 * b + c;
      const shift = den !== 0 ? Math.max(-1, Math.min(1, 0.5 * (a - c) / den)) : 0;
      out[k] = { t, f: SR / (tau + shift) };
      if (k % 100 === 0) { onProg && onProg(k / n); await new Promise(r => setTimeout(r, 0)); }
    }
    return out;
  }

  // ── Pitch → quarter-tone pitch classes ───────────────────────────────
  function summarise(frames) {
    const dt = HOP / SR;
    const c = frames.map(p => p.f > 0 ? 1200 * Math.log2(p.f / 440) + 6900 : NaN);
    const m = c.map((v, i) => {
      if (isNaN(v)) return NaN;
      const w = [];
      for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < c.length && !isNaN(c[k])) w.push(c[k]);
      w.sort((p, q) => p - q);
      return w[w.length >> 1];
    });
    const stable = m.map((v, i) => !isNaN(v) && i > 0 && i < m.length - 1 &&
      !isNaN(m[i - 1]) && !isNaN(m[i + 1]) && Math.abs(v - m[i - 1]) < 30 && Math.abs(v - m[i + 1]) < 30);

    // Global tuning offset: circular mean of cents mod 50 (works for ½ and ¼ tones)
    let sx = 0, sy = 0, cnt = 0;
    m.forEach((v, i) => {
      if (!stable[i]) return;
      const ang = (((v % 50) + 50) % 50) / 50 * 2 * Math.PI;
      sx += Math.cos(ang); sy += Math.sin(ang); cnt++;
    });
    let off = cnt ? Math.atan2(sy, sx) / (2 * Math.PI) * 50 : 0;
    if (cnt && Math.hypot(sx, sy) / cnt < 0.2) off = 0;

    const hist = new Float64Array(24);
    let tot = 0;
    const q = m.map((v, i) => stable[i] ? Math.round((v - off) / 50) : null);
    q.forEach(v => { if (v === null) return; hist[((v % 24) + 24) % 24]++; tot++; });
    if (tot) for (let b = 0; b < 24; b++) hist[b] /= tot;

    // Note events (runs of the same quarter-tone)
    const events = [];
    let cur = null;
    q.forEach((v, i) => {
      if (v === null) { if (cur && i - cur.end > 3) cur = null; return; }
      if (cur && cur.q === v && i - cur.end <= 3) { cur.end = i; return; }
      cur = { q: v, start: i, end: i }; events.push(cur);
    });
    events.forEach(e => e.dur = (e.end - e.start + 1) * dt);
    const solid = events.filter(e => e.dur >= 0.15);
    const pc = v => ((v % 24) + 24) % 24;
    const lastE = solid.length ? solid[solid.length - 1] : events[events.length - 1];
    const lowE = solid.reduce((lo, e) => (!lo || e.q < lo.q ? e : lo), null);
    const longest = {};
    solid.forEach(e => { longest[pc(e.q)] = (longest[pc(e.q)] || 0) + e.dur; });

    const voiced = frames.filter(p => p.f > 0).length;
    return {
      frames, cents: m, stable, off, hist, events: solid,
      finalBin: lastE ? pc(lastE.q) : -1,
      lowBin: lowE ? pc(lowE.q) : -1,
      stableSec: tot * dt, coverage: frames.length ? voiced / frames.length : 0,
      duration: frames.length * dt,
    };
  }

  // ── Matching ─────────────────────────────────────────────────────────
  function templates() {
    const groups = {};
    Object.keys(MAQAMAT).forEach(name => {
      const iv = MAQAMAT[name].intervals;
      const sig = iv.join(',');
      if (!groups[sig]) {
        const rel = [0]; let cum = 0;
        for (let i = 0; i < iv.length - 1; i++) { cum += iv[i]; rel.push(Math.round(cum * 2)); }
        groups[sig] = { names: [], rel };
      }
      groups[sig].names.push(name);
    });
    return Object.values(groups).map(g => {
      g.names.sort((a, b) => (MOST_COMMON.indexOf(b) >= 0) - (MOST_COMMON.indexOf(a) >= 0));
      return g;
    });
  }

  function match(sum) {
    const h = sum.hist, res = [];
    templates().forEach(g => {
      let best = null;
      for (let T = 0; T < 24; T++) {
        const S = g.rel.map(r => (r + T) % 24);
        let inMass = 0, cov = 0;
        S.forEach(b => { inMass += h[b]; if (h[b] >= 0.02) cov++; });
        const tonic = 0.45 * (sum.finalBin === T) + 0.25 * (sum.lowBin === T) + 0.3 * Math.min(1, h[T] * 5);
        const score = (2 * inMass - 1) + 0.15 * (cov / 7) + 0.4 * tonic;
        if (!best || score > best.score) best = { score, T, S, inMass, cov };
      }
      res.push(Object.assign({ names: g.names, rel: g.rel }, best));
    });
    res.sort((a, b) => b.score - a.score);
    const top = res[0].score;
    let z = 0;
    res.forEach(r => { r.w = Math.exp((r.score - top) / 0.06); z += r.w; });
    res.forEach(r => { r.p = r.w / z; });
    return res;
  }

  // ── Naming ───────────────────────────────────────────────────────────
  function accPref() { const a = (typeof ddAcc !== 'undefined' && ddAcc.get()) || 'auto'; return a === 'auto' ? 'flats' : a; }
  function binName(b) {
    b = ((b % 24) + 24) % 24;
    if (b % 2 === 0) return noteName(b / 2, 'C', accPref());
    return noteName(((b + 1) / 2) % 12, 'C', accPref()) + '¼♭';
  }
  const rootFor = T => T % 2 === 0 ? ALL_ROOTS[T / 2] : ALL_ROOTS[((T + 1) / 2) % 12] + '¼♭';

  // ── Analysis entry point ─────────────────────────────────────────────
  async function analyse() {
    if (!srcBuf) return;
    const start = parseFloat($('lsStart').value) || 0;
    const len = parseFloat($('lsLen').value) || 30;
    $('lsGo').disabled = true;
    try {
      status('Preparing audio…');
      const x = await toMono(srcBuf, start, len);
      const frames = await track(x, p => status('Listening… ' + Math.round(p * 100) + '%'));
      const sum = summarise(frames);
      if (sum.stableSec < 1.5) {
        $('lsResult').hidden = true;
        status('Not enough clear melody was detected. Try a solo instrument or voice, a little closer to the mic, with less background sound.');
        return;
      }
      sum.start = start;
      lastResult = { sum, ranks: match(sum) };
      selIdx = 0;
      status('');
      showResult();
    } catch (e) {
      console.error(e);
      status('Could not analyse this audio: ' + (e && e.message ? e.message : e));
    } finally {
      $('lsGo').disabled = false;
    }
  }

  // ── Results UI ───────────────────────────────────────────────────────
  function showResult() {
    const { sum, ranks } = lastResult;
    const r = ranks[selIdx];
    const name = r.names[0], mq = MAQAMAT[name];
    const p = r.p;
    const conf = selIdx > 0 ? '' :
      (p >= 0.7 && r.inMass >= 0.85) ? '<span class="ls-conf hi">Fairly sure</span>' :
      (p >= 0.4) ? '<span class="ls-conf mid">Possible</span>' :
      '<span class="ls-conf lo">Uncertain</span>';
    const also = r.names.length > 1 ? '<div class="ls-why">Same notes and intervals as: ' + r.names.slice(1).join(', ') + '.</div>' : '';
    const why = [];
    why.push(Math.round(r.inMass * 100) + '% of the steady notes you played sit on this scale');
    if (sum.finalBin === r.T) why.push('the melody comes to rest on ' + binName(r.T));
    else if (sum.lowBin === r.T) why.push('the lowest steady note is ' + binName(r.T));
    const ajn = (typeof AJNAS !== 'undefined' && AJNAS[name]) ? AJNAS[name].map(j => (JINS[j[0]].name || j[0])).join(' + ') : '';

    const res = $('lsResult');
    res.hidden = false;
    res.innerHTML =
      '<div class="ls-best">' +
        '<div class="ls-kicker">' + (selIdx === 0 ? 'Best fit for this passage' : 'Alternative #' + (selIdx + 1)) + '</div>' +
        '<div class="ls-name"><b>' + name + '</b><span>' + mq.arabic + '</span></div>' +
        '<div class="ls-line">Tonic: <b>' + binName(r.T) + '</b> · ' + Math.round(p * 100) + '% ' + conf + '</div>' +
        '<div class="ls-why">' + why.join(', and ') + '.' + (ajn ? ' Ajnas: ' + ajn + '.' : '') + '</div>' +
        also +
        '<div class="ls-btns">' +
          '<button class="ls-btn" type="button" id="lsShow">Show in explorer ↑</button>' +
          '<button class="ls-btn ghost" type="button" id="lsScale">▶ Play this scale</button>' +
          '<button class="ls-btn ghost" type="button" id="lsPass2">▶ Your passage</button>' +
        '</div>' +
      '</div>' +
      '<div><div class="slabel">Every maqam, ranked</div><div class="ls-rank" id="lsRank"></div></div>' +
      '<div><div class="slabel">Notes you played</div><div class="ls-hist" id="lsHist"></div>' +
        '<div class="ls-legend"><span><b style="background:var(--navy)"></b>Tonic</span><span><b style="background:var(--teal)"></b>In ' + name + '</span><span><b style="background:var(--accent)"></b>Outside the scale</span></div></div>' +
      '<div><div class="slabel">Pitch trace</div><canvas id="lsTrace"></canvas>' +
        '<div class="ls-legend"><span>Lines = notes of ' + name + ' on ' + binName(r.T) + ' (the tonic is bold)</span></div></div>' +
      '<div class="ls-meta">Pitch tracked in ' + Math.round(sum.coverage * 100) + '% of the passage · ' +
        sum.stableSec.toFixed(1) + ' s of steady notes · tuning ' + (sum.off >= 0 ? '+' : '') + Math.round(sum.off) + ' cents from A440.<br>' +
        'These are suggestions, not a definitive identification — trust your ear. Maqamat that share the same notes (for example Rast and Bayati) are told apart mainly by the tonic and where the melody rests, so end your phrase on the tonic for the best result.</div>';

    // Ranked list (top 8)
    const rank = $('lsRank');
    ranks.slice(0, 8).forEach((c, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ls-row' + (i === selIdx ? ' sel' : '');
      row.innerHTML = '<span><b>' + c.names[0] + '</b> <small>on ' + binName(c.T) + '</small></span>' +
        '<span class="ls-bar"><i style="width:' + Math.max(1, c.p * 100) + '%"></i></span>' +
        '<span class="ls-pct">' + (c.p < 0.01 ? '<1' : Math.round(c.p * 100)) + '%</span>';
      row.addEventListener('click', () => { selIdx = i; showResult(); });
      rank.appendChild(row);
    });

    // Histogram, ordered from the tonic upward
    const hist = $('lsHist');
    const inSet = new Set(r.S);
    const max = Math.max.apply(null, Array.from(sum.hist));
    for (let k = 0; k < 24; k++) {
      const b = (r.T + k) % 24, v = sum.hist[b];
      if (v < 0.01 && !inSet.has(b)) continue;
      const col = document.createElement('div');
      col.className = 'ls-hcol' + (b === r.T ? ' ton' : inSet.has(b) ? '' : ' out');
      col.innerHTML = '<i style="height:' + (max ? v / max * 85 : 0) + 'px"></i><span>' + binName(b) + '</span>';
      col.title = binName(b) + ': ' + Math.round(v * 100) + '% of steady notes';
      hist.appendChild(col);
    }

    drawTrace(sum, r);
    $('lsShow').onclick = () => showInExplorer(name, r.T);
    $('lsScale').onclick = () => playScale(r, sum.off);
    $('lsPass2').onclick = playPassage;
  }

  function drawTrace(sum, r) {
    const cv = $('lsTrace');
    const W = cv.offsetWidth || 600, H = W < 500 ? 180 : 220;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = '#f2ede4'; g.fillRect(0, 0, W, H);
    const vals = sum.cents.filter((v, i) => sum.stable[i]).sort((a, b) => a - b);
    if (!vals.length) return;
    let lo = vals[Math.floor(vals.length * 0.02)] - 80, hi = vals[Math.floor(vals.length * 0.98)] + 80;
    if (hi - lo < 800) { const mid = (hi + lo) / 2; lo = mid - 400; hi = mid + 400; }
    const L = 44, R = W - 8, T = 8, B = H - 8;
    const y = c => B - (c - lo) / (hi - lo) * (B - T);
    const n = sum.cents.length, x = i => L + i / Math.max(1, n - 1) * (R - L);
    const inSet = new Set(r.S);
    // scale lines
    g.font = '600 10px "Source Sans 3",sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = Math.floor((lo - sum.off) / 50); k <= Math.ceil((hi - sum.off) / 50); k++) {
      const b = ((k % 24) + 24) % 24;
      if (!inSet.has(b)) continue;
      const yy = y(k * 50 + sum.off);
      if (yy < T || yy > B) continue;
      const ton = b === r.T;
      g.strokeStyle = ton ? 'rgba(26,39,68,.55)' : 'rgba(26,39,68,.14)';
      g.lineWidth = ton ? 1.6 : 1;
      g.beginPath(); g.moveTo(L, yy); g.lineTo(R, yy); g.stroke();
      g.fillStyle = ton ? '#1a2744' : 'rgba(26,39,68,.55)';
      g.fillText(binName(b), L - 6, yy);
    }
    // pitch dots
    sum.cents.forEach((v, i) => {
      if (isNaN(v) || v < lo || v > hi) return;
      let col = 'rgba(106,112,144,.35)', rad = 1.2;
      if (sum.stable[i]) {
        const b = ((Math.round((v - sum.off) / 50) % 24) + 24) % 24;
        col = inSet.has(b) ? (b === r.T ? '#1a2744' : '#2a7c7a') : '#c04a2a';
        rad = 1.8;
      }
      g.fillStyle = col; g.beginPath(); g.arc(x(i), y(v), rad, 0, Math.PI * 2); g.fill();
    });
  }

  function showInExplorer(name, T) {
    ddMaqam.setValue(name);
    ddKey.setValue(rootFor(T));
    render();
    if (window.showTab) window.showTab('scale', { noScroll: true });
    document.querySelector('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Sound ────────────────────────────────────────────────────────────
  function pluck(f, t0, dur) {
    const c = ctx();
    const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.Q.value = 1;
    lp.frequency.setValueAtTime(Math.min(8000, f * 8), t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(lp); lp.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function playScale(r, off) {
    const c = ctx();
    let base = r.T * 50 + 4800 + off;           // tonic around C3–C4
    if (base < 5100) base += 1200;
    const steps = r.rel.concat([24]).map(s => base + s * 50);
    const seq = steps.concat(steps.slice(0, -1).reverse());
    const t0 = c.currentTime + 0.05;
    seq.forEach((cents, i) => pluck(440 * Math.pow(2, (cents - 6900) / 1200), t0 + i * 0.38, i === seq.length - 1 ? 1.6 : 0.9));
  }
  let passTimer = null;
  function playPassage() {
    const a = $('lsAudio'); if (!a.src) return;
    const start = parseFloat($('lsStart').value) || 0, len = parseFloat($('lsLen').value) || 30;
    clearTimeout(passTimer);
    a.currentTime = start; a.play();
    passTimer = setTimeout(() => a.pause(), len * 1000);
  }

  // ── Sources: recording & files ───────────────────────────────────────
  async function loadBlob(blob, label, autoRun) {
    status('Loading audio…');
    try {
      const ab = await blob.arrayBuffer();
      srcBuf = await decode(ab);
    } catch (e) {
      status('This audio format could not be decoded by your browser. Try MP3, WAV or M4A.');
      return;
    }
    srcBlob = blob;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    srcUrl = URL.createObjectURL(blob);
    $('lsAudio').src = srcUrl;
    $('lsSrcName').textContent = label + ' · ' + fmt(srcBuf.duration);
    const st = $('lsStart');
    st.max = Math.max(0, Math.floor(srcBuf.duration - 1));
    st.value = 0; $('lsStartLbl').textContent = '0:00';
    $('lsLen').value = srcBuf.duration <= 15 ? '15' : srcBuf.duration <= 30 ? '30' : srcBuf.duration <= 45 ? '45' : '30';
    $('lsSrc').hidden = false;
    $('lsResult').hidden = true;
    status('');
    if (autoRun) analyse();
  }

  let mr = null, recStream = null, recTimer = null, recT0 = 0;
  async function toggleRec() {
    const btn = $('lsRec');
    if (mr && mr.state === 'recording') { mr.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { status('Recording is not supported in this browser — load an audio file instead.'); return; }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      status('Microphone access was blocked. Allow the microphone for this site and try again.');
      return;
    }
    if (typeof isPlaying !== 'undefined' && isPlaying) toggleDrone(); // keep the drone out of the recording
    const chunks = [];
    mr = new MediaRecorder(recStream);
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      clearInterval(recTimer);
      recStream.getTracks().forEach(t => t.stop());
      btn.classList.remove('on'); btn.textContent = '● Record';
      $('lsTimer').textContent = '';
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      loadBlob(blob, 'Your recording', true);
    };
    mr.start();
    recT0 = Date.now();
    btn.classList.add('on'); btn.textContent = '■ Stop';
    status('Recording… play your melody, then press Stop (max ' + MAX_REC + ' s).');
    recTimer = setInterval(() => {
      const s = (Date.now() - recT0) / 1000;
      $('lsTimer').textContent = fmt(s) + ' / ' + fmt(MAX_REC);
      if (s >= MAX_REC && mr.state === 'recording') mr.stop();
    }, 200);
  }

  $('lsRec').addEventListener('click', toggleRec);
  $('lsFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) { status('That file is very large — please use one under 60 MB.'); return; }
    loadBlob(f, f.name, false);
    e.target.value = '';
  });
  $('lsGo').addEventListener('click', analyse);
  $('lsPlayPass').addEventListener('click', playPassage);
  $('lsStart').addEventListener('input', e => { $('lsStartLbl').textContent = fmt(parseFloat(e.target.value) || 0); });
  window.addEventListener('resize', () => { if (lastResult && !$('lsResult').hidden) drawTrace(lastResult.sum, lastResult.ranks[selIdx]); });

  // Exposed for testing
  window.MaqamListen = { loadBlob, analyse, track, summarise, match, binName, get result() { return lastResult; } };
})();

// Maqam Explorer — Note Finder (Identify tab)
// Names every note in a recording, live mic or shared browser tab in quarter tones,
// with cents off and the Arabic note name. Pitch detection is the McLeod pitch method.
// Uses MaqamListen (listen.js) for note spelling and to hand audio to "Find the maqam".
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  if (!$('nfFile')) return;

  // Arabic names by quarter-tone index from C (0 = C, 1 = C¼♯ … 23 = B¼♯)
  const ARABIC = { 0: 'Rast', 2: 'Zirkulah', 4: 'Dukah', 6: 'Kurdi', 7: 'Sikah', 8: 'Busalik', 10: 'Jaharkah', 12: 'Hijaz',
                   14: 'Nawa', 16: 'Hisar', 17: 'Tik Hisar', 18: 'Husayni', 20: 'Ajam', 21: 'Awj', 22: 'Mahur' };
  const FALLBACK = ['C', 'D♭¼♭', 'D♭', 'D¼♭', 'D', 'E♭¼♭', 'E♭', 'E¼♭', 'E', 'F¼♭', 'F', 'G♭¼♭', 'G♭', 'G¼♭', 'G', 'A♭¼♭',
                    'A♭', 'A¼♭', 'A', 'B♭¼♭', 'B♭', 'B¼♭', 'B', 'C¼♭'];
  const qName = qi => (window.MaqamListen && MaqamListen.binName) ? MaqamListen.binName(qi) : FALLBACK[qi];

  const S = { ref: 440, minMs: 90, clarity: 0.8 };
  let frames = [], hop = 0.0116, notes = [], sm = [], buffer = null, blob = null, label = '', mode = null;
  let playCtx = null, playSrc = null, playStart = 0, playOffset = 0, raf = 0;
  const srcBtns = new Map([['mic', $('nfMic')], ['tab', $('nfTab')], ['self', $('nfYtListen')]]);
  let rec = null, recChunks = [], recToken = 0, pendingRec = Promise.resolve();
  let liveCtx = null, liveStream = null, analyser = null, liveT0 = 0, lastSeg = 0, heardAt = 0, silentHint = false, liveKind = '';

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const status = t => { $('nfStatus').textContent = t; };
  const toMidi = f => 69 + 12 * Math.log2(f / S.ref);
  function nameOf(m) {
    const q = Math.round(m * 2) / 2, qi = ((Math.round(q * 2)) % 24 + 24) % 24;
    // octave follows the letter: C¼♭ (just below C) belongs to the octave above
    return { q, qi, oct: Math.floor((q + 0.5) / 12) - 1, name: qName(qi), ar: ARABIC[qi] || '', cents: Math.round((m - q) * 100) };
  }

  // ── Pitch detection (McLeod pitch method) ──────────────────────────
  function detect(x, sr) {
    const n = x.length; let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
    const y = new Float32Array(n); let e = 0; for (let i = 0; i < n; i++) { const v = x[i] - mean; y[i] = v; e += v * v; }
    const rms = Math.sqrt(e / n); if (rms < 1e-4) return { rms, f0: 0, clarity: 0 };
    const minLag = Math.max(2, Math.floor(sr / 1100)), maxLag = Math.min(n - 2, Math.ceil(sr / 60));
    const d = new Float32Array(maxLag + 2); let m = 2 * e;
    for (let t = 0; t <= maxLag + 1; t++) {
      if (t > 0) m -= y[t - 1] * y[t - 1] + y[n - t] * y[n - t];
      let a = 0; for (let i = 0, L = n - t; i < L; i++) a += y[i] * y[i + t];
      d[t] = m > 0 ? 2 * a / m : 0;
    }
    let t = 1; while (t <= maxLag && d[t] > 0) t++;
    const peaks = []; let best = -1, bt = 0, pos = false;
    for (; t <= maxLag; t++) {
      if (d[t] > 0) { pos = true; if (d[t] > best) { best = d[t]; bt = t; } }
      else if (pos) { peaks.push([bt, best]); best = -1; pos = false; }
    }
    if (pos && best > 0) peaks.push([bt, best]);
    const ok = peaks.filter(p => p[0] >= minLag); if (!ok.length) return { rms, f0: 0, clarity: 0 };
    const mx = Math.max(...ok.map(p => p[1])); const [pt, pv] = ok.find(p => p[1] >= 0.9 * mx);
    const a = d[pt - 1], b = d[pt], c = d[pt + 1], den = a - 2 * b + c; const sh = den ? 0.5 * (a - c) / den : 0;
    return { rms, f0: sr / (pt + sh), clarity: pv };
  }
  function decimate(x, sr) {
    const f = Math.max(1, Math.round(sr / 11025)); if (f === 1) return { x, sr };
    const n = Math.floor(x.length / f), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += x[i * f + k]; o[i] = s / f; }
    return { x: o, sr: sr / f };
  }
  function mono(buf) {
    const n = buf.length, c = buf.numberOfChannels, o = new Float32Array(n);
    for (let ch = 0; ch < c; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) o[i] += d[i] / c; }
    return o;
  }
  async function analyse(buf) {
    const { x, sr } = decimate(mono(buf), buf.sampleRate);
    const N = 2 ** Math.round(Math.log2(sr * 0.046)), H = N / 4; hop = H / sr;
    const out = [], total = Math.max(1, Math.floor((x.length - N) / H));
    $('nfProg').hidden = false;
    for (let i = 0, k = 0; i + N <= x.length; i += H, k++) {
      out.push({ t: (i + N / 2) / sr, ...detect(x.subarray(i, i + N), sr) });
      if (k % 300 === 0) { $('nfProg').firstChild.style.width = (100 * k / total) + '%'; await new Promise(r => setTimeout(r)); }
    }
    $('nfProg').hidden = true;
    return out;
  }

  // ── Note segmentation ──────────────────────────────────────────────
  function median(a) { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; }
  function segment(fr, h) {
    if (!fr.length) return { sm: [], notes: [] };
    const rs = fr.map(f => f.rms).sort((a, b) => a - b); const gate = Math.max(0.004, rs[Math.floor(rs.length * .95)] * 0.08);
    const raw = fr.map(f => f.f0 > 0 && f.clarity >= S.clarity && f.rms >= gate ? toMidi(f.f0) : null);
    const smooth = raw.map((v, i) => { if (v == null) return null; const w = []; for (let j = i - 2; j <= i + 2; j++) if (raw[j] != null) w.push(raw[j]); return median(w); });
    const out = []; let cur = null, dev = 0, gap = 0;
    const close = () => { if (cur && (cur.end - cur.start) * 1000 >= S.minMs) { const m = median(cur.vals); out.push({ start: cur.start, end: cur.end, midi: m, ...nameOf(m) }); } cur = null; dev = 0; };
    for (let i = 0; i < fr.length; i++) {
      const v = smooth[i], t = fr[i].t;
      if (v == null) { if (cur && ++gap > 3) close(); continue; }
      gap = 0;
      if (cur) {
        const prevR = (fr[i - 1]?.rms + fr[i - 2]?.rms + fr[i - 3]?.rms) / 3;
        const onset = i > 3 && fr[i].rms > 1.6 * prevR && i - cur.idx > 4;
        if (onset) close();
        else if (Math.abs(v - cur.ref) > 0.6) { if (++dev < 3) continue; close(); }
        else dev = 0;
      }
      if (!cur) cur = { start: t - h / 2, idx: i, vals: [] };
      cur.vals.push(v); cur.end = t + h / 2; cur.ref = median(cur.vals.slice(-7));
    }
    close();
    return { sm: smooth, notes: out };
  }
  function resegment() { const s = segment(frames, hop); notes = s.notes; sm = s.sm; }
  function spread(ns) { const h = new Array(24).fill(0); let s = 0; ns.forEach(n => { const d = n.end - n.start; h[n.qi] += d; s += d; }); return s ? h.map(v => v / s) : h; }

  // ── Drawing ────────────────────────────────────────────────────────
  function setupCanvas(cv, w, h) {
    const r = window.devicePixelRatio || 1;
    cv.width = Math.round(w * r); cv.height = Math.round(h * r); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); return c;
  }
  let view = { t0: 0, pps: 1, left: 44 };
  function drawTrace(playT) {
    const box = $('nfTraceBox'); if (!box.clientWidth) return;
    const H = 260, left = 44;
    const t1 = frames.length ? frames[frames.length - 1].t + hop : 4;
    const t0 = mode === 'live' ? Math.max(0, t1 - 12) : 0;
    const span = Math.max(1, t1 - t0), pps = Math.max((box.clientWidth - left - 8) / span, mode === 'live' ? 0 : 60);
    const W = Math.max(box.clientWidth, left + span * pps + 8);
    const c = setupCanvas($('nfTrace'), W, H);
    const vis = notes.filter(n => n.end >= t0), ms = vis.map(n => n.midi);
    let lo = ms.length ? Math.min(...ms) - 1.5 : 45, hi = ms.length ? Math.max(...ms) + 1.5 : 60;
    if (hi - lo < 12) { const m = (hi + lo) / 2; lo = m - 6; hi = m + 6; }
    view = { t0, pps, left };
    const X = t => left + (t - t0) * pps, Y = m => H - 12 - (m - lo) / (hi - lo) * (H - 24);
    c.fillStyle = css('--white') || '#fff'; c.fillRect(0, 0, W, H);
    c.font = '11px "Source Sans 3", sans-serif'; c.textBaseline = 'middle';
    for (let q = Math.ceil(lo * 2) / 2; q <= hi; q += 0.5) {
      const y = Math.round(Y(q)) + .5, whole = q % 1 === 0;
      c.strokeStyle = css('--paper'); c.setLineDash(whole ? [] : [2, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(left, y); c.lineTo(W, y); c.stroke();
      if (whole) { const nm = nameOf(q); c.fillStyle = css('--muted'); c.fillText(nm.name + nm.oct, 4, y); }
    }
    c.setLineDash([]);
    c.fillStyle = css('--teal');
    for (let i = 0; i < frames.length; i++) { const v = sm[i]; if (v == null || frames[i].t < t0 || v < lo || v > hi) continue; c.fillRect(X(frames[i].t) - 1, Y(v) - 1, 2, 2); }
    c.font = '600 12px "Source Sans 3", sans-serif'; c.textBaseline = 'bottom';
    vis.forEach(n => {
      const x = X(Math.max(n.start, t0)), w = X(n.end) - x, y = Y(n.midi);
      c.fillStyle = css('--gold'); c.globalAlpha = .9; c.fillRect(x, y - 3, Math.max(2, w), 6); c.globalAlpha = 1;
      if (w > 22) { c.fillStyle = css('--navy'); c.fillText(n.name, x, y - 6); }
    });
    if (playT != null) { const x = X(playT); c.strokeStyle = css('--accent'); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  }
  function drawHist() {
    const h = spread(notes), cv = $('nfHist'), W = cv.parentElement.clientWidth; if (!W) return;
    const H = 140, c = setupCanvas(cv, W, H), bw = W / 24, mx = Math.max(...h, 0.0001);
    c.font = '10px "Source Sans 3", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let i = 0; i < 24; i++) {
      const bh = h[i] / mx * (H - 34);
      c.fillStyle = i % 2 ? css('--accent') : css('--teal'); c.globalAlpha = h[i] ? 1 : .15;
      c.fillRect(i * bw + 1, H - 20 - bh, bw - 2, Math.max(1, bh)); c.globalAlpha = 1;
      if (i % 2 === 0) { c.fillStyle = css('--muted'); c.fillText(qName(i), i * bw + bw / 2, H - 16); }
    }
  }
  function renderNotes() {
    const box = $('nfNotes'); box.textContent = '';
    $('nfCount').textContent = notes.length ? '· ' + notes.length : '';
    $('nfCopy').disabled = !notes.length;
    if (!notes.length) { const s = document.createElement('span'); s.className = 'nf-empty'; s.textContent = 'No notes yet.'; box.appendChild(s); }
    const first = Math.max(0, notes.length - 300);
    notes.slice(first).forEach((n, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nf-chip'; b.dataset.i = first + k;
      const nb = document.createElement('b'); nb.textContent = n.name + n.oct;
      const sp = document.createElement('span'); sp.textContent = (n.ar ? n.ar + ' · ' : '') + (n.cents > 0 ? '+' : '') + n.cents + '¢';
      b.append(nb, sp); b.title = Math.round((n.end - n.start) * 1000) + ' ms';
      b.onclick = () => { if (buffer) playFrom(n.start, n.end); };
      box.appendChild(b);
    });
    drawHist();
  }
  function redraw() { drawTrace(); renderNotes(); $('nfClear').disabled = !frames.length && !buffer; }
  function showCurrent(m, f) {
    const big = $('nfBig');
    if (m == null) { big.textContent = '–'; $('nfAr').innerHTML = '&nbsp;'; $('nfHz').innerHTML = '&nbsp;'; $('nfNeedle').style.left = 'calc(50% - 5px)'; return; }
    const n = nameOf(m); big.textContent = n.name; const s = document.createElement('small'); s.textContent = n.oct; big.appendChild(s);
    $('nfAr').textContent = n.ar || ' ';
    $('nfHz').textContent = (f ? f.toFixed(1) + ' Hz · ' : '') + (n.cents > 0 ? '+' : '') + n.cents + ' cents';
    const p = Math.max(-25, Math.min(25, n.cents)), nd = $('nfNeedle');
    nd.style.left = `calc(${50 + p * 2}% - 5px)`;
    nd.style.background = Math.abs(n.cents) < 8 ? css('--teal') : css('--accent');
  }

  // ── File / sample ──────────────────────────────────────────────────
  async function loadBuffer(buf, lbl, srcBlob) {
    stopAll(); recToken++; resetMaqam(); mode = 'file'; buffer = buf; blob = srcBlob || null; label = lbl;
    status('Analysing ' + lbl + '…');
    frames = await analyse(buf); resegment(); redraw(); showCurrent(null);
    $('nfPlay').disabled = false; $('nfStop').disabled = true; $('nfMaqam').disabled = false;
    status(notes.length ? `${lbl}: ${notes.length} notes over ${buf.duration.toFixed(1)} s. Tap a note to hear it.`
                        : `${lbl}: no clear notes found. Try a lower clarity threshold in Settings.`);
    if (notes.length) identify(false);
  }
  $('nfFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      status('Decoding ' + f.name + '…');
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await f.arrayBuffer());
      await loadBuffer(buf, f.name, f);
    } catch (err) { status('Could not read that file. Try an MP3, M4A or WAV.'); }
    e.target.value = '';
  });
  function makeSample() {
    const sr = 22050, dur = 0.34, seq = [50, 51.5, 53, 55, 57, 55, 53, 51.5, 50, 51.5, 53, 51.5, 50];
    const len = Math.ceil(sr * (dur * seq.length + 0.6)), x = new Float32Array(len);
    seq.forEach((m, k) => {
      const f = 440 * 2 ** ((m - 69) / 12), s0 = Math.floor(k * dur * sr);
      for (let i = 0; i < sr * 0.9 && s0 + i < len; i++) {
        const t = i / sr, env = Math.min(1, t / 0.004) * Math.exp(-t / 0.28); let v = 0;
        for (let hN = 1; hN <= 8; hN++) v += Math.sin(2 * Math.PI * f * hN * t + hN) * (hN === 1 ? 0.6 : 0.9 / hN) * Math.exp(-t * hN * 0.8);
        x[s0 + i] += v * env * 0.25;
      }
    });
    const b = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: sr }); b.copyToChannel(x, 0); return b;
  }
  function toWav(buf) {
    const x = mono(buf), n = x.length, dv = new DataView(new ArrayBuffer(44 + n * 2)), sr = buf.sampleRate;
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    return new Blob([dv], { type: 'audio/wav' });
  }
  $('nfSample').addEventListener('click', () => loadBuffer(makeSample(), 'Sample phrase (Bayati on D)'));

  // ── Maqam: feed the audio to MaqamListen (listen.js) ────────────
  let handed = null;                       // the blob/buffer MaqamListen already has
  function resetMaqam() {
    handed = null;
    const a = $('lsAudio'); if (a) a.pause();
    $('lsSrc').hidden = true; $('lsResult').hidden = true; $('lsStatus').textContent = '';
  }
  async function identify(scroll) {
    if (!window.MaqamListen) return;
    const cur = blob || buffer; if (!cur) return;
    if (handed === cur) MaqamListen.analyse();
    else {
      handed = cur;
      await MaqamListen.loadBlob(blob || toWav(buffer), label, true);
      // the passage picker only matters for audio longer than one analysis window
      const d = buffer ? buffer.duration : 0;
      if (d && d <= 45) $('lsSrc').hidden = true;
    }
    if (scroll) $('lsMaqam').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('nfMaqam').addEventListener('click', async () => {
    if (mode === 'live') { stopAll(); await pendingRec; }
    identify(true);
  });

  // ── Playback ───────────────────────────────────────────────────────
  function playFrom(a, b) {
    stopPlayback(); if (!buffer) return;
    playCtx = playCtx || new (window.AudioContext || window.webkitAudioContext)(); playCtx.resume();
    playSrc = playCtx.createBufferSource(); playSrc.buffer = buffer; playSrc.connect(playCtx.destination);
    playOffset = a || 0; const end = b || buffer.duration; playStart = playCtx.currentTime;
    playSrc.start(0, playOffset, end - playOffset);
    playSrc.onended = () => { if (playSrc) stopPlayback(); };
    $('nfStop').disabled = false; $('nfPlay').textContent = '↺ Restart'; tick();
  }
  function tick() {
    if (!playSrc) return;
    const t = playOffset + playCtx.currentTime - playStart;
    drawTrace(t);
    const box = $('nfTraceBox'), x = view.left + (t - view.t0) * view.pps;
    if (x > box.scrollLeft + box.clientWidth - 40 || x < box.scrollLeft) box.scrollLeft = x - 60;
    const cur = notes.findIndex(n => t >= n.start && t <= n.end);
    document.querySelectorAll('#nfNotes .nf-chip').forEach(c => c.classList.toggle('on', +c.dataset.i === cur));
    showCurrent(cur >= 0 ? notes[cur].midi : null);
    raf = requestAnimationFrame(tick);
  }
  function stopPlayback() {
    cancelAnimationFrame(raf);
    if (playSrc) { const s = playSrc; playSrc = null; try { s.stop(); } catch (e) {} }
    document.querySelectorAll('#nfNotes .nf-chip.on').forEach(c => c.classList.remove('on'));
    $('nfPlay').textContent = '▶ Play';
    if (mode === 'file') drawTrace();
  }
  $('nfPlay').addEventListener('click', () => playFrom(0));

  // ── Live input ─────────────────────────────────────────────────────
  async function startLive(kind) {
    stopAll();
    const md = navigator.mediaDevices;
    if (!md || (kind !== 'mic' && !md.getDisplayMedia)) {
      status(kind === 'tab' ? 'This browser can’t share tab audio. Use Chrome on a computer, or load the file.' : 'Microphone isn’t available here.');
      return;
    }
    // Create and start the audio context inside the click, before the permission prompt:
    // Chrome keeps a context made after the prompt suspended, and a suspended context only hears silence.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    const devId = kind === 'mic' ? $('nfMicSel').value : '';
    try {
      liveStream = kind === 'mic'
        ? await md.getUserMedia({ audio: { deviceId: devId ? { exact: devId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        : await md.getDisplayMedia(kind === 'self'
            ? { video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude' }
            : { video: true, audio: true });
    } catch (e) {
      ctx.close();
      status(e && e.name === 'NotAllowedError' ? 'Access was blocked. Allow it in the browser’s address bar and try again.'
                                               : 'Could not start ' + (kind === 'mic' ? 'the microphone' : 'tab capture') + '.');
      return;
    }
    if (!liveStream.getAudioTracks().length) {
      ctx.close(); liveStream.getTracks().forEach(t => t.stop()); liveStream = null;
      status('No audio came through. Pick a tab and switch on “Also share tab audio”.'); return;
    }    if (kind === 'mic') listInputs(liveStream.getAudioTracks()[0]); else $('nfMicPick').hidden = true;
    liveStream.getTracks().forEach(t => t.onended = () => stopAll());
    mode = 'live'; buffer = null; blob = null; frames = []; notes = []; sm = [];
    $('nfPlay').disabled = true; $('nfMaqam').disabled = true;
    liveCtx = ctx;
    try { await liveCtx.resume(); } catch (e) {}
    if (liveCtx.state !== 'running') status('Click anywhere on the page to start listening.');
    const src = liveCtx.createMediaStreamSource(liveStream);
    analyser = liveCtx.createAnalyser(); analyser.fftSize = 2048; src.connect(analyser);
    liveT0 = liveCtx.currentTime; lastSeg = 0; heardAt = 0; silentHint = false; liveKind = kind;
    // keep a recording of what is heard, so "Find the maqam", Play and note taps work afterwards
    recChunks = []; rec = null; recToken++; resetMaqam();
    if (window.MediaRecorder) {
      try {
        rec = new MediaRecorder(new MediaStream(liveStream.getAudioTracks()));
        rec.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
        rec.start(1000);
      } catch (e) { rec = null; }
    }
    $('nfStop').disabled = false; $('nfLevelWrap').hidden = false;
    $('nfLevelSrc').textContent = kind === 'mic' ? 'Microphone' : kind === 'self' ? 'YouTube video' : 'Shared tab';
    srcBtns.forEach((b, k) => b && b.classList.toggle('nf-on', k === kind));
    if (liveCtx.state === 'running') status(kind === 'mic' ? 'Listening on ' + (liveStream.getAudioTracks()[0].label || 'the microphone') + '…'
                                          : kind === 'self' ? 'Listening — press play on the video.' : 'Listening to the shared tab…');
    liveLoop();
  }
  // Microphone picker: device names only appear once permission has been given
  async function listInputs(track) {
    try {
      const sel = $('nfMicSel'), cur = track && track.getSettings ? track.getSettings().deviceId : sel.value;
      const ins = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications');
      sel.textContent = '';
      ins.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId === 'default' ? '' : d.deviceId; o.textContent = d.label || 'Input ' + (i + 1); sel.appendChild(o); });
      if (cur) sel.value = cur === 'default' ? '' : cur;
      $('nfMicPick').hidden = ins.length < 2 || !ins[0].label;
    } catch (e) {}
  }
  $('nfMicSel').addEventListener('change', () => { if (mode === 'live' && liveStream && liveStream.getVideoTracks().length === 0) startLive('mic'); });
  const liveBuf = new Float32Array(2048);
  function liveLoop() {
    if (!analyser) return;
    if (liveCtx.state !== 'running') { raf = requestAnimationFrame(liveLoop); return; }
    if (/^Click anywhere/.test($('nfStatus').textContent)) status('Listening…');
    analyser.getFloatTimeDomainData(liveBuf);
    const { x, sr } = decimate(liveBuf, liveCtx.sampleRate);
    const r = detect(x, sr), t = liveCtx.currentTime - liveT0;
    frames.push({ t, ...r });
    if (frames.length > 20000) frames.splice(0, 5000);
    if (frames.length > 1) hop = (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1);
    // input level: -60 dB … 0 dB
    const db = 20 * Math.log10(Math.max(1e-6, r.rms * Math.SQRT2));
    $('nfLevel').style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
    if (r.rms > 1e-4) heardAt = t;
    if (t - heardAt > 4 && !silentHint) {
      silentHint = true;
      status(liveKind === 'self'
        ? 'Nothing heard yet. Press play on the video. If it is playing, press Stop, then Listen again and choose this tab with “Also share tab audio” on.'
        : liveKind === 'tab'
        ? 'Nothing is coming from the shared tab. Check the video is playing and the tab isn’t muted (right-click the tab → Unmute site), then press Stop and share it again with “Also share tab audio” on.'
        : 'The microphone is sending pure silence. Check the Input picker above, that the mic isn’t muted (keyboard mic key, or Windows Settings → Privacy → Microphone), and that no other app has taken it over.');
    } else if (silentHint && t - heardAt < 0.1) {
      silentHint = false; status('Listening…');
    }
    const good = r.f0 > 0 && r.clarity >= S.clarity && r.rms > 0.002;
    showCurrent(good ? toMidi(r.f0) : null, good ? r.f0 : 0);
    if (t - lastSeg > 0.25) { lastSeg = t; resegment(); redraw(); $('nfMaqam').disabled = !rec || heardAt < 2; }
    raf = requestAnimationFrame(liveLoop);
  }
  // Finish the live recording and turn it into a playable buffer
  function finishRecording() {
    if (!rec) return Promise.resolve();
    const r = rec, token = recToken, lbl = liveKind === 'mic' ? 'Microphone recording' : liveKind === 'self' ? 'YouTube video capture' : 'Shared tab capture';
    rec = null;
    const done = new Promise(res => { r.onstop = res; });
    if (r.state !== 'inactive') r.stop(); else r.onstop();
    pendingRec = done.then(async () => {
      if (token !== recToken || !recChunks.length) return;
      const b = new Blob(recChunks, { type: r.mimeType || 'audio/webm' });
      try {
        const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await b.arrayBuffer());
        if (token !== recToken) return;
        blob = b; buffer = buf; label = lbl; mode = 'file';
        // re-read the whole recording: the live view can drop frames on a busy or hidden page
        const fr = await analyse(buf); if (token !== recToken) return;
        frames = fr; resegment();
        $('nfPlay').disabled = false; $('nfMaqam').disabled = false; redraw();
        status('Stopped. ' + notes.length + ' notes captured. The recording is kept: tap a note to hear it.');
        if (notes.length) identify(false);
      } catch (e) {
        if (token === recToken) { blob = b; label = lbl; $('nfMaqam').disabled = false; }
      }
    });
    return pendingRec;
  }
  function stopAll() {
    stopPlayback(); cancelAnimationFrame(raf);
    const wasLive = mode === 'live';
    finishRecording();
    if (liveStream) { liveStream.getTracks().forEach(t => t.stop()); liveStream = null; }
    if (liveCtx) { liveCtx.close(); liveCtx = null; analyser = null; if (wasLive) status('Stopped. ' + notes.length + ' notes captured.'); }
    $('nfStop').disabled = true; $('nfLevelWrap').hidden = true; $('nfLevel').style.width = '0'; showCurrent(null);
    srcBtns.forEach(b => b && b.classList.remove('nf-on'));
  }
  document.addEventListener('pointerdown', () => { if (liveCtx && liveCtx.state !== 'running') liveCtx.resume(); });
  $('nfMic').addEventListener('click', () => startLive('mic'));
  $('nfTab').addEventListener('click', () => startLive('tab'));

  // ── YouTube video inside the panel (captured as this tab's own audio) ──
  function ytId(s) {
    s = (s || '').trim();
    if (/^[\w-]{11}$/.test(s)) return { id: s, t: 0 };
    let u; try { u = new URL(/^https?:/i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
    if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(u.hostname)) return null;
    let id = u.hostname.toLowerCase().endsWith('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v');
    if (!id) { const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/); if (m) id = m[1]; }
    if (!id || !/^[\w-]{11}/.test(id)) return null;
    const tp = u.searchParams.get('t') || u.searchParams.get('start') || '';
    const hms = tp.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/) || [];
    const t = (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    return { id: id.slice(0, 11), t };
  }
  $('nfYtForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = ytId($('nfYtUrl').value);
    if (!v) { status('That doesn’t look like a YouTube link. Copy it from the address bar or the Share button.'); return; }
    if (location.protocol === 'file:') status('YouTube videos won’t play on a page opened from a file. Use the live site (nsvesq.github.io/pages/projects/maqam-explorer) instead.');
    else status('Video loaded. Press “Listen to this video”, then play it.');
    $('nfYtFrame').src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?playsinline=1&rel=0' + (v.t ? '&start=' + v.t : '');
    $('nfYt').hidden = false;
  });
  $('nfYtListen').addEventListener('click', () => startLive('self'));
  $('nfYtClose').addEventListener('click', () => {
    if (mode === 'live' && liveKind === 'self') stopAll();
    $('nfYtFrame').removeAttribute('src'); $('nfYt').hidden = true; $('nfYtUrl').value = '';
  });
  $('nfStop').addEventListener('click', stopAll);
  $('nfClear').addEventListener('click', () => {
    stopAll(); recToken++; recChunks = []; resetMaqam();
    frames = []; notes = []; sm = []; buffer = null; blob = null; label = ''; mode = null;
    $('nfPlay').disabled = true; $('nfMaqam').disabled = true; $('nfTraceBox').scrollLeft = 0;
    status(''); redraw();
  });

  // ── Misc ───────────────────────────────────────────────────────────
  $('nfCopy').addEventListener('click', async () => {
    const txt = notes.map(n => n.name + n.oct).join(' ');
    try { await navigator.clipboard.writeText(txt); status('Copied ' + notes.length + ' notes.'); } catch (e) { status(txt); }
  });
  ['nfRef', 'nfMinMs', 'nfClar'].forEach(id => $(id).addEventListener('change', () => {
    S.ref = +$('nfRef').value || 440; S.minMs = +$('nfMinMs').value || 90; S.clarity = +$('nfClar').value || 0.8;
    if (frames.length) { resegment(); redraw(); }
  }));
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (mode !== 'live') { drawTrace(); drawHist(); } }, 150); });
  // re-spell notes when the Accidentals dropdown or tab changes
  const prevRender = window.onMaqamRender;
  window.onMaqamRender = function () { if (prevRender) prevRender.apply(this, arguments); if (frames.length) { resegment(); redraw(); } };

  window.MaqamNoteFinder = { loadBuffer, get notes() { return notes; } };
  showCurrent(null); renderNotes();
})();

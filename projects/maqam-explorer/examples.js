// Maqam Explorer — Listen to examples
// Curated YouTube recordings per maqam (checked embeddable, Nov 2026), played through the
// official YouTube IFrame player with compact practice controls (speed, skip, seek).
(function () {
  'use strict';

  // Oud-only taqasim (solo improvisation, no talking). All checked embeddable, Nov 2026.
  const EXAMPLES = {
    "Rast": [
      {id:"m4cLPohrUVY", title:"Taqasim Oud – Maqam Rast", by:"Michael Ibrahim", sec:303},
      {id:"MCCda6BCpP8", title:"Taqsim Rast (The Art of the Ud)", by:"Munir Bashir", sec:392}
    ],
    "Suznak": [
      {id:"SrZJJFm3wVo", title:"Old Oud Taqasim – Rast Suznak", by:"Joseph Tawadros", sec:237},
      {id:"PlBGx3zx-E8", title:"Egyptian Oud – Taqasim Suznak", by:"Arab Instruments", sec:115}
    ],
    "Mahur": [
      {id:"H2QOzirxK14", title:"Mahur Ud Taksimi", by:"Mithat Çömlekçi", sec:102, note:"Turkish makam"},
      {id:"hv3GQUVnQMw", title:"Taqsim Oud – Maqam Mahur", by:"Yosef Yaqub", sec:62}
    ],
    "Yakah": [
      {id:"42BvdUsvGFk", title:"Taqasim Oud – Maqam Yekah", by:"Michael Ibrahim", sec:223},
      {id:"q3JRw7Ev-nY", title:"Taqsim Oud – Maqam Yakah", by:"Mouats Hafid", sec:142}
    ],
    "Bayati": [
      {id:"1DrzYlc8DAM", title:"Oud Taksim Bayātī", by:"Hesham Hamra", sec:322},
      {id:"8nZAL-d27H0", title:"Taqasim Oud Bayati", by:"Nadeem Al Salem", sec:270}
    ],
    "Husseini": [
      {id:"dUGuTGDfXjo", title:"Taqasim Oud – Bayati Husayni", by:"Michael Ibrahim", sec:331},
      {id:"HU0Uvy9g8Kk", title:"Hüseyni Ud Taksim", by:"Yurdal Tokcan", sec:261, note:"Turkish makam"}
    ],
    "Saba": [
      {id:"ERtSDNI4fe4", title:"Oud Solo Taksim – Saba on D", by:"Hesham Hamra", sec:309},
      {id:"ze4iflAnFDE", title:"Saba Oud Taqasim", by:"OudProf", sec:332}
    ],
    "Saba Zamzam": [
      {id:"Zhi2L62sZdo", title:"Taqasim Oud – Saba Zamzam", by:"Al-Haneen Studio", sec:59}
    ],
    "Hijaz": [
      {id:"OCmheJ929fo", title:"Oud Taqasim Hijaz (1987)", by:"Simon Shaheen", sec:592},
      {id:"DZ9lwxl37-I", title:"Taqasim Oud – Maqam Hijaz", by:"Michael Ibrahim", sec:254}
    ],
    "Hijaz Kar": [
      {id:"EL2lTG2uWao", title:"Taqasim Oud – Hijaz Kar", by:"Mohammed Abdel Wahab", sec:117},
      {id:"NXGrUPBzJEE", title:"Oud improvisation: Hijaz Kar", by:"OudProf", sec:99}
    ],
    "Hijaz Kar Kurd": [
      {id:"IFJIHEqQrXU", title:"Taqsim Hijaz Kar Kurd (The Art of the Ud)", by:"Munir Bashir", sec:224},
      {id:"P8hUOuemidM", title:"Kürdilihicazkar Ud Taksimi", by:"Bülent Okan", sec:116, note:"Turkish makam"}
    ],
    "Zanjaran": [
      {id:"_D9ExJ2uf1o", title:"Oud improvisations: Maqam Zanjaran", by:"OudProf", sec:180},
      {id:"ckxPGZ1maks", title:"Taqasim Oud – Zanjaran", by:"Ali Harb", sec:250}
    ],
    "Nahawand": [
      {id:"-tnzQLPy3h0", title:"Nahawand Oud Taqsim", by:"Michael Ibrahim", sec:328},
      {id:"LAsb0u9kg4I", title:"Taqsim Nahawand", by:"Ahmad Al Khatib", sec:377}
    ],
    "Farahfaza": [
      {id:"Bjw36px7B3s", title:"Oud: Farahfaza Taqasim", by:"OudProf", sec:194},
      {id:"yUEFLyPzS2I", title:"Ferahfeza Ud Taksimi", by:"İbrahim Kararoğlu", sec:287, note:"Turkish makam"}
    ],
    "Ajam": [
      {id:"9ISXMG8ZxUA", title:"Oud Taqasim Ajam", by:"Simon Shaheen", sec:799},
      {id:"Xsoxjsf26Y8", title:"Taqsim Maqam Ajam", by:"Rahim Alhaj", sec:532}
    ],
    "Ajam Ushayran": [
      {id:"iksnt-y9Vsc", title:"Taqsim in Ajam Ushayran (Egyptian oud)", by:"Yochai Oved", sec:123},
      {id:"pMVKRcrjtyA", title:"Acemaşiran Ud Taksimi", by:"Enver Mete Aslan", sec:92, note:"Turkish makam"}
    ],
    "Jiharkah": [
      {id:"4o7bWQxXWKE", title:"Oud Taqasim – Ajam on Jiharkah (F)", by:"OudProf", sec:123},
      {id:"c3eUT8uhVR0", title:"Oud Taqsim – Maqam Jiharkah", by:"Moshe Habusha", sec:147}
    ],
    "Shawq Afza": [
      {id:"zS_Q5t83kfw", title:"Oud Taqasim: Shawq Afza", by:"OudProf", sec:68},
      {id:"qH7v4aHWCLc", title:"Şevkefza Ud Taksimi", by:"Sedat Oytun", sec:191, note:"Turkish makam"}
    ],
    "Kurd": [
      {id:"_fAuTIrqcsM", title:"Oud Taqasim Kurd (1996)", by:"Simon Shaheen", sec:677},
      {id:"XAPmHRTL8SY", title:"Taqsim Kurdi (The Art of the Ud)", by:"Munir Bashir", sec:266}
    ],
    "Sikah": [
      {id:"S4OFn0wnAio", title:"Oud Taqasim Sikah (2014)", by:"Simon Shaheen", sec:585},
      {id:"8rEQZDgUpjw", title:"Taqasim Oud Sikah", by:"Riyad Al Sunbati", sec:350}
    ],
    "Iraq": [
      {id:"gN_JeTr6z7w", title:"Irak Ud Taksimi", by:"Osman Nuri Özpekel", sec:98, note:"Turkish makam"},
      {id:"kR_27wyU1kI", title:"Irak Taksim", by:"Baha Yetkin", sec:310, note:"Turkish makam"}
    ],
    "Bastanikar": [
      {id:"TX0zvEaTAIs", title:"Oud Solo – Maqam Bastanikar", by:"Bian Shama", sec:70},
      {id:"ZxD0C-20axE", title:"Bestenigâr Ud Taksimi", by:"Alper Soybilgen", sec:120, note:"Turkish makam"}
    ],
    "Nawa Athar": [
      {id:"s4D34wTb5hU", title:"Oud Taqasim Nawa Athar", by:"Simon Shaheen", sec:650},
      {id:"3Uw7HB3rtTQ", title:"Taqasim Oud – Nawa Athar", by:"OudProf", sec:86}
    ],
    "Nikriz": [
      {id:"ZH6ov-Un-TU", title:"Taqasim Maqam Nikriz", by:"Nikos Dimitriadis", sec:483},
      {id:"4qeDglqNe1I", title:"Oud Taqasim: Nikriz (on a 116-year-old oud)", by:"OudProf", sec:69}
    ],
    "Athar Kurd": [
      {id:"bIPsfQiOc7U", title:"Taqsim Oud – Maqam Athar Kurd", by:"Victor Esses", sec:103}
    ],
    "Lami": [
      {id:"hKWRGXlEMXg", title:"Maqam Lami – live in Paris", by:"Saad Mahmood Jawad", sec:303},
      {id:"PlzVVRjmVtg", title:"Oud solo – Maqam Lami", by:"Bian Shama", sec:169}
    ],
    "Mustaar": [
      {id:"SO3qJ3Q7e-E", title:"Taqasim Oud – Maqam Musta'ar", by:"Victor Esses", sec:244}
    ],
    // No solo-oud recording found for these — other instruments instead (tag says which).
    "Nahawand Murassah": [
      {id:"Cxwfto-Ef0g", title:"Samai Nahawand Murassa", by:"Wassim Odeh", sec:323, tag:"Samai (instrumental)"},
      {id:"tnVzZnnxg2w", title:"Improvisation – Nahawand Murassa", by:"Alaa Alkhatib", sec:79, tag:"Improvisation"}
    ],
    "Suzdalara": [
      {id:"Ef2Sdop3ofA", title:"Sûzidilârâ Taksim", by:"Necdet Yaşar", sec:167, tag:"Tanbur taksim", note:"Turkish makam"},
      {id:"lCWh5Otf3IU", title:"Suzidilara Ney Taksimi", by:"anchizet", sec:299, tag:"Ney taksim", note:"Turkish makam"},
      {id:"hr5d8DPbDQE", title:"Suzidilara Taksim", by:"Tanburi Cemil Bey", sec:215, tag:"Tanbur taksim", note:"Turkish makam"}
    ],
    "Tarz Naw": [
      {id:"wNVPi7rZOCI", title:"Tarz-ı Nevîn Tanbur Taksimi", by:"Kağan Ulaş", sec:250, tag:"Tanbur taksim", note:"Turkish makam"},
      {id:"64I1rhmzZBg", title:"Tarz-ı Nevin Saz Semaisi", by:"Esra Berkman", sec:187, tag:"Qanun", note:"Turkish makam"},
      {id:"JGgzSTY3uEg", title:"Tarz-ı Nevîn (ney)", by:"Işıltan Turan", sec:67, tag:"Ney", note:"Turkish makam"}
    ],
    "Shadd Araban": [
      {id:"nkU3OpjGnWM", title:"Oud Taqasim Shadd Araban", by:"OudProf", sec:271},
      {id:"szKg9nVIOkg", title:"Samai Shadd Araban (oud)", by:"Adel Salameh", sec:489}
    ],
    "Bayati Shuri": [
      {id:"YI1ry9jYTwA", title:"Karcığar Ud Taksim", by:"Gürsel Torun", sec:369, note:"Turkish Karcığar"},
      {id:"5-XlI8-eIgw", title:"Karcığar Ud Taksimi", by:"Mithat Çömlekçi", sec:83, note:"Turkish Karcığar"}
    ],
    "Huzam": [
      {id:"wehx6GakLYg", title:"Taqasim Oud – Maqam Huzam", by:"Ahmad Mhamid", sec:199},
      {id:"C8tpoEV7a2I", title:"Hüzzam Ud Taksimi", by:"Nuri Karademirli", sec:214, note:"Turkish makam"}
    ],
    "Awj Ara": [
      {id:"OljwNNVbdZI", title:"Taqsim, Maqam Awj Ara", by:"Saïd Chraïbi", sec:354},
      {id:"hVl0fz6s43c", title:"Evcara Ud Taksim", by:"İsmail Ekercin", sec:151, note:"Turkish makam"}
    ]
  };

  const $ = id => document.getElementById(id);
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  let player = null, apiReady = null, current = null, tick = null, pendingId = null, curMaqam = null;

  function loadApi() {
    if (apiReady) return apiReady;
    apiReady = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { $('exStatus').textContent = 'Could not reach YouTube. Check your connection.'; };
      document.head.appendChild(s);
    });
    return apiReady;
  }

  async function play(ex) {
    current = ex;
    $('exPlayerWrap').hidden = false;
    $('exNowTitle').textContent = ex.title;
    $('exNowBy').textContent = curMaqam + ' · ' + ex.by + (ex.note ? ' · ' + ex.note : '');
    $('exYtLink').href = 'https://www.youtube.com/watch?v=' + ex.id;
    $('exDur').textContent = fmt(ex.sec);
    $('exCur').textContent = '0:00';
    $('exSeek').value = 0;
    $('exStatus').textContent = 'Loading…';
    markActive();
    if (typeof isPlaying !== 'undefined' && isPlaying) toggleDrone(); // drone would clash with the recording
    await loadApi();
    if (!player) {
      pendingId = ex.id;
      player = new YT.Player('exPlayer', {
        host: 'https://www.youtube-nocookie.com',
        videoId: ex.id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: e => { e.target.setPlaybackRate(parseFloat($('exRate').value)); e.target.playVideo(); },
          onStateChange: onState,
          onError: e => { $('exStatus').textContent = 'This video can\'t be played here (error ' + e.data + '). Try “Open on YouTube”.'; },
        },
      });
    } else {
      player.loadVideoById(ex.id);
      player.setPlaybackRate(parseFloat($('exRate').value));
    }
  }

  function onState(e) {
    const st = e.data, P = YT.PlayerState;
    $('exPlay').textContent = st === P.PLAYING ? '❚❚ Pause' : '▶ Play';
    $('exStatus').textContent = st === P.BUFFERING ? 'Buffering…' : st === P.ENDED ? 'Finished.' : '';
    clearInterval(tick);
    if (st === P.PLAYING) tick = setInterval(update, 250);
    update();
  }
  function update() {
    if (!player || !player.getCurrentTime) return;
    const t = player.getCurrentTime() || 0, d = player.getDuration() || (current && current.sec) || 0;
    $('exCur').textContent = fmt(t);
    $('exDur').textContent = fmt(d);
    if (!seeking) $('exSeek').value = d ? Math.round(t / d * 1000) : 0;
  }

  function markActive() {
    document.querySelectorAll('.ex-item').forEach(el => el.classList.toggle('on', !!current && el.dataset.id === current.id));
  }

  function renderList(maqamName) {
    curMaqam = maqamName;
    const list = $('exList'), items = EXAMPLES[maqamName] || [];
    const search = '<a target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=' +
      encodeURIComponent(maqamName + ' oud taqsim') + '">Search YouTube for more ↗</a>';
    $('exFor').textContent = maqamName;
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="ex-empty">No recording of ' + esc(maqamName) + ' found yet. ' + search + '</div>';
      return;
    }
    items.forEach(ex => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ex-item'; b.dataset.id = ex.id;
      b.innerHTML =
        '<span class="ex-thumb"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + ex.id + '/mqdefault.jpg"><i>▶</i></span>' +
        '<span class="ex-info"><b>' + esc(ex.title) + '</b><small>' + esc(ex.by) + ' · ' + fmt(ex.sec) + '</small>' +
        '<span class="ex-tags"><em class="' + (ex.tag ? 'alt' : '') + '">' + esc(ex.tag || 'Oud taqsim') + '</em>' +
        (ex.note ? '<em class="note">' + esc(ex.note) + '</em>' : '') + '</span></span>';
      b.addEventListener('click', () => play(ex));
      list.appendChild(b);
    });
    markActive();
  }

  // Controls
  let seeking = false;
  $('exPlay').addEventListener('click', () => {
    if (!player || !player.getPlayerState) return;
    player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
  });
  $('exBack').addEventListener('click', () => { if (player && player.seekTo) player.seekTo(Math.max(0, player.getCurrentTime() - 10), true); });
  $('exFwd').addEventListener('click', () => { if (player && player.seekTo) player.seekTo(player.getCurrentTime() + 10, true); });
  $('exRate').addEventListener('change', e => { if (player && player.setPlaybackRate) player.setPlaybackRate(parseFloat(e.target.value)); });
  const seek = $('exSeek');
  seek.addEventListener('input', () => {
    seeking = true;
    const d = (player && player.getDuration && player.getDuration()) || (current && current.sec) || 0;
    $('exCur').textContent = fmt(seek.value / 1000 * d);
  });
  seek.addEventListener('change', () => {
    const d = (player && player.getDuration && player.getDuration()) || 0;
    if (player && player.seekTo && d) player.seekTo(seek.value / 1000 * d, true);
    seeking = false;
  });

  // Called by render() in index.html whenever the maqam changes
  window.onMaqamRender = function (maqamName) { if (maqamName !== curMaqam) renderList(maqamName); };
  if (typeof ddMaqam !== 'undefined' && ddMaqam.get()) renderList(ddMaqam.get());

  window.MaqamExamples = { EXAMPLES, play, get player() { return player; } };
})();

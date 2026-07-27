// ── Hamburger menu ───────────────────────────────────
const menuBtn   = document.getElementById('menuBtn');
const menuClose = document.getElementById('menuClose');
const sideMenu  = document.getElementById('sideMenu');
const overlay   = document.getElementById('overlay');

function openMenu()  { sideMenu.classList.add('open'); overlay.classList.add('open'); }
function closeMenu() { sideMenu.classList.remove('open'); overlay.classList.remove('open'); }

menuBtn.addEventListener('click', openMenu);
menuClose.addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);

// ── Scroll-triggered animations ──────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.animate-in').forEach(el => {
        el.style.animationPlayState = 'running';
      });
    }
  });
}, { threshold: 0.2 });

document.querySelectorAll('.snap-section').forEach(section => {
  section.querySelectorAll('.animate-in').forEach(el => {
    el.style.animationPlayState = 'paused';
  });
  observer.observe(section);
});


/* ══ PHOTO BOOTH (breathing.html only) ═══════════════
   Wrapped in a function so its variables stay private and can't
   collide with anything above. The guard on the first line means
   this file is safe to load on every page — on the home page,
   timer or task manager there is no #stage element, so the whole
   booth simply switches itself off.                              */
function initPhotoBooth() {
  if (!document.getElementById('stage')) return;   // not the booth page
  /* ── elements ───────────────────────────────────────── */
  const video     = document.getElementById('video');
  const stage     = document.getElementById('stage');
  const stageMsgText = document.getElementById('stageMsgText');
  const countdown = document.getElementById('countdown');
  const flash     = document.getElementById('flash');
  const shotPip   = document.getElementById('shotPip');
  const startBtn  = document.getElementById('startBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn  = document.getElementById('clearBtn');
  const toastEl   = document.getElementById('toast');
  const slots     = [...document.querySelectorAll('.slot')];
  const stripEl   = document.getElementById('strip');

  /* ── STATE ───────────────────────────────────────────
     Everything the page needs to know, in four variables. Any time one
     of these changes we call render() to redraw the strip from it. This
     is the "single source of truth" idea — the screen is always a
     picture of these variables, so the two can never drift apart.

     shots  : the 4 slots. null = empty. Photos are stored UNFILTERED as
              base64 data URLs, and the filter is applied when drawing.
              That's why switching filters instantly restyles photos you
              already took — the originals were never modified.
     stream : the live MediaStream from the webcam, or null if the camera
              hasn't been opened. Also used as the "is the camera on?"
              flag that decides what the main button does.
     busy   : true while a countdown sequence is running. Every button
              checks this so you can't start a second capture mid-shot.
     filter : which filter is currently selected.
     OUT    : every captured photo is normalised to 720x720, so webcam
              shots and uploaded photos are always the same size.        */
  const OUT = 720;                 // captured square size in px
  let shots  = [null, null, null, null];   // raw (unfiltered) data URLs
  let stream = null;
  let busy   = false;
  let filter = 'none';

  /* Filters are plain CSS filter strings. Storing them in one object
     means the same value can be reused in three places: the live video
     preview, the <img> tags in the strip, and the download canvas
     (canvas has a ctx.filter property that accepts identical syntax).
     Add a new look by adding one line here plus one chip button.        */
  const FILTERS = {
    none:  'none',
    bw:    'grayscale(1) contrast(1.08)',
    warm:  'saturate(1.25) sepia(.28) contrast(1.03)',
    cool:  'saturate(1.1) hue-rotate(180deg) brightness(1.04)',
    pop:   'saturate(1.7) contrast(1.22)',
    dream: 'saturate(1.15) brightness(1.12) contrast(.92) blur(.4px)'
  };

  /* toast(): the little black pill that slides up at the bottom.
     clearTimeout on each call cancels the previous hide-timer, so rapid
     messages don't fight each other — the newest one always gets its
     full display time.                                                  */
  const toast = (msg, ms = 2600) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
  };

  /* sleep(): wraps setTimeout in a Promise so we can write
     'await sleep(1000)' inside an async function. This is what lets the
     countdown read like a straight list of steps instead of a nest of
     callbacks — see countTo() below.                                    */
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ── OPENING THE CAMERA ──────────────────────────────
     getUserMedia() asks the browser for camera access and returns a
     Promise. It's async because the user has to click Allow first — the
     await pauses here until they respond.

     Two things commonly make this fail, so both are handled explicitly:
       NotAllowedError — the user (or a previous 'Block') denied it
       NotFoundError   — no camera hardware
     There's also the file:// case: browsers only expose cameras on
     "secure contexts" (https or localhost), so double-clicking the HTML
     file will always fail. The check on location.protocol catches that
     and explains it rather than showing a confusing generic error.

     Whatever happens we return true/false so the caller knows whether
     it's safe to continue into a capture sequence.                      */
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      stageMsgText.innerHTML = 'This browser can\'t reach the camera.<br>Try uploading photos instead.';
      toast('Camera unavailable — use Upload photos.', 5000);
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      stage.classList.remove('idle');
      stage.classList.add('live');
      setButtons();
      toast('Camera ready — press Take 4 photos.');
      return true;
    } catch (err) {
      let msg = 'Could not open the camera.';
      if (err.name === 'NotAllowedError')      msg = 'Camera permission was blocked. Allow it in your browser settings.';
      else if (err.name === 'NotFoundError')   msg = 'No camera found on this device.';
      else if (location.protocol === 'file:')  msg = 'Cameras need a local server, not a file:// page.';
      stageMsgText.innerHTML = msg + '<br>You can still upload photos.';
      toast(msg, 5000);
      return false;
    }
  }

  /* ── CAPTURING ONE SQUARE FRAME ──────────────────────
     This is the heart of the booth. A <video> element can be handed
     straight to canvas drawImage(), which grabs whatever frame is on
     screen at that instant.

     The 9-argument form of drawImage is what does the cropping:
       drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
                         └── region to take FROM ──┘ └── where to put IT ┘

     A webcam gives 1280x720 (landscape), so we take the biggest centred
     square — 720x720 starting 280px from the left — and paint it into a
     720x720 canvas. Nothing is squashed, the sides are simply trimmed.

     The translate + scale(-1, 1) pair mirrors the drawing horizontally.
     It's needed because the CSS mirrors the preview; without it your
     photo would come out the opposite way round from what you posed
     for, and any text in shot would read backwards.

     toDataURL() then serialises the canvas into a base64 PNG string we
     can drop straight into an <img src>.                                */
  function grabSquare() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const size = Math.min(vw, vh);              // biggest centred square
    const sx = (vw - size) / 2, sy = (vh - size) / 2;

    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    const ctx = c.getContext('2d');
    ctx.translate(OUT, 0);
    ctx.scale(-1, 1);                            // match the mirrored preview
    ctx.drawImage(video, sx, sy, size, size, 0, 0, OUT, OUT);
    return c.toDataURL('image/png');
  }

  /* countTo(): shows 3, 2, 1 with a one-second gap.
     Rewriting innerHTML each tick replaces the <span>, and because a
     brand-new element is created the CSS 'pop' animation restarts from
     the beginning every number. Reusing the same span would only animate
     once.                                                               */
  async function countTo(n) {
    countdown.classList.add('show');
    for (let i = n; i > 0; i--) {
      countdown.innerHTML = '<span>' + i + '</span>';
      await sleep(1000);
    }
    countdown.classList.remove('show');
    countdown.innerHTML = '';
  }

  /* captureInto(): the full ritual for ONE photo —
     label it, count down, flash, grab the frame, breathe.
     Written as a separate function because two different flows need it:
     the automatic 4-shot run, and a single retake. Note the capture
     happens on the same line the flash starts, so the photo is taken at
     the peak of the white flash, exactly like a real camera.            */
  async function captureInto(index) {
    shotPip.textContent = 'Shot ' + (index + 1) + ' of 4';
    shotPip.classList.add('show');
    await countTo(3);

    /* Light FIRST, then shoot. The screen going white acts as a fill
       light on your face, but the browser needs a moment to actually
       paint it and the webcam needs a moment to adjust its exposure to
       the extra brightness. Capturing on the same line as the flash
       would grab the frame before any of that happened — you'd get the
       animation but none of the lighting benefit.

       260ms lands inside the 315ms the flash holds at full white.     */
    flash.classList.add('fire');
    await sleep(260);
    const data = grabSquare();

    setTimeout(function () { flash.classList.remove('fire'); }, 800);
    if (data) { shots[index] = data; render(); }
    await sleep(700);
  }

  /* runSequence(): the automatic 4-shot run.
     Because captureInto() is awaited, this loop pauses ~3.7 seconds each
     time round — a plain for-loop without await would fire all four
     captures in the same millisecond and give four identical photos.
     'busy' is raised before the loop and lowered after, which is what
     locks the buttons for the whole ~15-second run.                     */
  async function runSequence() {
    busy = true; setButtons();
    for (let i = 0; i < 4; i++) await captureInto(i);
    shotPip.classList.remove('show');
    busy = false; setButtons();
    toast('Strip complete! Download it or retake any shot.');
  }

  async function retake(i) {
    if (busy) return;
    if (!stream) { const ok = await startCamera(); if (!ok) return; }
    busy = true; setButtons();
    await captureInto(i);
    shotPip.classList.remove('show');
    busy = false; setButtons();
  }

  /* The main button does two different jobs depending on state, which is
     why it's one button and not two. First press = open the camera (and
     stop there, so you can check your framing). Second press = run the
     sequence. setButtons() relabels it to match.                        */
  startBtn.addEventListener('click', async function () {
    if (busy) return;
    if (!stream) { await startCamera(); return; }   // first press opens the camera
    runSequence();                                   // second press starts the 4 shots
  });

  /* ── UPLOADS ─────────────────────────────────────────
     The real <input type="file"> is hidden because browsers barely let
     you style it. Clicking our pretty button programmatically clicks the
     hidden input instead — a standard trick.                            */
  uploadBtn.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', async function (e) {
    const files = [].slice.call(e.target.files).filter(f => f.type.indexOf('image/') === 0);
    if (!files.length) return;
    let placed = 0;
    for (const f of files) {
      const idx = shots.indexOf(null);
      if (idx === -1) { toast('Strip is full — clear it or retake a shot.'); break; }
      try { shots[idx] = await fileToSquare(f); placed++; render(); }
      catch (err) { toast('One image could not be read.'); }
    }
    if (placed) toast('Added ' + placed + ' photo' + (placed > 1 ? 's' : '') + '.');
    /* Resetting .value matters: without it, picking the SAME file twice
       in a row fires no 'change' event, because the value didn't change. */
    fileInput.value = '';
  });

  /* fileToSquare(): put an uploaded photo through the identical
     centre-crop as a webcam shot, so mixed sources look consistent in
     the strip. Image loading is asynchronous, hence the Promise wrapper
     — the pixels don't exist until img.onload fires.
     createObjectURL makes a temporary local reference to the file;
     revokeObjectURL releases it afterwards so memory isn't leaked. The
     file never leaves the computer.                                     */
  function fileToSquare(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const size = Math.min(img.width, img.height);      // centre-crop to square
        const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
        const c = document.createElement('canvas');
        c.width = c.height = OUT;
        c.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  /* ── filters ────────────────────────────────────────── */
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      filter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach(function (c) {
        c.setAttribute('aria-pressed', c === chip);
      });
      video.style.filter = FILTERS[filter];
      render();
    });
  });

  /* ── RENDERING THE STRIP ─────────────────────────────
     One function redraws all four slots from the 'shots' array. Nothing
     else in the code touches the strip's HTML directly — take a photo,
     upload one, change filter, clear, retake, they all just update the
     data and call render(). That keeps the display honest and means new
     features only need to change the array.

     The filter is injected as an inline style here rather than baked
     into the stored image, which is why filters are non-destructive.    */
  function render() {
    slots.forEach(function (slot, i) {
      const data = shots[i];
      if (!data) {
        slot.innerHTML = '<span class="slot-num">' + (i + 1) + '</span>';
        return;
      }
      slot.innerHTML =
        '<img src="' + data + '" alt="Photo ' + (i + 1) + '" style="filter:' + FILTERS[filter] + '">' +
        '<button class="retake" data-i="' + i + '">Retake</button>';
    });
    setButtons();
  }

  /* ══ STICKERS ════════════════════════════════════════
     Add your own art by dropping transparent PNGs into the stickers/
     folder and listing the filenames here. JavaScript can't read a
     folder's contents, so this list is how it knows what exists — if a
     file is missing its swatch quietly removes itself from the tray.

     Positions are stored as FRACTIONS of the strip (0 to 1), never
     pixels. That's the whole trick: the strip is ~300px wide on screen
     but 668px on the download canvas, and fractions map onto both
     without any conversion maths.                                     */
  const STICKER_DIR   = 'stickers/';
  const STICKER_FILES = ['heart.png', 'star.png', 'sparkle.png', 'bubble.png'];
  const STICKER_W     = 0.22;          // sticker width as a fraction of the strip
  let placed = [];                     // [{ src, x, y }] — x/y are 0-1

  const tray             = document.getElementById('stickerTray');
  const clearStickersBtn = document.getElementById('clearStickersBtn');

  STICKER_FILES.forEach(function (file) {
    const b  = document.createElement('button');
    const im = document.createElement('img');
    b.type = 'button';
    b.title = 'Add ' + file.replace('.png', '');
    im.src = STICKER_DIR + file;
    im.alt = file.replace('.png', '');
    im.onerror = function () { b.remove(); };   // file not there — hide the swatch
    b.appendChild(im);
    b.addEventListener('click', function () { addSticker(STICKER_DIR + file); });
    tray.appendChild(b);
  });

  /* Drop a new sticker near the middle, jittered slightly so tapping
     the same one twice doesn't hide one perfectly behind the other.   */
  function addSticker(src) {
    placed.push({
      src: src,
      x: 0.5 + (Math.random() - 0.5) * 0.25,
      y: 0.5 + (Math.random() - 0.5) * 0.5
    });
    renderStickers();
    toast('Sticker added — drag it where you want.');
  }

  /* Stickers are direct children of .strip, while photos live inside
     .slot elements. render() only rewrites the slots, so stickers are
     never disturbed by taking or filtering photos.                    */
  function renderStickers() {
    [].slice.call(stripEl.querySelectorAll('.placed')).forEach(function (n) { n.remove(); });
    placed.forEach(function (s, i) {
      const img = document.createElement('img');
      img.className = 'placed';
      img.src = s.src;
      img.alt = '';
      img.dataset.i = i;
      img.style.left = (s.x * 100) + '%';
      img.style.top  = (s.y * 100) + '%';
      stripEl.appendChild(img);
    });
    /* the Remove button only exists while there's something to remove */
    clearStickersBtn.hidden = placed.length === 0;
  }

  clearStickersBtn.addEventListener('click', function () {
    if (!placed.length) return;
    const n = placed.length;
    placed = [];
    renderStickers();
    toast('Removed ' + n + ' sticker' + (n > 1 ? 's' : '') + '.');
  });

  /* DRAGGING — pointer events cover mouse, touch and stylus in one API.
     setPointerCapture routes every move to this element even if the
     cursor outruns it, which is what stops the sticker being dropped
     the moment you move quickly.

     getBoundingClientRect() gives the strip's live position and size on
     screen; subtracting it converts a page coordinate into a fraction
     of the strip. Clamping to 0-1 keeps stickers from being lost off
     the edge.                                                          */
  let drag = null;

  stripEl.addEventListener('pointerdown', function (e) {
    const el = e.target.closest('.placed');
    if (!el) return;
    e.preventDefault();
    drag = { el: el, i: +el.dataset.i };
    el.setPointerCapture(e.pointerId);
    el.classList.add('grabbing');
  });

  stripEl.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const r = stripEl.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top)  / r.height));
    placed[drag.i].x = x;
    placed[drag.i].y = y;
    drag.el.style.left = (x * 100) + '%';
    drag.el.style.top  = (y * 100) + '%';
  });

  function endDrag() {
    if (!drag) return;
    drag.el.classList.remove('grabbing');
    drag = null;
  }
  stripEl.addEventListener('pointerup', endDrag);
  stripEl.addEventListener('pointercancel', endDrag);

  /* EVENT DELEGATION
     The Retake buttons are destroyed and recreated on every render, so
     listeners attached directly to them would die instantly. Instead one
     listener sits on the parent strip, which never changes, and
     .closest() works out whether the click landed on a Retake button.
     One listener, works forever, no rebinding.                          */
  stripEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.retake');
    if (btn) retake(+btn.dataset.i);
  });

  /* setButtons(): the only place button enabled/disabled state and the
     main button's label are decided. Called after anything that changes
     state, so the controls can never contradict what's actually going
     on — e.g. you can't hit Download mid-countdown.                     */
  function setButtons() {
    const any = shots.some(Boolean);
    downloadBtn.disabled = !any || busy;
    clearBtn.disabled    = !any || busy;
    startBtn.disabled    = busy;
    uploadBtn.disabled   = busy;
    startBtn.textContent = busy ? 'Smile…' : (stream ? 'Take 4 photos' : 'Start camera');
  }

  clearBtn.addEventListener('click', function () {
    if (busy) return;
    shots = [null, null, null, null];
    placed = [];              // stickers go too
    render();
    renderStickers();
    toast('Strip cleared.');
  });

  /* ── DOWNLOAD: FLATTEN THE STRIP INTO ONE PNG ────────
     The on-screen strip is HTML, which can't be saved as an image
     directly. So we rebuild it on a canvas and export that.

     The four constants drive all the geometry, so changing PHOTO or GAP
     rescales the whole layout without any other edits:
       PHOTO 600 — each square photo
       PAD    34 — white border around the strip
       GAP    20 — space between photos
       FOOT   96 — footer band for the logo and date
     That gives 668 x 2590px:
       width  = 600 + 34x2
       height = 34 + (600 x 4) + (20 x 3) + 96

     ctx.filter takes the same string as CSS filter, so the downloaded
     image gets the identical look you see on screen. save()/restore()
     wraps it so the filter doesn't bleed onto the footer text.

     Empty slots are drawn as grey blocks rather than skipped, keeping
     the strip a consistent size even if you only took two photos.

     Export works by pointing a temporary <a download> at the canvas's
     data URL and clicking it in code — no server involved, the file is
     generated entirely in the browser.                                  */
  downloadBtn.addEventListener('click', async function () {
    const PHOTO = 600, PAD = 34, GAP = 20, FOOT = 96;
    const W = PHOTO + PAD * 2;
    const H = PAD + PHOTO * 4 + GAP * 3 + FOOT;

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 4; i++) {
      const y = PAD + i * (PHOTO + GAP);
      if (shots[i]) {
        const img = await loadImage(shots[i]);
        ctx.save();
        ctx.filter = FILTERS[filter];
        ctx.drawImage(img, PAD, y, PHOTO, PHOTO);
        ctx.restore();
      } else {
        ctx.fillStyle = '#F0EDE7';
        ctx.fillRect(PAD, y, PHOTO, PHOTO);
      }
    }

    const footY = PAD + PHOTO * 4 + GAP * 3;
    ctx.fillStyle = '#4A4A4A';
    ctx.textAlign = 'center';
    ctx.font = "600 34px 'Space Grotesk', sans-serif";
    ctx.fillText('HELPFUL', W / 2, footY + 46);
    ctx.font = "400 22px 'Space Grotesk', sans-serif";
    ctx.fillStyle = '#9a968f';
    ctx.fillText(new Date().toLocaleDateString(), W / 2, footY + 76);

    /* Stickers go on last so they sit above the photos and footer,
       exactly as they do on screen. The stored fractions multiply
       straight into canvas pixels — s.x of 0.5 is the middle of the
       strip whether that's 150px on screen or 334px here.
       Height is derived from each PNG's real aspect ratio so
       non-square sticker art isn't squashed.                          */
    for (const s of placed) {
      const img = await loadImage(s.src);
      const w = STICKER_W * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, s.x * W - w / 2, s.y * H - h / 2, w, h);
    }

    const a = document.createElement('a');
    a.download = 'photobooth-' + Date.now() + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
    toast('Strip downloaded.');
  });

  function loadImage(src) {
    return new Promise(function (res, rej) {
      const i = new Image();
      i.onload = function () { res(i); };
      i.onerror = rej;
      i.src = src;
    });
  }

  /* ── TIDY UP ─────────────────────────────────────────
     Stopping every track releases the webcam and turns off the little
     green camera light. Without this the camera can stay claimed after
     you navigate away, which looks alarming and blocks other apps.
     'pagehide' is used rather than 'unload' because it also fires when
     a mobile browser backgrounds the tab.                               */
  window.addEventListener('pagehide', function () {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  });

  /* First paint: draws the four empty numbered slots and sets the
     initial disabled state of the buttons.                              */
  render();
}

initPhotoBooth();

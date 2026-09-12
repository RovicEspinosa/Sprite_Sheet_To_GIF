(function(){

  // ---------- element refs ----------
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const importBtn = document.getElementById('importBtn');
  const autoDetectBtn = document.getElementById('autoDetectBtn');
  const copySheetBtn = document.getElementById('copySheetBtn');
  const resetBtn = document.getElementById('resetBtn');
  const sheetBody = document.getElementById('sheetBody');

  const previewCanvas = document.getElementById('previewCanvas');
  const previewCtx = previewCanvas.getContext('2d');
  const restartBtn = document.getElementById('restartBtn');
  const prevBtn = document.getElementById('prevBtn');
  const playBtn = document.getElementById('playBtn');
  const nextBtn = document.getElementById('nextBtn');
  const loopBtn = document.getElementById('loopBtn');
  const frameCounter = document.getElementById('frameCounter');
  const zoomGroup = document.getElementById('zoomGroup');

  const sheetPanel = document.getElementById('sheetPanel');
  const playbackPanel = document.getElementById('playbackPanel');
  const bgPanel = document.getElementById('bgPanel');

  const frameW = document.getElementById('frameW');
  const frameH = document.getElementById('frameH');
  const offsetX = document.getElementById('offsetX');
  const offsetY = document.getElementById('offsetY');
  const colsInput = document.getElementById('cols');
  const rowsInput = document.getElementById('rowsInput');
  const spacingX = document.getElementById('spacingX');
  const spacingY = document.getElementById('spacingY');
  const orientation = document.getElementById('orientation');
  const ignoreFrames = document.getElementById('ignoreFrames');

  const fpsInput = document.getElementById('fpsInput');
  const delayMs = document.getElementById('delayMs');
  const outputScale = document.getElementById('outputScale');
  const scaleLabel = document.getElementById('scaleLabel');
  const loopGif = document.getElementById('loopGif');
  const autoplay = document.getElementById('autoplay');

  const removeEnabled = document.getElementById('removeEnabled');
  const removeColorPicker = document.getElementById('removeColorPicker');
  const removeColor = document.getElementById('removeColor');
  const matchShades = document.getElementById('matchShades');
  const matchLabel = document.getElementById('matchLabel');
  const fillTransparent = document.getElementById('fillTransparent');
  const fillColorField = document.getElementById('fillColorField');
  const fillColorPicker = document.getElementById('fillColorPicker');
  const fillColor = document.getElementById('fillColor');

  const statFrames = document.getElementById('statFrames');
  const statFps = document.getElementById('statFps');
  const statDuration = document.getElementById('statDuration');
  const statTransparency = document.getElementById('statTransparency');
  const buildGifBtn = document.getElementById('buildGifBtn');
  const exportSheetBtn = document.getElementById('exportSheetBtn');
  const exportFramesBtn = document.getElementById('exportFramesBtn');
  const progressBar = document.getElementById('progressBar');
  const statusEl = document.getElementById('status');
  const statusBar = document.getElementById('statusBar');

  const timelineStrip = document.getElementById('timelineStrip');
  const duplicateFrameBtn = document.getElementById('duplicateFrameBtn');
  const deleteFrameBtn = document.getElementById('deleteFrameBtn');
  const reverseFrameBtn = document.getElementById('reverseFrameBtn');

  const saveProjectBtn = document.getElementById('saveProjectBtn');
  const loadProjectBtn = document.getElementById('loadProjectBtn');
  const projectNameInput = document.getElementById('projectNameInput');
  const loadProjectInput = document.getElementById('loadProjectInput');
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  const shortcutsModal = document.getElementById('shortcutsModal');
  const closeShortcuts = document.getElementById('closeShortcuts');

  const applyChangesBtn = document.getElementById('applyChangesBtn');
  const applyStatus = document.getElementById('applyStatus');
  const performanceNotice = document.getElementById('performanceNotice');
  const dismissPerfNotice = document.getElementById('dismissPerfNotice');

  // ---------- state ----------
  let img = null;
  let sourceFileName = null;
  let sheetCanvas = null, sheetCtx = null;
  let frames = [];           // timeline: [{x,y,w,h}]
  let selected = new Set();  // selected timeline positions
  let currentFrame = 0;
  let playing = false;
  let playTimer = null;
  let previewZoomMode = 100; // 50 | 100 | 200 | 400 | 'fit'
  let syncingFpsMs = false;
  let syncingGrid = false;
  let pendingChanges = false;   // true when sheet/transparency settings have unapplied edits
  let applied = null;           // last-applied (committed) sheet + transparency settings
  const PERF_NOTICE_KEY = 'performanceNoticeShown';

  // ---------- helpers ----------
  function hexToRgb(hex){
    hex = (hex||'#000000').replace('#','');
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    const num = parseInt(hex, 16) || 0;
    return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
  }
  function rgbToHex(r,g,b){ return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
  function setStatus(msg, kind){
    statusEl.textContent = msg;
    statusEl.className = 'status' + (kind === 'ok' ? ' ok' : '');
    statusEl.style.color = kind === 'error' ? 'var(--danger)' : (kind === 'ok' ? 'var(--ok)' : 'var(--muted)');
  }
  function updateStatusBar(extra){
    if (!img){ statusBar.textContent = 'Ready — import a sprite sheet to begin.'; return; }
    const trans = (applied && applied.removeEnabled) ? 'Transparency enabled' : 'Transparency disabled';
    statusBar.innerHTML = '<span><b>' + frames.length + '</b> frames loaded</span><span><b>' + (fpsInput.value||10) + '</b> FPS</span><span><b>' + img.width + '×' + img.height + '</b> sprite sheet</span><span>' + trans + '</span>' + (extra ? '<span>' + extra + '</span>' : '');
  }
  function debounce(fn, ms){
    let t = null;
    return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this,args), ms); };
  }

  function enablePanels(on){
    [sheetPanel, playbackPanel, bgPanel].forEach(p => p.classList.toggle('disabled-fields', !on));
    [autoDetectBtn, copySheetBtn, resetBtn, buildGifBtn, exportSheetBtn, exportFramesBtn, saveProjectBtn,
     restartBtn, prevBtn, playBtn, nextBtn, loopBtn].forEach(b => b.disabled = !on);
    updateApplyButtonState();
  }

  // ---------- pending changes / apply-changes workflow ----------
  // Sprite sheet settings (frame size, position, grid, spacing, playback order,
  // ignored frames) and transparency settings are "expensive" — they require
  // re-slicing the sheet and/or re-processing every frame's pixels. Editing
  // them only marks changes as pending; nothing is (re)processed until the
  // user clicks "Apply changes". Lightweight controls (FPS, delay, output
  // scale, loop, autoplay, zoom, transport) stay fully live and never touch
  // this flag.
  function markPendingChanges(){
    pendingChanges = true;
    updateApplyButtonState();
  }
  function clearPendingChanges(){
    pendingChanges = false;
    updateApplyButtonState();
  }
  function updateApplyButtonState(){
    applyChangesBtn.classList.toggle('pending', pendingChanges);
    applyChangesBtn.disabled = !img || !pendingChanges;
  }
  function setApplyStatus(msg){
    applyStatus.textContent = msg;
  }

  // Snapshot the current sheet + transparency field values as the
  // "committed" state that every processing function reads from, so that
  // draft edits never leak into the sheet overlay, timeline, preview, or
  // export until Apply is clicked.
  function captureApplied(){
    applied = {
      frameW: Math.max(1, parseInt(frameW.value) || 1),
      frameH: Math.max(1, parseInt(frameH.value) || 1),
      offsetX: Math.max(0, parseInt(offsetX.value) || 0),
      offsetY: Math.max(0, parseInt(offsetY.value) || 0),
      spacingX: Math.max(0, parseInt(spacingX.value) || 0),
      spacingY: Math.max(0, parseInt(spacingY.value) || 0),
      orientation: orientation.value,
      ignoreFrames: ignoreFrames.value,
      removeEnabled: removeEnabled.checked,
      removeColor: removeColor.value,
      tolerance: parseFloat(matchShades.value) || 0,
      fillTransparent: fillTransparent.checked,
      fillColor: fillColor.value
    };
  }

  function maybeShowPerformanceNotice(){
    let alreadyShown = false;
    try { alreadyShown = localStorage.getItem(PERF_NOTICE_KEY) === 'true'; } catch (err){ /* ignore */ }
    if (alreadyShown) return;
    performanceNotice.hidden = false;
    try { localStorage.setItem(PERF_NOTICE_KEY, 'true'); } catch (err){ /* storage unavailable, safe to ignore */ }
  }
  dismissPerfNotice.addEventListener('click', () => { performanceNotice.hidden = true; });

  function applyPendingChanges(){
    if (!img || !pendingChanges) return;
    captureApplied();
    regenerateFramesFromGrid(); // processes the pending settings exactly once
    clearPendingChanges();
    setApplyStatus('✓ Changes applied');
    maybeShowPerformanceNotice();
  }
  applyChangesBtn.addEventListener('click', applyPendingChanges);

  // ---------- image loading ----------
  dropzone.addEventListener('click', () => fileInput.click());
  importBtn.addEventListener('click', () => fileInput.click());
  resetBtn.addEventListener('click', () => location.reload());

  ['dragover','dragenter'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave','dragend','drop'].forEach(evt => dropzone.addEventListener(evt, () => dropzone.classList.remove('drag')));
  dropzone.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
  fileInput.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) loadFile(f); fileInput.value=''; });

  function loadFile(file){
    if (!file.type || !file.type.startsWith('image/')){ setStatus('That file is not a supported image (use PNG, JPG or WEBP).', 'error'); return; }
    const reader = new FileReader();
    reader.onerror = () => setStatus('Could not read that file.', 'error');
    reader.onload = e => {
      const image = new Image();
      image.onerror = () => setStatus('That image could not be loaded — it may be corrupted or an unsupported format.', 'error');
      image.onload = () => {
        if (image.width < 1 || image.height < 1){ setStatus('That image has no visible pixels.', 'error'); return; }
        img = image;
        sourceFileName = file.name || 'sprite.png';
        setupAfterImageLoad();
      };
      image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setupAfterImageLoad(){
    sheetCanvas = document.createElement('canvas');
    sheetCanvas.id = 'sheetCanvas';
    sheetCanvas.width = img.width; sheetCanvas.height = img.height;
    sheetCtx = sheetCanvas.getContext('2d');
    sheetCtx.imageSmoothingEnabled = false;

    sheetBody.innerHTML = '';
    sheetBody.appendChild(sheetCanvas);
    const info = document.createElement('div');
    info.className = 'sheet-info'; info.id = 'sheetInfo';
    sheetBody.appendChild(info);

    const startW = Math.min(32, img.width);
    const startH = Math.min(32, img.height);
    frameW.value = startW; frameH.value = startH;
    offsetX.value = 0; offsetY.value = 0;
    spacingX.value = 0; spacingY.value = 0;

    const px = samplePixel(0,0);
    const hex = rgbToHex(px[0], px[1], px[2]);
    removeColor.value = hex; removeColorPicker.value = hex;

    if (!projectNameInput.value.trim() && sourceFileName){
      projectNameInput.value = sourceFileName.replace(/\.[^.]+$/, '') || 'sprite-animation';
    }

    enablePanels(true);
    setStatus('');
    setApplyStatus('');
    recalcColsRowsFromFrameSize();
    captureApplied();
    regenerateFramesFromGrid();
    clearPendingChanges();
  }

  function samplePixel(x,y){
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    return cx.getImageData(Math.max(0,x), Math.max(0,y), 1, 1).data;
  }

  copySheetBtn.addEventListener('click', async () => {
    if (!sheetCanvas) return;
    try {
      sheetCanvas.toBlob(async blob => {
        await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
        setStatus('Sheet copied to clipboard.', 'ok');
      });
    } catch (err){ setStatus('Clipboard copy is not supported in this browser.', 'error'); }
  });

  // ---------- grid math (with spacing) ----------
  // computeGridCoords is pure arithmetic (no pixel processing), so it's cheap
  // enough to run live for the frame-size <-> columns/rows sync fields.
  function computeGridCoords(fw, fh, ox, oy, sx, sy){
    const availW = Math.max(0, img.width - ox);
    const availH = Math.max(0, img.height - oy);
    const cols = Math.max(1, Math.floor((availW + sx) / (fw + sx)));
    const rows = Math.max(1, Math.floor((availH + sy) / (fh + sy)));
    const coords = [];
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        coords.push({ x: ox + c*(fw+sx), y: oy + r*(fh+sy), w: fw, h: fh });
      }
    }
    return { coords, cols, rows, fw, fh };
  }

  // Draft grid: reads whatever is currently typed in the fields, used only
  // for the lightweight live cols/rows <-> frame-size sync — never for
  // actually slicing frames or drawing the overlay.
  function getDraftGrid(){
    const fw = Math.max(1, parseInt(frameW.value) || 1);
    const fh = Math.max(1, parseInt(frameH.value) || 1);
    const ox = Math.max(0, parseInt(offsetX.value) || 0);
    const oy = Math.max(0, parseInt(offsetY.value) || 0);
    const sx = Math.max(0, parseInt(spacingX.value) || 0);
    const sy = Math.max(0, parseInt(spacingY.value) || 0);
    return computeGridCoords(fw, fh, ox, oy, sx, sy);
  }

  // Applied grid: uses the last committed (Apply-clicked) settings. This is
  // what actually drives frame slicing, the sheet overlay, and export.
  function getAppliedGrid(){
    return computeGridCoords(applied.frameW, applied.frameH, applied.offsetX, applied.offsetY, applied.spacingX, applied.spacingY);
  }

  function recalcColsRowsFromFrameSize(){
    if (!img || syncingGrid) return;
    syncingGrid = true;
    const { cols, rows } = getDraftGrid();
    colsInput.value = cols; rowsInput.value = rows;
    syncingGrid = false;
  }

  function recalcFrameSizeFromColsRows(){
    if (!img || syncingGrid) return;
    syncingGrid = true;
    const ox = Math.max(0, parseInt(offsetX.value) || 0);
    const oy = Math.max(0, parseInt(offsetY.value) || 0);
    const sx = Math.max(0, parseInt(spacingX.value) || 0);
    const sy = Math.max(0, parseInt(spacingY.value) || 0);
    const c = Math.max(1, parseInt(colsInput.value) || 1);
    const r = Math.max(1, parseInt(rowsInput.value) || 1);
    const availW = Math.max(1, img.width - ox);
    const availH = Math.max(1, img.height - oy);
    const fw = Math.max(1, Math.floor((availW - (c-1)*sx) / c));
    const fh = Math.max(1, Math.floor((availH - (r-1)*sy) / r));
    frameW.value = fw; frameH.value = fh;
    syncingGrid = false;
  }

  function parseIgnoreList(str, maxIndex){
    const set = new Set();
    if (!str || !str.trim()) return set;
    str.split(',').forEach(part => {
      part = part.trim(); if (!part) return;
      if (part.includes('-')){
        let [a,b] = part.split('-').map(s => parseInt(s.trim(),10));
        if (isNaN(a) || isNaN(b)) return;
        if (a > b){ const t=a; a=b; b=t; }
        for (let i=a;i<=b;i++) if (i>=0 && i<=maxIndex) set.add(i);
      } else {
        const n = parseInt(part,10);
        if (!isNaN(n) && n>=0 && n<=maxIndex) set.add(n);
      }
    });
    return set;
  }

  function getSequenceIndices(cols, rows, maxIndex){
    const order = [];
    const dir = applied.orientation;
    if (dir === 'ltr'){ for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) order.push(r*cols+c); }
    else if (dir === 'rtl'){ for (let r=0;r<rows;r++) for (let c=cols-1;c>=0;c--) order.push(r*cols+c); }
    else if (dir === 'ttb'){ for (let c=0;c<cols;c++) for (let r=0;r<rows;r++) order.push(r*cols+c); }
    else { for (let c=0;c<cols;c++) for (let r=rows-1;r>=0;r--) order.push(r*cols+c); }
    const ignoreSet = parseIgnoreList(applied.ignoreFrames, maxIndex);
    return order.filter(i => !ignoreSet.has(i));
  }

  function drawSheetOverlay(){
    if (!img || !applied) return;
    const { coords, cols, rows, fw, fh } = getAppliedGrid();
    const ignoreSet = parseIgnoreList(applied.ignoreFrames, coords.length - 1);

    sheetCtx.clearRect(0,0,sheetCanvas.width, sheetCanvas.height);
    sheetCtx.drawImage(img, 0, 0);
    sheetCtx.strokeStyle = 'rgba(94,230,255,0.55)';
    sheetCtx.lineWidth = 1;
    coords.forEach((f,i) => {
      sheetCtx.strokeRect(f.x+0.5, f.y+0.5, f.w-1, f.h-1);
      if (ignoreSet.has(i)){ sheetCtx.fillStyle = 'rgba(255,107,129,0.35)'; sheetCtx.fillRect(f.x,f.y,f.w,f.h); }
    });
    sheetCtx.font = Math.max(9, Math.min(fw,fh)*0.26) + 'px "IBM Plex Mono", monospace';
    coords.forEach((f,i) => {
      sheetCtx.fillStyle = ignoreSet.has(i) ? 'rgba(255,107,129,0.9)' : 'rgba(255,180,84,0.9)';
      sheetCtx.fillText(i, f.x+3, f.y+12);
    });
    const info = document.getElementById('sheetInfo');
    if (info) info.textContent = img.width+'×'+img.height+'px — '+cols+'×'+rows+' grid — '+coords.length+' frames';
  }

  function regenerateFramesFromGrid(){
    if (!img || !applied) return;
    drawSheetOverlay();
    const { coords, cols, rows } = getAppliedGrid();
    if (!coords.length){ setStatus('Frame size is larger than the sprite sheet — reduce width/height.', 'error'); return; }
    const seq = getSequenceIndices(cols, rows, coords.length - 1);
    if (!seq.length){ setStatus('No frames left after applying the ignore list.', 'error'); frames = []; renderTimeline(); return; }
    frames = seq.map(i => Object.assign({ srcIndex: i }, coords[i]));
    selected = new Set();
    currentFrame = 0;
    renderTimeline();
    refreshPreviewSizing();
    drawPreviewFrame();
    updateExportInfo();
    updateStatusBar();
    stopPlayback();
    if (autoplay.checked && frames.length > 1) startPlayback();
  }

  // These settings require re-slicing the sheet and reprocessing frames, so
  // editing them only updates the lightweight draft fields (and syncs the
  // frame-size <-> columns/rows relationship live) — the actual expensive
  // work waits for the user to click "Apply changes".
  [frameW, frameH].forEach(el => el.addEventListener('input', () => { recalcColsRowsFromFrameSize(); markPendingChanges(); }));
  [offsetX, offsetY, spacingX, spacingY].forEach(el => el.addEventListener('input', () => { recalcColsRowsFromFrameSize(); markPendingChanges(); }));
  [colsInput, rowsInput].forEach(el => el.addEventListener('input', () => { recalcFrameSizeFromColsRows(); markPendingChanges(); }));
  [ignoreFrames, orientation].forEach(el => el.addEventListener('input', markPendingChanges));

  // ---------- auto frame detection ----------
  autoDetectBtn.addEventListener('click', () => {
    if (!img) return;
    try {
      const result = detectGrid();
      if (!result){ setStatus('Could not automatically detect a frame grid — try setting dimensions manually.', 'error'); return; }
      offsetX.value = result.offsetX; offsetY.value = result.offsetY;
      spacingX.value = result.spacingX; spacingY.value = result.spacingY;
      frameW.value = result.frameW; frameH.value = result.frameH;
      recalcColsRowsFromFrameSize();
      markPendingChanges();
      setStatus('Detected a ' + colsInput.value + '×' + rowsInput.value + ' frame grid — click Apply Changes to use it.', 'ok');
    } catch (err){
      setStatus('Automatic detection failed on this image — try manual settings.', 'error');
    }
  });

  function detectGrid(){
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0,0,img.width, img.height).data;
    const bg = { r:data[0], g:data[1], b:data[2], a:data[3] };
    const tol = 12;
    function isBg(x,y){
      const p = (y*img.width + x) * 4;
      if (bg.a < 8) return data[p+3] < 8;
      return Math.abs(data[p]-bg.r) <= tol && Math.abs(data[p+1]-bg.g) <= tol && Math.abs(data[p+2]-bg.b) <= tol && Math.abs(data[p+3]-bg.a) <= tol;
    }
    function columnIsBg(x){ for (let y=0;y<img.height;y++) if (!isBg(x,y)) return false; return true; }
    function rowIsBg(y){ for (let x=0;x<img.width;x++) if (!isBg(x,y)) return false; return true; }

    const colGaps = []; for (let x=0;x<img.width;x++) colGaps.push(columnIsBg(x));
    const rowGaps = []; for (let y=0;y<img.height;y++) rowGaps.push(rowIsBg(y));

    function findRuns(gaps){
      const runs = []; let start = null;
      for (let i=0;i<gaps.length;i++){
        if (!gaps[i] && start === null) start = i;
        if (gaps[i] && start !== null){ runs.push([start, i-1]); start = null; }
      }
      if (start !== null) runs.push([start, gaps.length-1]);
      return runs;
    }
    const colRuns = findRuns(colGaps);
    const rowRuns = findRuns(rowGaps);

    if (colRuns.length >= 1 && rowRuns.length >= 1){
      const widths = colRuns.map(r => r[1]-r[0]+1);
      const heights = rowRuns.map(r => r[1]-r[0]+1);
      const frameW = Math.max(...widths);
      const frameH = Math.max(...heights);
      const offsetX = colRuns[0][0];
      const offsetY = rowRuns[0][0];
      const spacingX = colRuns.length > 1 ? Math.max(0, colRuns[1][0] - colRuns[0][1] - 1) : 0;
      const spacingY = rowRuns.length > 1 ? Math.max(0, rowRuns[1][0] - rowRuns[0][1] - 1) : 0;
      if (frameW >= 2 && frameH >= 2) return { frameW, frameH, offsetX, offsetY, spacingX, spacingY };
    }

    // fallback: try common divisor sizes
    const candidates = [16,24,32,48,64,96,128];
    for (const size of candidates){
      if (img.width % size === 0 && img.height % size === 0){
        return { frameW:size, frameH:size, offsetX:0, offsetY:0, spacingX:0, spacingY:0 };
      }
    }
    return null;
  }

  // ---------- timeline ----------
  function renderTimeline(){
    timelineStrip.innerHTML = '';
    frames.forEach((f, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb' + (i === currentFrame ? ' current' : '') + (selected.has(i) ? ' selected' : '');
      thumb.draggable = true;
      thumb.dataset.index = i;

      const c = document.createElement('canvas');
      c.width = f.w; c.height = f.h;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      thumb.appendChild(c);

      const idx = document.createElement('div');
      idx.className = 'idx'; idx.textContent = String(i+1).padStart(2,'0');
      thumb.appendChild(idx);

      thumb.addEventListener('click', e => {
        if (e.shiftKey && selected.size){
          const last = Math.max(...selected);
          const [a,b] = last < i ? [last,i] : [i,last];
          for (let k=a;k<=b;k++) selected.add(k);
        } else if (e.ctrlKey || e.metaKey){
          if (selected.has(i)) selected.delete(i); else selected.add(i);
        } else {
          selected = new Set([i]);
        }
        currentFrame = i;
        stopPlayback();
        renderTimeline();
        drawPreviewFrame();
        updateTimelineButtons();
      });

      thumb.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); });
      thumb.addEventListener('dragover', e => { e.preventDefault(); thumb.classList.add('dragover'); });
      thumb.addEventListener('dragleave', () => thumb.classList.remove('dragover'));
      thumb.addEventListener('drop', e => {
        e.preventDefault(); thumb.classList.remove('dragover');
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = i;
        if (isNaN(from) || from === to) return;
        const moved = frames.splice(from, 1)[0];
        frames.splice(to, 0, moved);
        selected = new Set([to]);
        currentFrame = to;
        renderTimeline();
        updateExportInfo();
      });

      timelineStrip.appendChild(thumb);
    });
    updateTimelineButtons();
    frameCounter.textContent = frames.length ? (currentFrame+1) + ' / ' + frames.length : '0 / 0';
  }

  function updateTimelineButtons(){
    const has = selected.size > 0;
    duplicateFrameBtn.disabled = !has;
    deleteFrameBtn.disabled = !has || selected.size >= frames.length;
    reverseFrameBtn.disabled = frames.length < 2;
  }

  duplicateFrameBtn.addEventListener('click', () => {
    if (!selected.size) return;
    const idxs = Array.from(selected).sort((a,b)=>a-b);
    let offset = 0;
    idxs.forEach(i => {
      const copy = Object.assign({}, frames[i+offset]);
      frames.splice(i+offset+1, 0, copy);
      offset++;
    });
    selected = new Set();
    renderTimeline(); updateExportInfo();
    setStatus('Duplicated ' + idxs.length + ' frame(s).', 'ok');
  });

  deleteFrameBtn.addEventListener('click', () => {
    if (!selected.size || selected.size >= frames.length) return;
    const idxs = Array.from(selected).sort((a,b)=>b-a);
    idxs.forEach(i => frames.splice(i,1));
    selected = new Set();
    currentFrame = Math.min(currentFrame, frames.length-1);
    renderTimeline(); drawPreviewFrame(); updateExportInfo();
    setStatus('Deleted ' + idxs.length + ' frame(s).', 'ok');
  });

  reverseFrameBtn.addEventListener('click', () => {
    if (frames.length < 2) return;
    if (selected.size >= 2){
      const idxs = Array.from(selected).sort((a,b)=>a-b);
      const slice = idxs.map(i => frames[i]).reverse();
      idxs.forEach((i, k) => { frames[i] = slice[k]; });
    } else {
      frames.reverse();
    }
    renderTimeline(); drawPreviewFrame(); updateExportInfo();
    setStatus('Reversed frame order.', 'ok');
  });

  // ---------- background key ----------
  function colorMatches(r,g,b,target,tolerance){
    const dr=r-target.r, dg=g-target.g, db=b-target.b;
    const dist = Math.sqrt(dr*dr+dg*dg+db*db);
    return (dist / Math.sqrt(3*255*255)) * 100 <= tolerance;
  }
  function applyBackgroundKey(ctx, w, h){
    if (!applied || !applied.removeEnabled) return;
    const target = hexToRgb(applied.removeColor);
    const tolerance = applied.tolerance;
    const makeTransparent = applied.fillTransparent;
    const replacement = makeTransparent ? null : hexToRgb(applied.fillColor);
    const data = ctx.getImageData(0,0,w,h);
    const d = data.data;
    for (let p=0;p<d.length;p+=4){
      const alpha = d[p+3];
      const isEdgePixel = alpha > 0 && alpha < 250;
      if (colorMatches(d[p],d[p+1],d[p+2],target,tolerance)){
        if (makeTransparent){
          d[p+3] = isEdgePixel ? Math.round(alpha * 0.35) : 0; // soften anti-aliased edges instead of hard cut
        } else {
          d[p]=replacement.r; d[p+1]=replacement.g; d[p+2]=replacement.b; d[p+3]=255;
        }
      }
    }
    ctx.putImageData(data,0,0);
  }

  // ---------- preview + transport ----------
  function refreshPreviewSizing(){
    if (!frames.length) return;
    const f = frames[0];
    let zf;
    if (previewZoomMode === 'fit'){
      const bodyW = document.getElementById('previewBody').clientWidth - 28;
      const bodyH = 380;
      zf = Math.max(0.1, Math.min(bodyW / f.w, bodyH / f.h));
    } else {
      zf = previewZoomMode / 100;
    }
    previewCanvas.width = Math.max(1, Math.round(f.w * zf));
    previewCanvas.height = Math.max(1, Math.round(f.h * zf));
    previewCtx.imageSmoothingEnabled = false;
  }

  function drawPreviewFrame(){
    if (!frames.length){ previewCtx.clearRect(0,0,previewCanvas.width, previewCanvas.height); frameCounter.textContent = '0 / 0'; return; }
    currentFrame = ((currentFrame % frames.length) + frames.length) % frames.length;
    const f = frames[currentFrame];
    previewCtx.clearRect(0,0,previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, previewCanvas.width, previewCanvas.height);
    applyBackgroundKey(previewCtx, previewCanvas.width, previewCanvas.height);
    frameCounter.textContent = (currentFrame+1) + ' / ' + frames.length;
    Array.from(timelineStrip.children).forEach((el, i) => el.classList.toggle('current', i === currentFrame));
  }

  function startPlayback(){
    if (playing || frames.length < 2) return;
    playing = true; playBtn.textContent = '⏸';
    const tick = () => {
      currentFrame = (currentFrame + 1) % frames.length;
      drawPreviewFrame();
      playTimer = setTimeout(tick, Math.max(10, parseInt(delayMs.value) || 100));
    };
    playTimer = setTimeout(tick, Math.max(10, parseInt(delayMs.value) || 100));
  }
  function stopPlayback(){ playing = false; playBtn.textContent = '▶'; if (playTimer) clearTimeout(playTimer); playTimer = null; }

  playBtn.addEventListener('click', () => { playing ? stopPlayback() : startPlayback(); });
  restartBtn.addEventListener('click', () => { currentFrame = 0; drawPreviewFrame(); });
  prevBtn.addEventListener('click', () => { stopPlayback(); currentFrame -= 1; drawPreviewFrame(); });
  nextBtn.addEventListener('click', () => { stopPlayback(); currentFrame += 1; drawPreviewFrame(); });
  loopBtn.addEventListener('click', () => { loopGif.checked = !loopGif.checked; loopBtn.classList.toggle('active', loopGif.checked); });
  loopBtn.classList.toggle('active', loopGif.checked);

  zoomGroup.addEventListener('click', e => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    Array.from(zoomGroup.children).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    previewZoomMode = btn.dataset.zoom === 'fit' ? 'fit' : parseInt(btn.dataset.zoom, 10);
    refreshPreviewSizing();
    drawPreviewFrame();
  });

  // ---------- fps <-> ms sync ----------
  fpsInput.addEventListener('input', () => {
    if (syncingFpsMs) return;
    syncingFpsMs = true;
    const fps = Math.max(1, parseInt(fpsInput.value) || 10);
    delayMs.value = Math.round(1000 / fps);
    syncingFpsMs = false;
    updateExportInfo(); updateStatusBar();
  });
  delayMs.addEventListener('input', () => {
    if (syncingFpsMs) return;
    syncingFpsMs = true;
    const ms = Math.max(10, parseInt(delayMs.value) || 100);
    fpsInput.value = Math.max(1, Math.round(1000 / ms));
    syncingFpsMs = false;
    updateExportInfo(); updateStatusBar();
  });

  // Output scale is lightweight (only affects export sizing) and stays live.
  outputScale.addEventListener('input', () => { scaleLabel.textContent = outputScale.value + '%'; });
  // Everything below touches per-pixel processing, so it only updates the
  // draft field/label and marks changes pending until "Apply changes".
  matchShades.addEventListener('input', () => { matchLabel.textContent = matchShades.value + '%'; markPendingChanges(); });
  removeColorPicker.addEventListener('input', () => { removeColor.value = removeColorPicker.value; markPendingChanges(); });
  removeColor.addEventListener('change', () => { removeColorPicker.value = removeColor.value; markPendingChanges(); });
  fillColorPicker.addEventListener('input', () => { fillColor.value = fillColorPicker.value; markPendingChanges(); });
  fillColor.addEventListener('change', () => { fillColorPicker.value = fillColor.value; markPendingChanges(); });
  fillTransparent.addEventListener('change', () => { fillColorField.style.display = fillTransparent.checked ? 'none' : 'block'; markPendingChanges(); });
  removeEnabled.addEventListener('change', markPendingChanges);

  // ---------- export info ----------
  function updateExportInfo(){
    const fps = Math.max(1, parseInt(fpsInput.value) || 10);
    statFrames.textContent = frames.length || '—';
    statFps.textContent = fps;
    statDuration.textContent = frames.length ? (frames.length / fps).toFixed(1) + 's' : '—';
    statTransparency.textContent = (applied && applied.removeEnabled) ? 'Enabled' : 'Disabled';
  }

  // ---------- keyboard shortcuts ----------
  function isTypingTarget(el){
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }
  document.addEventListener('keydown', e => {
    if (isTypingTarget(document.activeElement)) return;
    if (!img) return;
    if (e.code === 'Space'){ e.preventDefault(); playing ? stopPlayback() : startPlayback(); }
    else if (e.code === 'ArrowLeft'){ e.preventDefault(); stopPlayback(); currentFrame -= 1; drawPreviewFrame(); }
    else if (e.code === 'ArrowRight'){ e.preventDefault(); stopPlayback(); currentFrame += 1; drawPreviewFrame(); }
    else if (e.key === 'Delete' || e.key === 'Backspace'){ if (selected.size) { e.preventDefault(); deleteFrameBtn.click(); } }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd'){ if (selected.size){ e.preventDefault(); duplicateFrameBtn.click(); } }
  });

  shortcutsBtn.addEventListener('click', () => { shortcutsModal.hidden = false; });
  closeShortcuts.addEventListener('click', () => { shortcutsModal.hidden = true; });
  shortcutsModal.addEventListener('click', e => { if (e.target === shortcutsModal) shortcutsModal.hidden = true; });

  // ---------- gif worker (same-origin blob to satisfy Worker CORS rules) ----------
  let workerBlobUrl = null;
  async function getWorkerScriptUrl(){
    if (workerBlobUrl) return workerBlobUrl;
    const resp = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
    if (!resp.ok) throw new Error('worker fetch failed');
    const blob = await resp.blob();
    workerBlobUrl = URL.createObjectURL(blob);
    return workerBlobUrl;
  }

  function renderFrameToCanvas(f, outW, outH){
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, outW, outH);
    applyBackgroundKey(cx, outW, outH);
    return c;
  }

  async function buildGif(){
    if (!img || !frames.length) { setStatus('Import a sprite sheet first.', 'error'); return; }
    const zf = Math.max(0.1, Math.min(8, (parseInt(outputScale.value)||100)/100));
    const f0 = frames[0];
    const outW = Math.max(1, Math.round(f0.w*zf));
    const outH = Math.max(1, Math.round(f0.h*zf));
    const delay = Math.max(10, parseInt(delayMs.value) || 100);
    const makeTransparent = applied.removeEnabled && applied.fillTransparent;

    buildGifBtn.disabled = true;
    progressBar.classList.add('active'); progressBar.value = 0;
    setStatus('Loading GIF encoder…');
    updateStatusBar('Processing GIF...');

    let workerUrl;
    try { workerUrl = await getWorkerScriptUrl(); }
    catch(err){
      setStatus('Could not load the GIF encoder — check your internet connection and try again.', 'error');
      progressBar.classList.remove('active'); buildGifBtn.disabled = false; updateStatusBar();
      return;
    }

    setStatus('Rendering frames…');
    let gif;
    try {
      gif = new GIF({
        workers: 2, quality: 8, width: outW, height: outH,
        workerScript: workerUrl,
        repeat: loopGif.checked ? 0 : -1,
        transparent: makeTransparent ? 'rgba(0,0,0,0)' : null
      });
    } catch (err){
      setStatus('Could not start the GIF encoder in this browser.', 'error');
      progressBar.classList.remove('active'); buildGifBtn.disabled = false; updateStatusBar();
      return;
    }

    for (let i=0; i<frames.length; i++){
      const c = renderFrameToCanvas(frames[i], outW, outH);
      gif.addFrame(c, { delay, copy: true });
      updateStatusBar('Building frame ' + (i+1) + '/' + frames.length + '...');
      if (i % 8 === 7) await new Promise(r => setTimeout(r, 0)); // yield so the tab stays responsive
    }

    gif.on('progress', p => {
      progressBar.value = Math.round(p*100);
      setStatus('Rendering frames… ' + Math.round(p*100) + '%');
    });
    gif.on('finished', blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'sprite-animation.gif';
      document.body.appendChild(a); a.click(); a.remove();
      progressBar.classList.remove('active');
      buildGifBtn.disabled = false;
      setStatus('✓ GIF created successfully — ' + frames.length + ' frames, ' + Math.round(blob.size/1024) + ' KB.', 'ok');
      updateStatusBar();
    });

    try { gif.render(); }
    catch (err){
      setStatus('GIF generation failed — try a smaller output scale or fewer frames.', 'error');
      progressBar.classList.remove('active'); buildGifBtn.disabled = false; updateStatusBar();
    }
  }
  buildGifBtn.addEventListener('click', buildGif);

  // ---------- PNG sprite sheet export ----------
  exportSheetBtn.addEventListener('click', () => {
    if (!frames.length) return;
    const f0 = frames[0];
    const cols = Math.min(frames.length, Math.ceil(Math.sqrt(frames.length)));
    const rows = Math.ceil(frames.length / cols);
    const out = document.createElement('canvas');
    out.width = cols * f0.w; out.height = rows * f0.h;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    frames.forEach((f, i) => {
      const fc = renderFrameToCanvas(f, f0.w, f0.h);
      octx.drawImage(fc, (i % cols) * f0.w, Math.floor(i / cols) * f0.h);
    });
    out.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'sprite-sheet-export.png';
      document.body.appendChild(a); a.click(); a.remove();
      setStatus('✓ PNG sprite sheet exported.', 'ok');
    });
  });

  // ---------- individual PNG frames (zip) ----------
  exportFramesBtn.addEventListener('click', async () => {
    if (!frames.length) return;
    if (typeof JSZip === 'undefined'){ setStatus('Zip library failed to load — check your connection.', 'error'); return; }
    setStatus('Packaging frames…');
    const zip = new JSZip();
    const f0 = frames[0];
    for (let i=0;i<frames.length;i++){
      const c = renderFrameToCanvas(frames[i], f0.w, f0.h);
      const blob = await new Promise(res => c.toBlob(res));
      zip.file('frame_' + String(i+1).padStart(3,'0') + '.png', blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a'); a.href = url; a.download = 'sprite-frames.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setStatus('✓ Individual PNG frames exported as a zip.', 'ok');
  });

  // ---------- project save / load (versioned, editable project JSON) ----------
  const PROJECT_VERSION = 1;
  const ORDER_TO_LABEL = { ltr: 'left-to-right', rtl: 'right-to-left', ttb: 'top-to-bottom', btt: 'bottom-to-top' };
  const LABEL_TO_ORDER = { 'left-to-right': 'ltr', 'right-to-left': 'rtl', 'top-to-bottom': 'ttb', 'bottom-to-top': 'btt' };

  function currentIgnoredFramesArray(){
    const { coords } = getAppliedGrid();
    return Array.from(parseIgnoreList(applied.ignoreFrames, coords.length - 1)).sort((a,b)=>a-b);
  }

  saveProjectBtn.addEventListener('click', () => {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const name = (projectNameInput.value || 'sprite-animation').trim() || 'sprite-animation';

    const appliedGrid = getAppliedGrid();
    const project = {
      version: PROJECT_VERSION,
      projectName: name,
      sourceImage: {
        name: (sourceFileName || 'sprite.png'),
        type: 'image/png',
        data: c.toDataURL('image/png')
      },
      frameWidth: applied.frameW,
      frameHeight: applied.frameH,
      offsetX: applied.offsetX,
      offsetY: applied.offsetY,
      columns: appliedGrid.cols,
      rows: appliedGrid.rows,
      spacingX: applied.spacingX,
      spacingY: applied.spacingY,
      fps: parseInt(fpsInput.value) || 10,
      delay: parseInt(delayMs.value) || 100,
      loop: !!loopGif.checked,
      playbackOrder: ORDER_TO_LABEL[applied.orientation] || 'left-to-right',
      ignoredFrames: currentIgnoredFramesArray(),
      frameOrder: frames.map(f => f.srcIndex),
      backgroundRemoval: {
        enabled: !!applied.removeEnabled,
        color: applied.removeColor,
        tolerance: applied.tolerance,
        fillTransparency: !!applied.fillTransparent,
        replacementColor: applied.fillColor
      },
      preview: {
        zoom: previewZoomMode === 'fit' ? 100 : previewZoomMode,
        fit: previewZoomMode === 'fit'
      },
      outputScale: parseInt(outputScale.value) || 100,
      autoplay: !!autoplay.checked
    };

    let blob;
    try { blob = new Blob([JSON.stringify(project)], { type: 'application/json' }); }
    catch (err){ setStatus('Could not build the project file — the image may be too large.', 'error'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name + '.sprite.json';
    document.body.appendChild(a); a.click(); a.remove();
    setStatus('✓ Project saved as ' + name + '.sprite.json', 'ok');
  });

  loadProjectBtn.addEventListener('click', () => loadProjectInput.click());
  loadProjectInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    loadProjectInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setStatus('Could not read that project file.', 'error');
    reader.onload = ev => {
      let project;
      try { project = JSON.parse(ev.target.result); }
      catch(err){ setStatus('That file is not a valid project — it is not readable JSON.', 'error'); return; }

      if (typeof project !== 'object' || project === null){ setStatus('That file is not a valid project.', 'error'); return; }
      if (project.version === undefined){ setStatus('That project file is missing a version number and cannot be trusted — please re-export it.', 'error'); return; }
      if (project.version > PROJECT_VERSION){ setStatus('This project was saved by a newer version of the editor and may not load correctly.', 'error'); }

      const src = project.sourceImage;
      if (!src || !src.data){ setStatus('That project has no sprite sheet embedded in it.', 'error'); return; }
      const requiredNums = ['frameWidth','frameHeight'];
      for (const k of requiredNums){
        if (typeof project[k] !== 'number' || project[k] < 1){ setStatus('That project is missing valid ' + k + ' and cannot be loaded.', 'error'); return; }
      }

      const image = new Image();
      image.onerror = () => setStatus('Could not load the sprite sheet stored in that project.', 'error');
      image.onload = () => {
        try {
          img = image;
          sourceFileName = src.name || 'sprite.png';
          setupSheetCanvasOnly();

          frameW.value = project.frameWidth;
          frameH.value = project.frameHeight;
          offsetX.value = project.offsetX || 0;
          offsetY.value = project.offsetY || 0;
          spacingX.value = project.spacingX || 0;
          spacingY.value = project.spacingY || 0;
          orientation.value = LABEL_TO_ORDER[project.playbackOrder] || 'ltr';
          ignoreFrames.value = Array.isArray(project.ignoredFrames) ? project.ignoredFrames.join(',') : '';

          fpsInput.value = project.fps || 10;
          delayMs.value = project.delay || Math.round(1000/(project.fps||10));
          outputScale.value = project.outputScale || 100;
          scaleLabel.textContent = (project.outputScale||100) + '%';
          loopGif.checked = project.loop !== false;
          autoplay.checked = project.autoplay !== false;

          const bg = project.backgroundRemoval || {};
          removeEnabled.checked = bg.enabled !== false;
          removeColor.value = bg.color || '#4cb7e5'; removeColorPicker.value = removeColor.value;
          matchShades.value = (bg.tolerance !== undefined ? bg.tolerance : 18); matchLabel.textContent = matchShades.value + '%';
          fillTransparent.checked = bg.fillTransparency !== false;
          fillColor.value = bg.replacementColor || '#121620'; fillColorPicker.value = fillColor.value;
          fillColorField.style.display = fillTransparent.checked ? 'none' : 'block';

          if (project.preview){
            previewZoomMode = project.preview.fit ? 'fit' : (project.preview.zoom || 100);
            Array.from(zoomGroup.children).forEach(b => b.classList.toggle('active',
              (project.preview.fit && b.dataset.zoom === 'fit') || (!project.preview.fit && parseInt(b.dataset.zoom) === previewZoomMode)));
          }

          projectNameInput.value = project.projectName || 'sprite-animation';
          enablePanels(true);
          recalcColsRowsFromFrameSize();
          if (project.columns) colsInput.value = project.columns;
          if (project.rows) rowsInput.value = project.rows;

          captureApplied();
          const { coords } = getAppliedGrid();
          if (Array.isArray(project.frameOrder) && project.frameOrder.length && coords.length){
            frames = project.frameOrder
              .filter(idx => idx >= 0 && idx < coords.length)
              .map(idx => Object.assign({ srcIndex: idx }, coords[idx]));
            if (!frames.length) frames = coords.map((c,i) => Object.assign({ srcIndex:i }, c));
            selected = new Set(); currentFrame = 0;
            drawSheetOverlay();
            renderTimeline(); refreshPreviewSizing(); drawPreviewFrame(); updateExportInfo(); updateStatusBar();
          } else {
            regenerateFramesFromGrid();
          }
          clearPendingChanges();
          setApplyStatus('');

          setStatus('✓ Project loaded successfully — ' + frames.length + ' frames • ' + (project.fps||10) + ' FPS • Transparency ' + (applied.removeEnabled ? 'enabled' : 'disabled'), 'ok');
        } catch (err){
          setStatus('That project appears to be corrupted and could not be fully restored.', 'error');
        }
      };
      image.src = src.data;
    };
    reader.readAsText(file);
  });

  function setupSheetCanvasOnly(){
    sheetCanvas = document.createElement('canvas');
    sheetCanvas.id = 'sheetCanvas';
    sheetCanvas.width = img.width; sheetCanvas.height = img.height;
    sheetCtx = sheetCanvas.getContext('2d');
    sheetCtx.imageSmoothingEnabled = false;
    sheetBody.innerHTML = '';
    sheetBody.appendChild(sheetCanvas);
    const info = document.createElement('div');
    info.className = 'sheet-info'; info.id = 'sheetInfo';
    sheetBody.appendChild(info);
  }

  window.addEventListener('resize', debounce(() => { if (previewZoomMode === 'fit'){ refreshPreviewSizing(); drawPreviewFrame(); } }, 150));
})();

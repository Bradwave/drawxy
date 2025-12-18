// -- Configuration --
let state = {
    mode: 'draw',
    radius: 10,
    friction: 0.4,
    brushSize: 3,
    isDrawing: false,
    // Paper Size
    width: 400,
    height: 600,
    scaleFactor: 2, // HiDPI
    cartesian: false,
    dftN: 10,
    dftDecimals: 2,
    coordDecimals: 2
};

let isDragging = false;
let dragLastPos = { x: 0, y: 0 };

// View State for Pan/Zoom
let viewState = {
    scale: 1,
    x: 0,
    y: 0
};

// Data
let curves = []; // { points: [{x,y}], brushSize: int }
let currentPoints = [];
let selectedIndex = -1;

let canvas, ctx;

// Lazy Brush
let pointer = { x: 0, y: 0 };
let brush = { x: 0, y: 0 };

// DOM Elements
const wrapper = document.getElementById('canvas-wrapper');
const radiusSlider = document.getElementById('radius-slider');
const frictionSlider = document.getElementById('friction-slider');
const brushSizeSlider = document.getElementById('brush-size-slider');
const dftNSlider = document.getElementById('dft-n-slider');
const dftNInput = document.getElementById('dft-n-input');
const dftDecimalsInput = document.getElementById('dft-decimals-input');
const coordDecimalsInput = document.getElementById('coord-decimals-input');

const radiusVal = document.getElementById('radius-val');
const frictionVal = document.getElementById('friction-val');
const brushSizeVal = document.getElementById('brush-size-val');

const deleteBtn = document.getElementById('delete-btn');
const gridCheck = document.getElementById('grid-check');
const cartesianCheck = document.getElementById('cartesian-check');
const resetViewBtn = document.getElementById('reset-view-btn');

const helper = document.getElementById('brush-helper');
const brushPoint = document.getElementById('brush-point');
const mouseTarget = document.getElementById('mouse-target');

// -- Event Listeners --
document.getElementById('create-btn').onclick = initCanvas;
document.getElementById('clear-btn').onclick = clearAll;
deleteBtn.onclick = deleteSelected;

function centerCanvas() {
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    // Default center logic: 
    // We want paper centered with some margin (scale 0.8 is good default)
    const startScale = 0.8;
    viewState.scale = startScale;
    viewState.x = (rect.width - state.width * startScale) / 2;
    viewState.y = (rect.height - state.height * startScale) / 2;

    // Round to avoid blurry edges if not using hiDPI (but we are)
    viewState.x = Math.round(viewState.x);
    viewState.y = Math.round(viewState.y);
    updateViewTransform();
    saveState();
}

resetViewBtn.onclick = centerCanvas;

// Save options on change
gridCheck.onchange = (e) => {
    if (canvas) {
        if (e.target.checked) canvas.classList.add('show-grid');
        else canvas.classList.remove('show-grid');
    }
    saveState();
};

cartesianCheck.onchange = (e) => {
    state.cartesian = e.target.checked;
    redraw();
    updateOutputs();
    updateDFT();
    saveState();
};

// Sliders
radiusSlider.oninput = (e) => {
    state.radius = parseInt(e.target.value);
    radiusVal.innerText = state.radius;
    updateHelperSize();
    saveState(); // Save live
};
frictionSlider.oninput = (e) => {
    state.friction = parseFloat(e.target.value);
    frictionVal.innerText = state.friction;
    saveState();
};
brushSizeSlider.oninput = (e) => {
    state.brushSize = parseInt(e.target.value);
    brushSizeVal.innerText = state.brushSize;
    saveState();
};

// DFT Sliders
dftNSlider.oninput = (e) => {
    let val = parseInt(e.target.value);
    state.dftN = val;
    dftNInput.value = val;
    updateDFT();
    saveState();
}
dftNInput.onchange = (e) => {
    let val = parseInt(e.target.value);
    state.dftN = val;
    dftNSlider.value = val;
    updateDFT();
    saveState();
}

// Decimals
dftDecimalsInput.onchange = (e) => {
    let val = parseInt(e.target.value);
    if (val < 0) val = 0; if (val > 10) val = 10;
    state.dftDecimals = val;
    updateDFT();
    saveState();
}

coordDecimalsInput.onchange = (e) => {
    let val = parseInt(e.target.value);
    if (val < 0) val = 0; if (val > 10) val = 10;
    state.coordDecimals = val;
    updateOutputs();
    saveState();
}


// Copy Handlers
function setupCopy(id, targetId, mode) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.onclick = () => {
        const txt = document.getElementById(targetId).value;
        if (!txt) return;

        if (mode === 'data') {
            const match = txt.match(/\[(.*)\]/s);
            if (match) navigator.clipboard.writeText('[' + match[1] + ']');
        } else {
            navigator.clipboard.writeText(txt);
        }
    };
}
setupCopy('copy-x-data', 'x-output', 'data');
setupCopy('copy-x-full', 'x-output', 'full');
setupCopy('copy-y-data', 'y-output', 'data');
setupCopy('copy-y-full', 'y-output', 'full');

setupCopy('copy-n-data', 'n-output', 'data');
setupCopy('copy-n-full', 'n-output', 'full');
setupCopy('copy-r-data', 'r-output', 'data');
setupCopy('copy-r-full', 'r-output', 'full');
setupCopy('copy-phi-data', 'phi-output', 'data');
setupCopy('copy-phi-full', 'phi-output', 'full');

function setMode(mode) {
    state.mode = mode;
    document.getElementById('mode-draw').classList.toggle('active', mode === 'draw');
    document.getElementById('mode-select').classList.toggle('active', mode === 'select');

    if (canvas) {
        wrapper.className = 'canvas-wrapper mode-' + mode;
    }

    if (mode === 'draw') {
        selectedIndex = -1;
        updateUIState();
        redraw();
    }

    if (mode === 'select') {
        helper.style.display = 'none';
        brushPoint.style.display = 'none';
        mouseTarget.style.display = 'none';
    }
}

// Load State from LocalStorage
const saved = localStorage.getItem('drawingApp_v1');
if (saved) {
    try {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed.state };
        curves = parsed.curves || [];
        if (parsed.viewState) viewState = parsed.viewState;

        // Ensure safety flags
        state.isDrawing = false;

        // Update UI from loaded state
        document.getElementById('width-input').value = state.width;
        document.getElementById('height-input').value = state.height;
        document.getElementById('radius-slider').value = state.radius;
        document.getElementById('radius-val').innerText = state.radius;
        document.getElementById('friction-slider').value = state.friction;
        document.getElementById('friction-val').innerText = state.friction;
        document.getElementById('brush-size-slider').value = state.brushSize;
        document.getElementById('brush-size-slider').value = state.brushSize;
        document.getElementById('brush-size-val').innerText = state.brushSize;

        if (state.dftDecimals !== undefined) document.getElementById('dft-decimals-input').value = state.dftDecimals;
        if (state.coordDecimals !== undefined) document.getElementById('coord-decimals-input').value = state.coordDecimals;

        // Options
        if (parsed.options) {
            gridCheck.checked = parsed.options.grid;
            state.grid = parsed.options.grid; // Ensure state tracks it if needed
        }
        cartesianCheck.checked = state.cartesian;

    } catch (e) { console.error("Load error", e); }
}

function saveState() {
    const payload = {
        state: state,
        curves: curves,
        viewState: viewState,
        options: {
            grid: gridCheck.checked
        }
    };
    localStorage.setItem('drawingApp_v1', JSON.stringify(payload));
}

document.getElementById('reset-storage-btn').onclick = () => {
    if (confirm('Are you sure? This will delete all drawings and reset settings.')) {
        localStorage.removeItem('drawingApp_v1');
        location.reload();
    }
};

function initCanvas() {
    // Update state from inputs (if not loaded, defaults)
    state.width = parseInt(document.getElementById('width-input').value);
    state.height = parseInt(document.getElementById('height-input').value);

    wrapper.innerHTML = '';
    wrapper.appendChild(helper);
    wrapper.appendChild(brushPoint);
    wrapper.appendChild(mouseTarget);
    wrapper.appendChild(resetViewBtn);

    // Re-append Desktop Hint
    const hint = document.createElement('div');
    hint.id = 'desktop-hint';
    hint.style.cssText = 'position: absolute; bottom: 12px; left: 16px; font-size: 0.75rem; color: var(--color-text-muted); opacity: 0.7; pointer-events: none; transition: opacity 1s ease-in-out;';
    hint.innerHTML = '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 14px;">mouse</span> Scroll to Zoom • Ctrl+Drag to Pan';
    wrapper.appendChild(hint);

    // Auto-hide hint after 10s
    setTimeout(() => {
        if (document.getElementById('desktop-hint')) {
            document.getElementById('desktop-hint').style.opacity = '0';
        }
    }, 10000);

    canvas = document.createElement('canvas');
    if (gridCheck.checked) canvas.classList.add('show-grid'); // Apply grid class

    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width * state.scaleFactor;
    canvas.height = rect.height * state.scaleFactor;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    ctx = canvas.getContext('2d');

    // Canvas Centering Logic
    if (viewState.scale === 1 && viewState.x === 0 && viewState.y === 0) {
        centerCanvas();
    }

    wrapper.appendChild(canvas);
    setMode(state.mode);

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleMouseUp);

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);

    canvas.addEventListener('mouseenter', () => {
        if (state.mode === 'draw') {
            helper.style.display = 'block';
            brushPoint.style.display = 'block';
            mouseTarget.style.display = 'block';
        }
    });

    // Don't reset curves here if loaded
    // But 'Create New'/Update Canvas logic implies reset?
    // User workflow: "Update Canvas" sets size. Usually implies new drawing.
    // But we just loaded state.
    // Let's keep curves.

    window.onresize = () => {
        const r = wrapper.getBoundingClientRect();
        canvas.width = r.width * state.scaleFactor;
        canvas.height = r.height * state.scaleFactor;
        redraw();
    };

    redraw();
    updateHelperSize();
    updateViewTransform();
    requestAnimationFrame(loop);
}

// -- Pan & Zoom Logic --
function updateViewTransform() {
    if (!canvas) return;
    // No CSS Transform on canvas anymore for crispness
    // canvas.style.transform = `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`;

    // We need to request redraw to apply ctx transform
    redraw();
    updateBrushVisuals(); // Update helpers size/pos

    if (viewState.scale !== 1 || viewState.x !== 0 || viewState.y !== 0) {
        resetViewBtn.style.display = 'flex';
    }
}

let touchStartDist = 0;
let touchStartScale = 1;
let touchStartCenter = { x: 0, y: 0 }; // Client Coords
let touchStartView = { x: 0, y: 0 };   // View State
let isTouching = false;

function getTouchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(t1, t2) {
    return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
    };
}

function handleTouchStart(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        isTouching = true;
        touchStartDist = getTouchDist(e.touches[0], e.touches[1]);
        touchStartScale = viewState.scale;

        touchStartCenter = getTouchCenter(e.touches[0], e.touches[1]);
        touchStartView = { x: viewState.x, y: viewState.y };

    }
}

// Mouse Wheel Zoom
let isCtrlPanning = false;
let lastMouseView = { x: 0, y: 0 };

function handleWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    // Mouse relative to canvas (not transformed)
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);

    const oldScale = viewState.scale;
    let newScale = oldScale * factor;
    newScale = Math.max(0.2, Math.min(10, newScale));

    // Zoom towards mouse:
    // The logic: The point under the mouse (logical) stays under the mouse (screen).
    // logicalX = (mouseX - panX) / scale
    // newPanX = mouseX - logicalX * newScale
    //         = mouseX - ((mouseX - panX) / oldScale) * newScale

    const newX = mouseX - ((mouseX - viewState.x) / oldScale) * newScale;
    const newY = mouseY - ((mouseY - viewState.y) / oldScale) * newScale;

    viewState.scale = newScale;
    viewState.x = newX;
    viewState.y = newY;

    updateViewTransform();
    saveState(); // Save on Zoom
}

function handleTouchMove(e) {
    if (e.touches.length === 2 && isTouching) {
        e.preventDefault();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        const center = getTouchCenter(e.touches[0], e.touches[1]);
        const rect = canvas.getBoundingClientRect();

        // Zoom
        const newScale = touchStartScale * (dist / touchStartDist);
        const clampedScale = Math.max(0.2, Math.min(10, newScale));

        // Pan + Zoom Composite
        // We want the point at 'center' to correspond to the same point it did at start.
        // Center relative to canvas
        const cx = center.x - rect.left;
        const cy = center.y - rect.top;
        const startCx = touchStartCenter.x - rect.left;
        const startCy = touchStartCenter.y - rect.top;

        // This is getting complex for simple touch logic replacement.
        // Simplified: Just use the delta of the center for panning?
        // Standard approach:
        // 1. Calculate new scale
        // 2. Adjust pan so that center of pinch stays fixed relative to content?
        // Let's stick to the previous simple logic but adapted for manual transform (since rect is static now).

        // Actually, since CANVAS ELEMENT is not transforming, 'rect' is static (0,0).

        // Simple Pan:
        const dx = center.x - touchStartCenter.x;
        const dy = center.y - touchStartCenter.y;

        // Apply simple pan from start view
        viewState.x = touchStartView.x + dx;
        viewState.y = touchStartView.y + dy;

        // Apply Scale (centered on screen center? or pinch center?)
        // Let's just update scale.
        viewState.scale = clampedScale;

        updateViewTransform();

    } else if (e.touches.length === 1) {
        if (e.target === canvas) {
            // e.preventDefault(); 
        }
    }
}

function handleTouchEnd(e) {
    if (e.touches.length < 2) {
        isTouching = false;
    }
}

function deleteSelected() {
    if (selectedIndex !== -1) {
        curves.splice(selectedIndex, 1);
        selectedIndex = -1;
        redraw();
        updateUIState();
    }
}

function clearAll() {
    if (!ctx) return;
    curves = [];
    currentPoints = [];
    selectedIndex = -1;
    redraw();
    updateUIState();
}

function updateUIState() {
    deleteBtn.disabled = selectedIndex === -1;
    updateOutputs();
    updateDFT(); // Also update DFT on selection change
}

function getCanvasCoords(e) {
    // Map Mouse Client Coords -> Logical Canvas Coords
    // Logic: (Client - CanvasOffset - Pan) / Scale
    const rect = canvas.getBoundingClientRect();

    // Client relative to DOM element
    const domX = e.clientX - rect.left;
    const domY = e.clientY - rect.top;

    // Apply Inverse Transform
    const logicX = (domX - viewState.x) / viewState.scale;
    const logicY = (domY - viewState.y) / viewState.scale;

    return { x: logicX, y: logicY };
}

function handleMove(e) {
    // Desktop Pan
    if (isCtrlPanning) {
        const dx = e.clientX - lastMouseView.x;
        const dy = e.clientY - lastMouseView.y;
        viewState.x += dx;
        viewState.y += dy;
        lastMouseView = { x: e.clientX, y: e.clientY };
        updateViewTransform();
        // hide cursor when panning
        if (brushPoint) brushPoint.style.display = 'none';
        if (helper) helper.style.display = 'none';
        return;
    }

    if (!canvas) return;

    // Drag Selection
    if (isDragging && selectedIndex !== -1 && state.mode === 'select') {
        const pos = getCanvasCoords(e);
        const dx = pos.x - dragLastPos.x;
        const dy = pos.y - dragLastPos.y;

        // Update curve points
        curves[selectedIndex].points.forEach(p => {
            p.x += dx;
            p.y += dy;
        });

        dragLastPos = pos;
        redraw();
        updateUIState();
        updateDFT();
        updateOutputs();
        saveState(); // Save on Drag
        return;
    }

    // Standard Move
    const pos = getCanvasCoords(e);
    pointer.x = pos.x;
    pointer.y = pos.y;

    // Update Mouse Target Helper
    // We need Wrapper Relative coordinate for the DIV helper
    const wrapRect = wrapper.getBoundingClientRect();
    const visX = e.clientX - wrapRect.left;
    const visY = e.clientY - wrapRect.top;

    mouseTarget.style.left = visX + 'px';
    mouseTarget.style.top = visY + 'px';


    if (!state.isDrawing && state.mode === 'draw') {
        brush.x = pointer.x;
        brush.y = pointer.y;
        updateBrushVisuals();
    }
}

function handleMouseDown(e) {
    // Check for Ctrl + Click
    if (e.ctrlKey) {
        isCtrlPanning = true;
        lastMouseView = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
    }

    if (e.button !== 0) return;
    const pos = getCanvasCoords(e);

    if (state.mode === 'select') {
        const hitIdx = findHitCurve(pos.x, pos.y);
        selectedIndex = hitIdx;

        if (hitIdx !== -1) {
            isDragging = true;
            dragLastPos = pos;
        }

        redraw();
        updateUIState();
        return;
    }

    // Draw Mode: Check if inside paper
    if (pos.x >= 0 && pos.x <= state.width && pos.y >= 0 && pos.y <= state.height) {
        state.isDrawing = true;
        currentPoints = [];

        brush.x = pos.x;
        brush.y = pos.y;
        pointer.x = pos.x;
        pointer.y = pos.y;

        addPoint(brush.x, brush.y);
    }
}

function handleMouseUp() {
    if (isCtrlPanning) {
        isCtrlPanning = false;
        return;
    }
    if (isDragging) {
        isDragging = false;
        return;
    }

    if (state.mode === 'select') return;
    if (!state.isDrawing) return;
    state.isDrawing = false;

    if (currentPoints.length > 2) {
        const start = currentPoints[0];
        addPoint(start.x, start.y);

        curves.push({
            points: [...currentPoints],
            brushSize: state.brushSize
        });
        selectedIndex = curves.length - 1;
    }

    currentPoints = [];
    redraw();
    updateUIState();
    saveState(); // Save on Draw End
}

function loop() {
    if (state.isDrawing && state.mode === 'draw') {
        const dx = pointer.x - brush.x;
        const dy = pointer.y - brush.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > state.radius) {
            const angle = Math.atan2(dy, dx);
            const targetX = pointer.x - Math.cos(angle) * state.radius;
            const targetY = pointer.y - Math.sin(angle) * state.radius;

            brush.x += (targetX - brush.x) * state.friction;
            brush.y += (targetY - brush.y) * state.friction;

            addPoint(brush.x, brush.y);
        }
        updateBrushVisuals();
        redraw();
    }
    requestAnimationFrame(loop);
}

function updateBrushVisuals() {
    if (canvas && state.mode === 'draw' && selectedIndex === -1) {
        // Calculate visual position
        // Visual = Logical * Scale + Pan

        // We must add canvas offset (wrapper relative)
        // Or rather: MouseTarget is in wrapper. Wrapper has relative positioning.
        // Canvas is in wrapper.
        // Canvas OffsetLeft/top is 0 or centered? 
        // Canvas is Flex centered.

        const cx = canvas.offsetLeft + viewState.x + brush.x * viewState.scale;
        const cy = canvas.offsetTop + viewState.y + brush.y * viewState.scale;

        const r = state.radius * viewState.scale;

        brushPoint.style.display = 'block';
        helper.style.display = 'block';

        brushPoint.style.left = cx + 'px';
        brushPoint.style.top = cy + 'px';

        helper.style.width = (r * 2) + 'px';
        helper.style.height = (r * 2) + 'px';
        helper.style.left = cx + 'px';
        helper.style.top = cy + 'px';

    } else {
        brushPoint.style.display = 'none';
        helper.style.display = 'none';
    }
}

function drawCurve(pts, isSelected, size) {
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }

    ctx.strokeStyle = isSelected ? '#1484e6' : 'black';
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function redraw() {
    if (!ctx) return;

    // Clear entire viewport
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); // clear physical

    // Transform
    const F = state.scaleFactor;
    const s = viewState.scale;
    const x = viewState.x;
    const y = viewState.y;

    // We apply transform for drawing the content
    ctx.setTransform(s * F, 0, 0, s * F, x * F, y * F);

    // 1. Draw Paper
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.restore();

    // Clip to Paper
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, state.width, state.height);
    ctx.clip();

    // Draw Grid Manually
    if (gridCheck.checked) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1 / s;

        const step = 50;
        ctx.beginPath();
        for (let gx = 0; gx <= state.width; gx += step) {
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, state.height);
        }
        for (let gy = 0; gy <= state.height; gy += step) {
            ctx.moveTo(0, gy);
            ctx.lineTo(state.width, gy);
        }
        ctx.stroke();
    }

    // Draw Axes if cartesian
    if (state.cartesian) {
        const cx = state.width / 2;
        const cy = state.height / 2;
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1 / s;

        // X Axis
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(state.width, cy);
        ctx.stroke();

        // Y Axis
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, state.height);
        ctx.stroke();
    }

    curves.forEach((c, idx) => {
        drawCurve(c.points, idx === selectedIndex, c.brushSize);
    });

    if (state.isDrawing && currentPoints.length > 0) {
        drawCurve(currentPoints, true, state.brushSize);
    }

    ctx.restore(); // End Clip
}

function updateBrushVisuals() {
    if (canvas && state.mode === 'draw') {
        // Visual = Logical * Scale + Pan
        const s = viewState.scale;
        const tx = viewState.x;
        const ty = viewState.y;

        const visualX = brush.x * s + tx;
        const visualY = brush.y * s + ty;

        const r = state.radius * s;

        brushPoint.style.display = 'block';
        helper.style.display = 'block';

        // Wrapper Relative (Assuming canvas is at 0,0 inside innerHTML cleared wrapper)
        // Actually wrapper flex centers canvas usually?
        // But we set canvas size to wrapper size in initCanvas.
        // So canvas offset is 0. 

        brushPoint.style.left = visualX + 'px';
        brushPoint.style.top = visualY + 'px';

        helper.style.width = (r * 2) + 'px';
        helper.style.height = (r * 2) + 'px';
        helper.style.left = visualX + 'px';
        helper.style.top = visualY + 'px';
    } else {
        brushPoint.style.display = 'none';
        helper.style.display = 'none';
    }
}

function updateHelperSize() {
    const d = state.radius * 2;
    helper.style.width = d + 'px';
    helper.style.height = d + 'px';
}

function addPoint(x, y) {
    if (currentPoints.length > 0) {
        const last = currentPoints[currentPoints.length - 1];
        if (Math.abs(last.x - x) < 0.1 && Math.abs(last.y - y) < 0.1) return;
    }
    currentPoints.push({ x, y });
}

function getCurvePoints(idx) {
    if (idx !== -1 && curves[idx]) {
        const raw = curves[idx].points;
        // Convert to Cartesian if needed
        if (state.cartesian) {
            const cx = state.width / 2;
            const cy = state.height / 2;
            return raw.map(p => ({
                x: p.x - cx,
                y: -(p.y - cy) // y up is positive
            }));
        }
        return raw;
    }
    return [];
}

function updateOutputs() {
    const pts = getCurvePoints(selectedIndex);

    if (pts.length === 0) {
        document.getElementById('x-output').value = ``;
        document.getElementById('y-output').value = ``;
        return;
    }

    const dec = state.coordDecimals !== undefined ? state.coordDecimals : 2;
    const xArr = pts.map(p => parseFloat(p.x.toFixed(dec)));
    const yArr = pts.map(p => parseFloat(p.y.toFixed(dec)));

    document.getElementById('x-output').value = `const drawingX = [${xArr.join(', ')}];`;
    document.getElementById('y-output').value = `const drawingY = [${yArr.join(', ')}];`;
}

function updateDFT() {
    const pts = getCurvePoints(selectedIndex);
    const nOut = document.getElementById('n-output');
    const rOut = document.getElementById('r-output');
    const phiOut = document.getElementById('phi-output');

    if (pts.length === 0) {
        nOut.value = ''; rOut.value = ''; phiOut.value = '';
        return;
    }

    const M = pts.length;

    // Dynamic N limits
    // maxN can be M, capped at 1000
    const maxLimit = 1000;
    const effectiveMax = Math.min(M, maxLimit);

    dftNSlider.max = effectiveMax;
    dftNInput.max = effectiveMax;

    // Clamp current value
    if (state.dftN > effectiveMax) {
        state.dftN = effectiveMax;
        dftNSlider.value = state.dftN;
        dftNInput.value = state.dftN;
    }

    const targetN = state.dftN; // Exact count user wants

    // Generate Indices: 0, 1, -1, 2, -2 ...
    let indices = [];

    // Always include 0 if targetN >= 1
    if (targetN >= 1) indices.push(0);

    let k = 1;
    while (indices.length < targetN && k < M) {
        // Positive k
        if (indices.length < targetN) {
            indices.push(k);
        }

        // Negative k (M - k)
        if (indices.length < targetN) {
            const negK = M - k;
            // Avoid duplicate if M is even and k = M/2
            if (negK !== k) {
                indices.push(negK);
            }
        }
        k++;
    }

    let resultN = [];
    let resultR = [];
    let resultPhi = [];
    const dec = state.dftDecimals !== undefined ? state.dftDecimals : 2;

    indices.forEach(m => {
        let sumR = 0;
        let sumI = 0;

        for (let k = 0; k < M; k++) {
            const p = pts[k]; // x + iy
            const theta = -2 * Math.PI * m * k / M;
            const c = Math.cos(theta);
            const s = Math.sin(theta);

            sumR += p.x * c - p.y * s;
            sumI += p.x * s + p.y * c;
        }

        sumR /= M;
        sumI /= M;

        const r = Math.sqrt(sumR * sumR + sumI * sumI);
        const phi = Math.atan2(sumI, sumR);

        let nVal = m;
        if (m >= M / 2 && m > 0) nVal = m - M; // Convert M-k to -k for display

        resultN.push(nVal);
        resultR.push(parseFloat(r.toFixed(dec)));
        resultPhi.push(parseFloat(phi.toFixed(dec)));
    });

    nOut.value = `const v = [${resultN.join(', ')}];`;
    rOut.value = `const R = [${resultR.join(', ')}];`;
    phiOut.value = `const phi = [${resultPhi.join(', ')}];`;
}

function findHitCurve(x, y) {
    const HIT_DIST = 10;
    for (let i = curves.length - 1; i >= 0; i--) {
        const pts = curves[i].points;
        for (let j = 0; j < pts.length - 1; j++) {
            const dist = distToSegment({ x, y }, pts[j], pts[j + 1]);
            if (dist < HIT_DIST) {
                return i;
            }
        }
    }
    return -1;
}

function distToSegment(p, v, w) {
    const l2 = distSq(v, w);
    if (l2 === 0) return distSq(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(distSq(p, {
        x: v.x + t * (w.x - v.x),
        y: v.y + t * (w.y - v.y)
    }));
}

function distSq(v, w) {
    return (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
}

updateHelperSize();

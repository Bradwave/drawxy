// -- Configuration --
let state = {
    mode: 'draw',
    radius: 10,
    friction: 0.4,
    brushSize: 3,
    eraserSize: 10,
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
let snapState = null; // { type: 'start'|'end', x, y }
let isExtending = false;
let extensionType = null; // 'start' | 'end'
let ignoreSnap = false;
let lastDrawPos = { x: 0, y: 0 };

// View State for Pan/Zoom
let viewState = {
    scale: 1,
    x: 0,
    y: 0
};
let eraserFull = false; // Visual state for eraser

// Data
let curves = []; // { points: [{x,y}], brushSize: int }
let currentPoints = [];
let selectedIndex = -1;

let canvas, ctx;

// Lazy Brush
let pointer = { x: 0, y: 0 };
let brush = { x: 0, y: 0 };
// Reference Images
let referenceImages = []; 
let selectedImageId = null;
let isDraggingImage = false;
let resizeHandle = null;

// DOM Elements
const wrapper = document.getElementById('canvas-wrapper');
const radiusSlider = document.getElementById('radius-slider');
const frictionSlider = document.getElementById('friction-slider');
const brushSizeSlider = document.getElementById('brush-size-slider');
const eraserSizeSlider = document.getElementById('eraser-size-slider');
const dftNSlider = document.getElementById('dft-n-slider');
const dftNInput = document.getElementById('dft-n-input');
const dftDecimalsInput = document.getElementById('dft-decimals-input');
const coordDecimalsInput = document.getElementById('coord-decimals-input');

const radiusVal = document.getElementById('radius-val');
const frictionVal = document.getElementById('friction-val');
const brushSizeVal = document.getElementById('brush-size-val');
const eraserSizeVal = document.getElementById('eraser-size-val');

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
    brushSizeVal.innerText = state.brushSize;
    saveState();
};
eraserSizeSlider.oninput = (e) => {
    state.eraserSize = parseInt(e.target.value);
    eraserSizeVal.innerText = state.eraserSize;
    updateBrushVisuals();
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

// Canvas Size Inputs Persistence
document.getElementById('width-input').oninput = (e) => {
    state.inputWidth = e.target.value;
    saveState();
};
document.getElementById('height-input').oninput = (e) => {
    state.inputHeight = e.target.value;
    saveState();
};

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
    document.getElementById('mode-erase').classList.toggle('active', mode === 'erase');

    if (canvas) {
        wrapper.className = 'canvas-wrapper mode-' + mode;
    }

    if (mode === 'draw' || mode === 'erase') {
        // Sync brush to pointer immediately so visual appears at cursor
        brush.x = pointer.x;
        brush.y = pointer.y;
    }

    if (mode === 'erase') {
        selectedIndex = -1;
    }

    // Always update UI and visuals
    updateUIState();
    redraw();
    updateBrushVisuals();
}

// Load State from LocalStorage
const saved = localStorage.getItem('drawingApp_v1');
if (saved) {
    try {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed.state };
        // Ensure collapsedSections exists
        if (!state.collapsedSections) state.collapsedSections = {};

        curves = parsed.curves || [];
        if (parsed.viewState) viewState = parsed.viewState;

        // Ensure safety flags
        state.isDrawing = false;

        // Update UI from loaded state
        document.getElementById('width-input').value = state.inputWidth !== undefined ? state.inputWidth : state.width;
        document.getElementById('height-input').value = state.inputHeight !== undefined ? state.inputHeight : state.height;
        document.getElementById('radius-slider').value = state.radius;
        document.getElementById('radius-val').innerText = state.radius;
        document.getElementById('friction-slider').value = state.friction;
        document.getElementById('friction-val').innerText = state.friction;
        document.getElementById('brush-size-slider').value = state.brushSize;
        document.getElementById('brush-size-slider').value = state.brushSize;
        document.getElementById('brush-size-val').innerText = state.brushSize;
        
        if (state.eraserSize) {
             document.getElementById('eraser-size-slider').value = state.eraserSize;
             document.getElementById('eraser-size-val').innerText = state.eraserSize;
        }

        if (state.dftDecimals !== undefined) document.getElementById('dft-decimals-input').value = state.dftDecimals;
        if (state.coordDecimals !== undefined) document.getElementById('coord-decimals-input').value = state.coordDecimals;

        // Options
        if (parsed.options) {
            gridCheck.checked = parsed.options.grid;
            state.grid = parsed.options.grid; // Ensure state tracks it if needed
        }
        if (parsed.referenceImages) {
             referenceImages = parsed.referenceImages.map(r => {
                 const img = new Image();
                 img.src = r.src;
                 img.onload = () => redraw();
                 return { ...r, img };
             });
             renderRefUI();
        }

    } catch (e) { console.error("Load error", e); }
}

function saveState() {
    const payload = {
        state: state,
        curves: curves,
        viewState: viewState,
        referenceImages: referenceImages.map(r => ({
            id: r.id, name: r.name, x: r.x, y: r.y, width: r.width, height: r.height, opacity: r.opacity, src: r.img.src
        })),
        options: {
            grid: gridCheck.checked
        }
    };
    try {
        localStorage.setItem('drawingApp_v1', JSON.stringify(payload));
    } catch (e) {
        console.warn("Storage Quota Exceeded or Error Saving State", e);
        // Fallback: Try saving without images if quota exceeded?
        // Or just let user know? 
        // Since I cannot alert every move, I just log.
        // To fix for user: Attempt to clear old? 
    }
}

document.getElementById('reset-storage-btn').onclick = () => {
    if (confirm('Are you sure? This will delete all drawings and reset settings.')) {
        localStorage.removeItem('drawingApp_v1');
        location.reload();
    }
};

function initCanvas() {
    // Update state from inputs (if not loaded, defaults)
    const newW = parseInt(document.getElementById('width-input').value);
    const newH = parseInt(document.getElementById('height-input').value);

    // Resize Logic: Center Content
    if (state.width !== newW || state.height !== newH) {
        const dW = newW - state.width;
        const dH = newH - state.height;

        // Shift all curves
        curves.forEach(c => {
            c.points.forEach(p => {
                p.x += dW / 2;
                p.y += dH / 2;
            });
        });

        // Shift Reference Images
        referenceImages.forEach(img => {
            img.x += dW / 2;
            img.y += dH / 2;
        });
    }

    state.width = newW;
    state.height = newH;
    state.inputWidth = newW;
    state.inputHeight = newH;

    wrapper.innerHTML = '';
    
    // Create new canvas first
    canvas = document.createElement('canvas');
    if (gridCheck.checked) canvas.classList.add('show-grid'); 

    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width * state.scaleFactor;
    canvas.height = rect.height * state.scaleFactor;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Add canvas first (bottom layer)
    wrapper.appendChild(canvas);

    // Add helpers on top
    wrapper.appendChild(helper);
    wrapper.appendChild(brushPoint);
    wrapper.appendChild(mouseTarget);
    wrapper.appendChild(resetViewBtn);

    // Re-append Desktop Hint
    const hint = document.createElement('div');
    hint.id = 'desktop-hint';
    hint.innerHTML = '<span class="material-symbols-outlined" style="vertical-align: middle; font-size: 14px;">mouse</span> Scroll to Zoom • Ctrl+Drag to Pan';
    wrapper.appendChild(hint);

    // Auto-hide hint after 10s
    setTimeout(() => {
        if (document.getElementById('desktop-hint')) {
            document.getElementById('desktop-hint').style.opacity = '0';
        }
    }, 10000);

    ctx = canvas.getContext('2d');

    // Canvas Centering Logic
    if (viewState.scale === 1 && viewState.x === 0 && viewState.y === 0) {
        centerCanvas();
    }

    setMode(state.mode);

    // Attach listeners to the NEW canvas element
    setupCanvasListeners(canvas);

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
    // Ensure loop is running (idempotent?)
    // requestAnimationFrame(loop); // loop calls itself.
    // We only need to start it once. It's started at bottom of file?
    // Let's check.
}

function setupCanvasListeners(cvs) {
    // Use Pointer events for drawing (supports mouse and touch)
    cvs.addEventListener('pointerdown', e => {
        // Prevent scrolling on touch devices
        e.preventDefault();
        handleMouseDown(e);
    });
    
    cvs.addEventListener('mouseenter', () => {
        if (state.mode === 'draw' || state.mode === 'erase') {
             if (helper) helper.style.display = 'block';
             if (brushPoint) brushPoint.style.display = 'block';
             if (mouseTarget) mouseTarget.style.display = 'block';
             updateBrushVisuals();
        }
    });
}

function setupGlobalListeners() {
    window.addEventListener('pointermove', e => {
        e.preventDefault();
        handleMove(e);
    });
    window.addEventListener('pointerup', e => {
        e.preventDefault();
        handleMouseUp();
    });

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);
}
// Call immediately
setupGlobalListeners();
requestAnimationFrame(loop); // Start loop once



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
        saveState();
    }
}

function clearAll() {
    if (!ctx) return;
    if (confirm('Clear all drawings?')) {
        curves = [];
        currentPoints = [];
        selectedIndex = -1;
        redraw();
        updateUIState();
        saveState();
    }
}

function updateUIState() {
    deleteBtn.disabled = selectedIndex === -1;
    
    // Disable/Enable Coord Inputs
    const coordDisabled = selectedIndex === -1;
    const xIn = document.getElementById('x-output');
    const yIn = document.getElementById('y-output');
    
    if (xIn) xIn.disabled = coordDisabled;
    if (yIn) yIn.disabled = coordDisabled;

    updateOutputs();
    updateDFT(); // Also update DFT on selection change
}

function getCanvasCoords(e) {
    // Map Mouse Client Coords -> Logical Canvas Coords
    // Logic: (Client - CanvasOffset - Pan) / Scale
    if (!canvas) return { x: 0, y: 0 };
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
    const pos = getCanvasCoords(e);
    
    // Cursor updates
    if (canvas) {
        if (state.mode === 'select' && !isDragging && !isDraggingImage && !resizeHandle && !resizeCurveMode && !isCtrlPanning) {
            let cursor = 'default';
            const imgHit = hitTestImage(pos.x, pos.y);
            if (imgHit) {
                cursor = imgHit.type === 'resize' ? 'nwse-resize' : 'move';
            } else if (hitTestCurveHandle(pos.x, pos.y)) {
                 cursor = 'nwse-resize';
            } else if (findHitCurve(pos.x, pos.y) !== -1) {
                 cursor = 'move';
            }
            canvas.style.cursor = cursor;
        } else if (isCtrlPanning) {
            canvas.style.cursor = 'grabbing';
        } else {
            canvas.style.cursor = 'default';
        }
    }

    // Desktop Pan
    if (isCtrlPanning) {
        const dx = e.clientX - lastMouseView.x;
        const dy = e.clientY - lastMouseView.y;
        viewState.x += dx;
        viewState.y += dy;
        lastMouseView = { x: e.clientX, y: e.clientY };
        updateViewTransform();
        if (brushPoint) brushPoint.style.display = 'none';
        if (helper) helper.style.display = 'none';
        return;
    }

    if (!canvas) return;

    // Image Resize
    if (resizeHandle && selectedImageId !== null) {
         const img = referenceImages.find(i => i.id === selectedImageId);
         if (img) {
             let nw = pos.x - img.x;
             let nh = pos.y - img.y;
             
             if (e.shiftKey || e.ctrlKey) {
                 const ratio = img.img ? (img.img.width / img.img.height) : (img.width/img.height);
                 nh = nw / ratio;
             }
             
             if (nw < 20) nw = 20;
             if (nh < 20) nh = 20;
             img.width = nw;
             img.height = nh;
             redraw();
         }
         return; 
    }

    // Image Drag
    if (isDraggingImage && selectedImageId !== null) {
         const dx = pos.x - dragLastPos.x;
         const dy = pos.y - dragLastPos.y;
         const img = referenceImages.find(i => i.id === selectedImageId);
         if (img) {
             img.x += dx;
             img.y += dy;
             dragLastPos = pos;
             redraw();
         }
         return;
    }
    
    // Curve Scale
    if (resizeCurveMode && selectedIndex !== -1 && curveStartBounds) {
         let newW = pos.x - curveStartBounds.x;
         let newH = pos.y - curveStartBounds.y;
         if (newW < 10) newW = 10;
         if (newH < 10) newH = 10;
         
         const scaleX = newW / curveStartBounds.w;
         const scaleY = newH / curveStartBounds.h;
         const pts = curves[selectedIndex].points;
         for(let i=0; i<pts.length; i++) {
             pts[i].x = curveStartBounds.x + (curveStartPoints[i].x - curveStartBounds.x) * scaleX;
             pts[i].y = curveStartBounds.y + (curveStartPoints[i].y - curveStartBounds.y) * scaleY;
         }
         redraw();
         return;
    }

    // Curve Drag
    if (isDragging && selectedIndex !== -1 && state.mode === 'select') {
        const dx = pos.x - dragLastPos.x;
        const dy = pos.y - dragLastPos.y;
        curves[selectedIndex].points.forEach(p => {
            p.x += dx;
            p.y += dy;
        });

        dragLastPos = pos;
        redraw();
        updateUIState();
        updateDFT();
        updateOutputs();
        saveState();
        return;
    }

    // Standard Move (Draw Mode)
    pointer.x = pos.x;
    pointer.y = pos.y;
    
    // Snap Logic
    snapState = null;
    
    // Check if we should ignore snap (moving away from just-finished point)
    if (ignoreSnap) {
        const dist = Math.hypot(pos.x - lastDrawPos.x, pos.y - lastDrawPos.y);
        const SNAP_THRESH = 15 / viewState.scale;
        if (dist > SNAP_THRESH) {
            ignoreSnap = false;
        }
    }

    if (!ignoreSnap && state.mode === 'draw' && selectedIndex !== -1 && !state.isDrawing) {
        const pts = curves[selectedIndex].points;
        if (pts.length > 0) {
            const start = pts[0];
            const end = pts[pts.length - 1];
            const distStart = Math.hypot(pos.x - start.x, pos.y - start.y);
            const distEnd = Math.hypot(pos.x - end.x, pos.y - end.y);
            
            const SNAP_THRESH = 15 / viewState.scale;
            
            if (distStart < SNAP_THRESH && distStart <= distEnd) {
                snapState = { type: 'start', x: start.x, y: start.y };
            } else if (distEnd < SNAP_THRESH) {
                snapState = { type: 'end', x: end.x, y: end.y };
            }
            
            if (snapState) {
                pointer.x = snapState.x;
                pointer.y = snapState.y;
                brush.x = snapState.x;
                brush.y = snapState.y;
            }
        }
    }

    const wrapRect = wrapper.getBoundingClientRect();
    const visX = e.clientX - wrapRect.left;
    const visY = e.clientY - wrapRect.top;

    mouseTarget.style.left = visX + 'px';
    mouseTarget.style.top = visY + 'px';

    if (!state.isDrawing && (state.mode === 'draw' || state.mode === 'erase')) {
        if (state.mode === 'draw') {
            if (snapState) {
                brush.x = snapState.x;
                brush.y = snapState.y;
            } else {
                brush.x = pointer.x;
                brush.y = pointer.y;
            }
        } else {
            // Eraser
            brush.x = pointer.x;
            brush.y = pointer.y;
        }
        updateBrushVisuals();
    }

    if (state.mode === 'erase') {
        handleEraser(pos);
    }
}

function handleEraser(pos) {
    // Eraser Logic
    brush.x = pos.x;
    brush.y = pos.y;

    // Scan all curves (or maybe just check local area for performance if many curves)
    // Check terminal points
    eraserFull = false;

    const eSize = state.eraserSize || 10;
    const r = eSize / viewState.scale;
    
    // Find candidates
    let hoverAny = false;
    
    // Loop backwards to remove safely
    for (let i = curves.length - 1; i >= 0; i--) {
        const pts = curves[i].points;
        if (pts.length === 0) continue;
        
        const start = pts[0];
        const end = pts[pts.length - 1];
        
        // Should be in logical coords
        const dStart = Math.hypot(pos.x - start.x, pos.y - start.y);
        const dEnd = Math.hypot(pos.x - end.x, pos.y - end.y);
        
        const hitStart = dStart <= r;
        const hitEnd = dEnd <= r;
        
        if (hitStart || hitEnd) {
            hoverAny = true;
            if (state.isDrawing) {
                if (hitStart) curves[i].points.shift();
                
                // While loop (remove from start)
                while(curves[i].points.length > 0) {
                    const s = curves[i].points[0];
                    if (Math.hypot(pos.x - s.x, pos.y - s.y) <= r) {
                        curves[i].points.shift();
                    } else {
                        break; 
                    }
                }
                
                // Remove from end
                while(curves[i].points.length > 0) {
                    const e = curves[i].points[curves[i].points.length - 1];
                        if (Math.hypot(pos.x - e.x, pos.y - e.y) <= r) {
                        curves[i].points.pop();
                    } else {
                        break; 
                    }
                }

                // If empty, remove curve
                if (curves[i].points.length < 2) {
                    curves.splice(i, 1);
                    selectedIndex = -1; // Deselect if we deleted selection
                    updateUIState();
                }
                redraw();
                saveState(); // Heavy saving? Maybe debounce?
            }
        }
    }
    
    eraserFull = hoverAny;
    updateBrushVisuals();
}

function handleMouseDown(e) {
    if (e.ctrlKey) {
        isCtrlPanning = true;
        lastMouseView = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
    }

    if (e.button !== 0) return;
    const pos = getCanvasCoords(e);

    if (state.mode === 'select') {
        const hitData = hitTestImage(pos.x, pos.y);
        if (hitData) {
             selectedImageId = hitData.img.id;
             selectedIndex = -1; // Deselect curve if image is selected
             dragLastPos = pos;
             if (hitData.type === 'resize') {
                 resizeHandle = 'se';
             } else {
                 isDraggingImage = true;
             }
             renderRefUI();
             redraw();
             return;
        }
        
        if (hitTestCurveHandle(pos.x, pos.y)) {
             resizeCurveMode = true;
             curveStartBounds = getCurveBounds(selectedIndex);
             curveStartPoints = curves[selectedIndex].points.map(p => ({x: p.x, y: p.y}));
             return;
        }

        const hitIdx = findHitCurve(pos.x, pos.y);
        if (hitIdx !== -1) {
             selectedIndex = hitIdx;
             isDragging = true;
             dragLastPos = pos;
             selectedImageId = null;
             renderRefUI();
             redraw();
             updateUIState();
             return;
        }
        
        // Pan if nothing hit (and Deselect)
        selectedIndex = -1;
        selectedImageId = null;
        updateUIState();
        renderRefUI();
        redraw();

        isCtrlPanning = true;
        lastMouseView = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    // Draw Mode: Check if inside paper
    if (pos.x >= 0 && pos.x <= state.width && pos.y >= 0 && pos.y <= state.height) {
        state.isDrawing = true;
        currentPoints = [];
        
        if (state.mode === 'erase') {
             // Eraser Logic handled in Move, but we need to trigger it here too (for clicks)
             handleMove(e);
             return;
        }
        
        isExtending = !!snapState;

        // If snapped, start exactly at snap point
        if (snapState) {
            extensionType = snapState.type; // Persist type as snapState is cleared on move
            brush.x = snapState.x;
            brush.y = snapState.y;
            pointer.x = snapState.x;
            pointer.y = snapState.y;
        } else {
             extensionType = null;
             brush.x = pos.x;
             brush.y = pos.y;
             pointer.x = pos.x;
             pointer.y = pos.y;
             
             // If not snapping, clear selection to start new? 
             // "if the user starts drawing from this points... concatenated" implies
             // if user DOES NOT start from points, it is NOT concatenated.
             // Implies new drawing.
             selectedIndex = -1;
             updateUIState();
        }

        addPoint(brush.x, brush.y);
    }
}

function handleMouseUp() {
    if (isCtrlPanning) {
        isCtrlPanning = false;
        canvas.style.cursor = 'default';
        return;
    }

    if (isDraggingImage || resizeHandle || resizeCurveMode) {
        isDraggingImage = false;
        resizeHandle = null;
        resizeCurveMode = false;
        return;
    }

    if (isDragging) {
        isDragging = false;
        return;
    }

    if (state.mode === 'select') return;
    if (!state.isDrawing) return;
    // Save and cleanup
    state.isDrawing = false;
    
    if (state.mode === 'erase') return;
    
    // For extensions, we accept even small additions (length > 0)
    // For new curves, we want at least a few points to avoid noise (length > 2)
    const minPoints = isExtending ? 0 : 2;

    if (currentPoints.length > minPoints) {
        // Add final point
        addPoint(brush.x, brush.y); 

        if (isExtending && selectedIndex !== -1) {
            // Concatenate
            if (extensionType === 'end') {
                 // Append
                 curves[selectedIndex].points.push(...currentPoints);
            } else {
                 // Prepend (Start)
                 const newPts = [...currentPoints].reverse(); 
                 curves[selectedIndex].points.unshift(...newPts);
            }
        } else {
            // New Curve
            curves.push({
                points: [...currentPoints],
                brushSize: state.brushSize
            });
            selectedIndex = curves.length - 1;
        }
    }
    
    // Setup ignoreSnap to preventing sticky brush
    if (isExtending || currentPoints.length > minPoints) {
        lastDrawPos = { x: brush.x, y: brush.y };
        ignoreSnap = true;
    }

    currentPoints = [];
    isExtending = false;
    extensionType = null;
    snapState = null;
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
    if (!canvas) return;

    if (state.mode === 'draw' || state.mode === 'erase') {
        // Ensure elements are visible
        if (brushPoint) brushPoint.style.display = 'block';
        if (helper) helper.style.display = 'block';
        if (mouseTarget) mouseTarget.style.display = 'block';

        // Visual = Logical * Scale + Pan
        const cx = canvas.offsetLeft + viewState.x + brush.x * viewState.scale;
        const cy = canvas.offsetTop + viewState.y + brush.y * viewState.scale;

        // Ensure eraserSize exists (fallback if state load issue)
        const eSize = state.eraserSize || 10;
        const radius = state.mode === 'erase' ? eSize : state.radius;
        const visualRadius = radius * viewState.scale;

        if (brushPoint) {
            brushPoint.style.display = state.mode === 'erase' ? 'none' : 'block';
            brushPoint.style.left = cx + 'px';
            brushPoint.style.top = cy + 'px';
        }

        if (helper) {
            helper.style.width = (visualRadius * 2) + 'px';
            helper.style.height = (visualRadius * 2) + 'px';
            helper.style.left = cx + 'px';
            helper.style.top = cy + 'px';

            if (state.mode === 'erase') {
                // Eraser Style
                helper.style.backgroundColor = eraserFull ? 'rgba(20, 132, 230, 0.4)' : 'rgba(20, 132, 230, 0.1)';
                helper.style.borderColor = eraserFull ? 'rgba(20, 132, 230, 1.0)' : 'rgba(20, 132, 230, 0.4)';
                if (brushPoint) brushPoint.style.backgroundColor = eraserFull ? '#1484e6' : 'var(--color-accent)';
            } else {
                // Draw Style
                helper.style.backgroundColor = 'rgba(20, 132, 230, 0.1)';
                helper.style.borderColor = 'rgba(20, 132, 230, 0.8)';
                if (brushPoint) brushPoint.style.backgroundColor = 'var(--color-accent)';
            }
        }

    } else {
        if (brushPoint) brushPoint.style.display = 'none';
        if (helper) helper.style.display = 'none';
        if (mouseTarget) mouseTarget.style.display = 'none';
    }
}

function drawCurve(pts, isSelected, size) {
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }

    // Connect start/end for unselected curves (to visualize periodicity)
    if (!isSelected && pts.length > 2) {
        ctx.closePath();
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

    // Draw Reference Images
    referenceImages.forEach(img => {
        if (!img.img.complete) return;
        ctx.save();
        ctx.globalAlpha = img.opacity;
        ctx.drawImage(img.img, img.x, img.y, img.width, img.height);
        
        // Draw Selection Box if selected
        if (img.id === selectedImageId) {
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#1484e6';
            ctx.lineWidth = 2 / s;
            ctx.strokeRect(img.x, img.y, img.width, img.height);
            
            // Draw Resize Handle (bottom-right)
            const handleSize = 10 / s;
            ctx.fillStyle = '#1484e6';
            ctx.fillRect(img.x + img.width - handleSize, img.y + img.height - handleSize, handleSize, handleSize);
        }
        ctx.restore();
    });
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
        ctx.strokeStyle = '#c7c7c7ff';
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

    // Draw Curve Handle (Select Mode)
    if (selectedIndex !== -1 && state.mode === 'select') {
        const bounds = getCurveBounds(selectedIndex);
        if (bounds) {
             ctx.save();
             ctx.strokeStyle = '#1484e6';
             ctx.lineWidth = 1/s;
             ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
             const handleSize = 10 / s;
             ctx.fillStyle = '#1484e6';
             ctx.fillRect(bounds.x + bounds.w - handleSize, bounds.y + bounds.h - handleSize, handleSize, handleSize);
             ctx.restore();
        }
    }

    // Draw Endpoints and Dashed Connection (Any Mode, if selected)
    // Especially useful in Draw mode for snapping
    
    // Logic: Identify which curves to show endpoints for.
    // If Select Mode or Draw Mode: Show for selectedIndex.
    // If Eraser Mode: Show for ALL curves (to visualize what can be erased).
    
    const curvesToShow = [];
    if (state.mode === 'erase') {
        curves.forEach((c, i) => curvesToShow.push({ curve: c, selected: false }));
    } else if (selectedIndex !== -1 && curves[selectedIndex]) {
        curvesToShow.push({ curve: curves[selectedIndex], selected: true });
    }

    curvesToShow.forEach(item => {
        const c = item.curve;
        const pts = c.points;
        const s = viewState.scale;
        
        if (pts.length > 0) {
            const start = pts[0];
            const end = pts[pts.length - 1];

            // Only draw dashed connection if selected? User asked for "white dots".
            // Let's draw everything for consistency, or just dots? 
            // "display the white dots for start/end points for each drawing"
            // I'll draw the markers (Circle) which contains the white dot.
            
            if (item.selected) {
                // Dashed Line (Only for selected)
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([5 / s, 5 / s]);
                ctx.strokeStyle = '#1484e6'; // Accent
                ctx.lineWidth = 1 / s;
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                ctx.restore();
            }

            // Blue Markers (Start/End)
            // For eraser, maybe red? or just blue to indicate "active points"
            const r = 4 / s;
            // Start
            ctx.fillStyle = state.mode === 'erase' ? 'black' : '#1484e6';
            
            // Start
            ctx.beginPath();
            ctx.arc(start.x, start.y, r, 0, Math.PI * 2);
            ctx.fill();

            // End
            ctx.beginPath();
            ctx.arc(end.x, end.y, r, 0, Math.PI * 2);
            ctx.fill();

            // White Dots
            const curveSize = c.brushSize || state.brushSize;
            const wR = (curveSize * 0.375); // Logical radius
            
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(start.x, start.y, wR, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(end.x, end.y, wR, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.restore(); // End Clip
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

    document.getElementById('x-output').value = `[${xArr.join(', ')}]`;
    document.getElementById('y-output').value = `[${yArr.join(', ')}]`;
    
    // Clear warning if present
    const warn = document.getElementById('coord-warning');
    if (warn) warn.style.display = 'none';
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

// -- Reference Images Logic --
document.getElementById('ref-image-input').onchange = (e) => {
    if (e.target.files) {
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    const aspect = img.height / img.width;
                    const w = 200;
                    const h = w * aspect;
                    referenceImages.push({
                        id: Date.now() + Math.random(),
                        img: img,
                        name: file.name,
                        x: (state.width - w) / 2, 
                        y: (state.height - h) / 2,
                        width: w,
                        height: h,
                        opacity: 0.3
                    });
                    renderRefUI();
                    redraw();
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    e.target.value = ''; 
};




function renderRefUI() {
    const list = document.getElementById('ref-images-list');
    list.innerHTML = '';
    referenceImages.forEach(img => {
        const item = document.createElement('div');
        item.className = 'ref-image-item';
        // Styled ref card
        const isSelected = img.id === selectedImageId;
        item.style.cssText = `
            display: flex; gap: 8px; align-items: center;
            background: #fff; padding: 6px; border-radius: 6px;
            border: ${isSelected ? '2px solid var(--color-accent)' : '1px solid #eee'};
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            font-size: 0.8rem;
        `;
        
        // Preview Canvas
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 40;
        previewCanvas.height = 40;
        previewCanvas.style.cssText = "width: 40px; height: 40px; border-radius: 4px; background: #f0f0f0; object-fit: cover; flex-shrink: 0;";
        const pctx = previewCanvas.getContext('2d');
        if (img.img.complete && img.img.width > 0) {
            // Cover Logic
            const sw = img.img.width;
            const sh = img.img.height;
            const asp = sw / sh;
            let sx=0, sy=0, sSize=0;
            
            pctx.filter = 'grayscale(100%)';
            if (asp > 1) {
                // Landscape: Crop sides. Source square is size 'sh'.
                sSize = sh;
                sx = (sw - sh) / 2;
                pctx.drawImage(img.img, sx, 0, sSize, sSize, 0, 0, 40, 40);
            } else {
                // Portrait: Crop top/bottom. Source square is size 'sw'.
                sSize = sw;
                sy = (sh - sw) / 2;
                pctx.drawImage(img.img, 0, sy, sSize, sSize, 0, 0, 40, 40);
            }
            pctx.filter = 'none';

            // Tint with Accent Color
            pctx.globalCompositeOperation = 'color'; 
            pctx.fillStyle = '#1484e6';
            pctx.fillRect(0, 0, 40, 40);
        }

        const info = document.createElement('div');
        info.style.flex = "1";
        
        // Name Input Style
        // "use the same font (space mono)... ref image name dark grey, make it accent color when hovering"
        const nameInputStyle = `
            border: none; background: transparent; 
            font-family: 'Space Mono', monospace; 
            font-weight: 600; 
            width: 100%; outline: none; margin-bottom: 2px;
            color: var(--color-text-main);
            transition: color 0.2s;
            cursor: text;
        `;
        
        const nameId = `ref-name-${img.id}`;
        
        info.innerHTML = `
            <input type="text" id="${nameId}" value="${img.name}" 
                onchange="updateRefName(${img.id}, this.value)" 
                style="${nameInputStyle}">
            <div style="display: flex; align-items: center; gap: 4px;">
                 <span style="font-size: 11px; color: #888;">Opacity</span>
                 <input type="range" min="0" max="1" step="0.05" value="${img.opacity}" 
                     oninput="updateRefOpacity(${img.id}, this.value)" style="flex: 1; height: 3px;">
            </div>
        `;
        
        // Add hover effect via JS since inline styles are hard for pseudo-classes
        setTimeout(() => {
            const inp = document.getElementById(nameId);
            if(inp) {
                inp.onmouseenter = () => inp.style.color = 'var(--color-accent)';
                inp.onmouseleave = () => inp.style.color = 'var(--color-text-main)';
            }
        }, 0);

        const delBtn = document.createElement('div');
        delBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">close</span>';
        delBtn.style.cssText = "cursor: pointer; color: #999; display: flex; align-items: center; padding: 4px;";
        delBtn.onclick = (e) => { e.stopPropagation(); deleteRefImage(img.id); };

        item.appendChild(previewCanvas);
        item.appendChild(info);
        item.appendChild(delBtn);
        
        // Click to select
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                selectedImageId = img.id;
                renderRefUI();
                redraw();
            }
        });

        list.appendChild(item);
    });
}

window.updateRefName = (id, val) => {
    const img = referenceImages.find(i => i.id === id);
    if (img) img.name = val;
};

window.updateRefOpacity = (id, val) => {
    const img = referenceImages.find(i => i.id === id);
    if (img) {
        img.opacity = parseFloat(val);
        redraw();
    }
};

window.deleteRefImage = (id) => {
    referenceImages = referenceImages.filter(i => i.id !== id);
    if (selectedImageId === id) selectedImageId = null;
    renderRefUI();
    redraw();
    saveState();
};

function hitTestImage(x, y) {
    // Reverse order to hit top-most
    for (let i = referenceImages.length - 1; i >= 0; i--) {
        const img = referenceImages[i];
        // Check handle first
        if (selectedImageId === img.id) {
             // Handle is at bottom right 10x10
             // transformed coordinates? 
             // We are working with logical coordinates here (passed from handleMouseDown -> getCanvasCoords)
             // But draw size depends on Scale? 
             // "const handleSize = 10 / s;" in draw loop.
             // We need 's' here to check handle hit accurately. 
             // Or we just check approximate.
             // Let's assume handle is logical size 10 (scaled visually).
             // Actually, drawn size is fixed 10px screen size, so logical size is 10/s.
             
             const s = viewState.scale;
             const handleSize = 10 / s;
             if (x >= img.x + img.width - handleSize && x <= img.x + img.width &&
                 y >= img.y + img.height - handleSize && y <= img.y + img.height) {
                 return { img, type: 'resize' };
             }
        }
        
        if (x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height) {
            return { img, type: 'move' };
        }
    }
    return null;
}

updateHelperSize();
// Shortcuts
document.addEventListener('keydown', (e) => {
    // Block shortcuts only for text-editing inputs
    // Global Shortcuts (work even in inputs)
    if (e.ctrlKey && e.key === 'Enter') {
        initCanvas();
        return;
    }

    // Block shortcuts only for text-editing inputs
    const tag = e.target.tagName;
    const type = e.target.type;
    const isTextInput = tag === 'TEXTAREA' || (tag === 'INPUT' && (type === 'text' || type === 'number' || type === 'password' || type === 'email'));
    
    if (isTextInput) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedImageId) deleteRefImage(selectedImageId);
        else if (selectedIndex !== -1) deleteSelected();
    }
    if (e.key === 'd') setMode('draw');
    if (e.key === 's') setMode('select');
    if (e.key === 'e') setMode('erase');
});

// Setup Collapsibles
// Setup Collapsibles
function setupCollapsibles() {
    if (!state.collapsedSections) state.collapsedSections = {};

    document.querySelectorAll('.section-header-collapsible').forEach(header => {
        const content = header.nextElementSibling;
        const icon = header.querySelector('.dropdown-icon');
        const titleEl = header.querySelector('.section-title');
        const title = titleEl ? titleEl.innerText.trim() : null;
        
        // Initial State
        if (content && icon && title) {
            const isCollapsed = state.collapsedSections[title] === true;
            
            content.style.display = isCollapsed ? 'none' : 'block';
            icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
            icon.style.transition = 'transform 0.2s';
        }

        header.onclick = () => {
            if (content && title) {
                const isHidden = content.style.display === 'none';
                
                if (isHidden) {
                    content.style.display = 'block';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                    state.collapsedSections[title] = false;
                } else {
                    content.style.display = 'none';
                    if (icon) icon.style.transform = 'rotate(-90deg)';
                    state.collapsedSections[title] = true;
                }
                saveState();
            }
        }
    });
}
// Call after DOM load is not needed since script is defer or at end? 
// Script is at end of body.
setTimeout(setupCollapsibles, 100);

// Export/Import
window.exportData = () => {
   const exportSelected = document.getElementById('export-selected-only')?.checked;
   
   let curvesToExport = curves;
   if (exportSelected && selectedIndex !== -1) {
       curvesToExport = [curves[selectedIndex]];
   } else if (exportSelected && selectedIndex === -1) {
       // Option checked but nothing selected -> Warn or Export None? 
       // User intention "only selected".
       alert("No drawing selected to export.");
       return;
   }

   const data = { 
       state: { ...state, width: state.width, height: state.height }, 
       curves: curvesToExport,
   }; 
   const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = 'drawxy_export.json';
   a.click();
};

window.importData = (input) => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.state) {
                 // Update dimensions if present
                 if(data.state.width) document.getElementById('width-input').value = data.state.width;
                 if(data.state.height) document.getElementById('height-input').value = data.state.height;
                 
                 // We might want to trigger 'Update Canvas' or just set state
                 state = { ...state, ...data.state };
                 
                 // Update basic UI that depends on state
                 document.getElementById('radius-slider').value = state.radius;
                 document.getElementById('brush-size-slider').value = state.brushSize;
                 // force UI updates
                 document.getElementById('radius-slider').oninput({target: {value: state.radius}});
                 document.getElementById('brush-size-slider').oninput({target: {value: state.brushSize}});
                 initCanvas(); // Re-init to apply size? This might clear curves if logic isn't careful.
                 // initCanvas calls redraw().
                 // But initCanvas() implies "Update Canvas" which usually keeps curves if we don't clear them.
                 // Let's modify curves AFTER init.
            }
            if (data.curves) {
                // Append instead of replace
                // Ensure points are valid
                if (Array.isArray(data.curves)) {
                    curves.push(...data.curves);
                }
                // Do not reset selectedIndex, or set to last imported?
                selectedIndex = curves.length - 1; // Select last imported
            }
            redraw();
            updateUIState();
            saveState();
        } catch (err) { console.error(err); alert('Invalid JSON or Parse Error'); }
    };
    reader.readAsText(file);
    input.value = '';
}

window.validateCoordImport = () => {
    const xStr = document.getElementById('import-x').value;
    const yStr = document.getElementById('import-y').value;
    const btn = document.getElementById('add-coords-btn');
    
    let valid = false;
    try {
        const x = JSON.parse(xStr);
        const y = JSON.parse(yStr);
        if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.length > 0) {
            valid = true;
        }
    } catch (e) {}
    
    btn.disabled = !valid;
}


window.validateCoordInput = (type) => {
    // Check both inputs
    const xEl = document.getElementById('x-output');
    const yEl = document.getElementById('y-output');
    const warn = document.getElementById('coord-warning');
    
    // Hide DFT outputs if invalid
    const dftGroup = document.querySelector('#dft-n-slider').closest('.collapsible-content'); 
    // Actually we just hide outputs or show warning?
    // "hide the image and the fourier coefficients"
    // Image? The canvas? Or just the dft output?
    // "fourier coefficients" -> N, R, Phi textareas.
    // "hide the image" -> The drawing on canvas?
    
    let valid = true;
    let newPts = [];
    
    try {
        // Strip var declarations if present (e.g. const x = [...];)
        const cleanX = xEl.value.replace(/^\s*(?:const|let|var)\s+\w+\s*=\s*/, '').replace(/;\s*$/, '');
        const cleanY = yEl.value.replace(/^\s*(?:const|let|var)\s+\w+\s*=\s*/, '').replace(/;\s*$/, '');
        
        const x = JSON.parse(cleanX);
        const y = JSON.parse(cleanY);
        if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.length > 0) {
            newPts = x.map((xv, i) => ({x: xv, y: y[i]}));
            
            // Un-transform if Cartesian
            if (state.cartesian) {
                 const cx = state.width / 2;
                 const cy = state.height / 2;
                 newPts = newPts.map(p => ({
                     x: p.x + cx,
                     y: cy - p.y
                 }));
            }
        } else {
            valid = false;
        }
    } catch (e) { valid = false; }
    
    // Hide DFT and Image if Invalid
    // We can't easily "hide" the drawing without removing it from curves or state.
    // We can set points to empty? No, that loses data.
    // The requirement "hide the image" implies visual feedback.
    // We will rely on warning.
    
    if (!valid) {
        if(warn) warn.style.display = 'block';
    } else {
        if(warn) warn.style.display = 'none';
        if (selectedIndex !== -1) {
            curves[selectedIndex].points = newPts;
            redraw();
            updateDFT();
            saveState();
        }
    }
}



let resizeCurveMode = false;
let curveStartBounds = null;
let curveStartPoints = [];

function getCurveBounds(idx) {
    if (idx < 0 || idx >= curves.length) return null;
    const pts = curves[idx].points;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (pts.length === 0) return null;
    pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function hitTestCurveHandle(x, y) {
    if (selectedIndex === -1) return false;
    const b = getCurveBounds(selectedIndex);
    if (!b) return false;
    const s = viewState.scale;
    const handleSize = 10 / s;
    if (x >= b.x + b.w - handleSize && x <= b.x + b.w &&
        y >= b.y + b.h - handleSize && y <= b.y + b.h) {
        return true;
    }
    return false;
}

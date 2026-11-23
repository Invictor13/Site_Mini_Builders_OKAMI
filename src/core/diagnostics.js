// =========================================================================
// CORE: DIAGNÓSTICO DE FPS, MEMÓRIA GPU/JS E DRAW CALLS
// =========================================================================
(function(MO) {
    let enabled = false;
    let accumTime = 0;
    let accumFrames = 0;
    let accumSteps = 0;

    const snapshot = {
        fps: 0,
        frameTimeMs: 0,
        simStepsPerSec: 0,
        simTime: 0,
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        protectedResources: 0,
        workers: 0,
        jsHeapMB: null
    };

    function sampleRendererAndMemory() {
        const info = MO.renderer && MO.renderer.info ? MO.renderer.info : null;
        if (info && info.render) {
            snapshot.drawCalls = info.render.calls || 0;
            snapshot.triangles = info.render.triangles || 0;
        }
        if (info && info.memory) {
            snapshot.geometries = info.memory.geometries || 0;
            snapshot.textures = info.memory.textures || 0;
        }
        snapshot.programs = (info && Array.isArray(info.programs)) ? info.programs.length : 0;
        snapshot.protectedResources = MO.resources && MO.resources.getProtectedCount
            ? MO.resources.getProtectedCount()
            : 0;
        snapshot.workers = MO.state && Array.isArray(MO.state.workers) ? MO.state.workers.length : 0;
        snapshot.simTime = MO.simClock ? Number(MO.simClock.simTime.toFixed(1)) : 0;

        if (typeof performance !== 'undefined' && performance && performance.memory &&
            typeof performance.memory.usedJSHeapSize === 'number') {
            snapshot.jsHeapMB = Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1));
        } else {
            snapshot.jsHeapMB = null;
        }
    }

    function renderPanel() {
        if (typeof document === 'undefined') return;
        const panel = document.getElementById('diag-panel');
        if (!panel || !enabled) return;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('diag-fps', `${snapshot.fps} FPS (${snapshot.frameTimeMs.toFixed(1)} ms)`);
        setTxt('diag-sim', `${snapshot.simStepsPerSec}/s · NPCs ${snapshot.workers}`);
        setTxt('diag-draw', `${snapshot.drawCalls} calls · ${snapshot.triangles} tris`);
        setTxt('diag-gpu', `Geos ${snapshot.geometries} · Tex ${snapshot.textures}`);
        setTxt('diag-heap', snapshot.jsHeapMB !== null ? `${snapshot.jsHeapMB.toFixed(1)} MB` : 'N/A');
        setTxt('diag-prot', `${snapshot.protectedResources} protegidos`);
    }

    function recordFrame(frameDtSeconds, simSteps = 0) {
        const dt = (typeof frameDtSeconds === 'number' && Number.isFinite(frameDtSeconds) && frameDtSeconds > 0)
            ? frameDtSeconds
            : 0;

        accumTime += dt;
        accumFrames += 1;
        accumSteps += simSteps;

        if (accumTime >= 0.25) {
            snapshot.fps = Math.round(accumFrames / accumTime);
            snapshot.frameTimeMs = (accumTime / accumFrames) * 1000;
            snapshot.simStepsPerSec = Math.round(accumSteps / accumTime);
            accumTime = 0;
            accumFrames = 0;
            accumSteps = 0;
            sampleRendererAndMemory();
            renderPanel();
        }
    }

    function toggle(forceVal) {
        enabled = (typeof forceVal === 'boolean') ? forceVal : !enabled;
        if (typeof document !== 'undefined') {
            const panel = document.getElementById('diag-panel');
            const btn = document.getElementById('btn-diagnostics');
            if (panel) panel.classList.toggle('hidden', !enabled);
            if (btn) btn.classList.toggle('active', enabled);
        }
        if (enabled) {
            sampleRendererAndMemory();
            renderPanel();
        }
        if (MO.showToast && typeof forceVal !== 'boolean') {
            MO.showToast(
                enabled ? '📊 Painel de diagnóstico ativado (Tecla P)' : '📊 Painel de diagnóstico oculto',
                '📊'
            );
        }
        return enabled;
    }

    MO.diagnostics = {
        recordFrame,
        sample: sampleRendererAndMemory,
        toggle,
        isEnabled: () => enabled,
        getSnapshot: () => ({ ...snapshot })
    };
})(window.MO = window.MO || {});

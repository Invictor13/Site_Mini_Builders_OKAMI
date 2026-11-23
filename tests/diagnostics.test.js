const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeElement() {
    const classSet = new Set(['hidden']);
    return {
        textContent: '',
        classList: {
            add: (...c) => c.forEach(x => classSet.add(x)),
            remove: (...c) => c.forEach(x => classSet.delete(x)),
            toggle: (c, force) => {
                const on = force === undefined ? !classSet.has(c) : Boolean(force);
                if (on) classSet.add(c);
                else classSet.delete(c);
                return on;
            },
            contains: (c) => classSet.has(c)
        }
    };
}

function loadDiagnosticsHarness({ withMemory = true } = {}) {
    const elements = new Map([
        ['diag-panel', makeElement()],
        ['btn-diagnostics', makeElement()],
        ['diag-fps', makeElement()],
        ['diag-sim', makeElement()],
        ['diag-draw', makeElement()],
        ['diag-gpu', makeElement()],
        ['diag-heap', makeElement()],
        ['diag-prot', makeElement()]
    ]);
    elements.get('btn-diagnostics').classList.remove('hidden');

    const MO = {
        renderer: {
            info: {
                render: { calls: 42, triangles: 3150 },
                memory: { geometries: 88, textures: 19 },
                programs: [{}, {}, {}]
            }
        },
        resources: { getProtectedCount: () => 31 },
        simClock: { simTime: 12.5 },
        state: { workers: [{}, {}, {}] }
    };

    const windowObj = { MO };
    windowObj.window = windowObj;

    const perf = withMemory
        ? { memory: { usedJSHeapSize: 25 * 1024 * 1024 } }
        : {};

    const sandbox = {
        window: windowObj,
        document: {
            getElementById: (id) => elements.get(id) || null
        },
        performance: perf
    };

    const code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'diagnostics.js'),
        'utf8'
    );
    vm.runInNewContext(code, sandbox);

    return { MO: sandbox.window.MO, elements };
}

test('MO.diagnostics calcula FPS, passos/s e métricas GPU corretamente', () => {
    const { MO, elements } = loadDiagnosticsHarness({ withMemory: true });

    const opened = MO.diagnostics.toggle(true);
    assert.equal(opened, true);
    assert.equal(elements.get('diag-panel').classList.contains('hidden'), false);
    assert.equal(elements.get('btn-diagnostics').classList.contains('active'), true);

    // Simula 18 frames a 60 FPS (0.30s >= janela de 0.25s)
    for (let i = 0; i < 18; i++) {
        MO.diagnostics.recordFrame(1 / 60, 1);
    }

    const snap = MO.diagnostics.getSnapshot();
    assert.equal(snap.fps, 60);
    assert.equal(snap.simStepsPerSec, 60);
    assert.ok(Math.abs(snap.frameTimeMs - (1000 / 60)) < 0.2);
    assert.equal(snap.drawCalls, 42);
    assert.equal(snap.triangles, 3150);
    assert.equal(snap.geometries, 88);
    assert.equal(snap.textures, 19);
    assert.equal(snap.programs, 3);
    assert.equal(snap.protectedResources, 31);
    assert.equal(snap.workers, 3);
    assert.equal(snap.jsHeapMB, 25);

    assert.equal(elements.get('diag-fps').textContent, '60 FPS (16.7 ms)');
    assert.equal(elements.get('diag-draw').textContent, '42 calls · 3150 tris');
    assert.equal(elements.get('diag-gpu').textContent, 'Geos 88 · Tex 19');
    assert.equal(elements.get('diag-heap').textContent, '25.0 MB');
});

test('MO.diagnostics trata ausência de performance.memory e fecha o painel corretamente', () => {
    const { MO, elements } = loadDiagnosticsHarness({ withMemory: false });

    MO.diagnostics.toggle(true);
    for (let i = 0; i < 10; i++) {
        MO.diagnostics.recordFrame(1 / 30, 2);
    }

    const snap = MO.diagnostics.getSnapshot();
    assert.equal(snap.fps, 30);
    assert.equal(snap.simStepsPerSec, 60);
    assert.equal(snap.jsHeapMB, null);
    assert.equal(elements.get('diag-heap').textContent, 'N/A');

    const closed = MO.diagnostics.toggle(false);
    assert.equal(closed, false);
    assert.equal(elements.get('diag-panel').classList.contains('hidden'), true);
    assert.equal(elements.get('btn-diagnostics').classList.contains('active'), false);
});

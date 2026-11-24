const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSimClockModule() {
    const sandbox = { window: { MO: {} } };
    sandbox.window.window = sandbox.window;
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'simClock.js'),
        'utf8'
    );
    vm.runInNewContext(code, sandbox);
    return sandbox.window.MO;
}

function bootFullAppContext() {
    const rootDir = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    const scriptMatches = [...html.matchAll(/<script\s+src="\.\/(src\/[^"]+)"><\/script>/g)].map(m => m[1]);

    class Color {
        constructor(hex = 0xffffff) { this.r = 1; this.g = 1; this.b = 1; this.set(hex); }
        set(v) { return typeof v === 'number' ? this.setHex(v) : (typeof v === 'string' && v.startsWith('#') ? this.setHex(parseInt(v.slice(1), 16)) : this); }
        setHex(h) { this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; }
        copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
        lerp(c, a) { this.r += (c.r - this.r) * a; this.g += (c.g - this.g) * a; this.b += (c.b - this.b) * a; return this; }
    }
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
        subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
        length() { return Math.hypot(this.x, this.y, this.z); }
        distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
        normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
    }
    class Object3D {
        constructor() {
            this.children = []; this.parent = null;
            this.position = new Vector3(); this.rotation = new Vector3(); this.scale = new Vector3(1, 1, 1);
            this.quaternion = { setFromUnitVectors() {} };
            this.visible = true; this.castShadow = false; this.receiveShadow = false; this.userData = {};
        }
        add(...objs) {
            for (const o of objs) {
                if (!o) continue;
                if (o.parent && o.parent !== this) o.parent.remove(o);
                if (!this.children.includes(o)) { this.children.push(o); o.parent = this; }
            }
            return this;
        }
        remove(o) { const i = this.children.indexOf(o); if (i !== -1) { this.children.splice(i, 1); o.parent = null; } return this; }
        traverse(fn) { fn(this); for (const c of this.children.slice()) c.traverse(fn); }
        lookAt() {}
        clone() {
            const c = new this.constructor(this.geometry, this.material);
            c.position.copy(this.position); c.rotation.copy(this.rotation); c.scale.copy(this.scale);
            return c;
        }
    }
    class BufferGeometry {
        constructor() { this.isBufferGeometry = true; this.attributes = {}; this.index = null; }
        setAttribute(n, a) { this.attributes[n] = a; return this; }
        setIndex(i) { this.index = i; return this; }
        computeVertexNormals() {}
        dispose() {}
    }
    class BufferAttribute {
        constructor(arr, size) { this.array = arr; this.itemSize = size; this.count = arr ? Math.floor(arr.length / size) : 0; }
        getX(i) { return this.array[i * this.itemSize]; }
        getY(i) { return this.array[i * this.itemSize + 1]; }
        getZ(i) { return this.array[i * this.itemSize + 2]; }
        setY(i, v) { this.array[i * this.itemSize + 1] = v; }
        setXYZ(i, x, y, z) { const o = i * this.itemSize; this.array[o] = x; this.array[o + 1] = y; this.array[o + 2] = z; }
    }
    class Material {
        constructor(opts = {}) {
            this.isMaterial = true; Object.assign(this, opts);
            if (!(this.color instanceof Color)) this.color = new Color(opts.color ?? 0xffffff);
            if (!(this.emissive instanceof Color)) this.emissive = new Color(opts.emissive ?? 0x000000);
        }
        dispose() {}
    }
    class Mesh extends Object3D {
        constructor(geo = new BufferGeometry(), mat = new Material()) { super(); this.isMesh = true; this.geometry = geo; this.material = mat; }
    }
    class Texture {
        constructor() { this.isTexture = true; this.repeat = { set() {} }; this.offset = { x: 0, y: 0 }; }
        dispose() {}
    }
    function makeEl(tag) {
        const ctx2d = {
            fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
            fillRect() {}, strokeRect() {}, clearRect() {},
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData() {}, createLinearGradient: () => ({ addColorStop() {} }),
            beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, fillText() {}
        };
        const cls = new Set();
        return {
            tagName: tag.toUpperCase(), style: {}, textContent: '', className: '',
            classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), toggle: () => {} },
            dataset: {}, addEventListener() {}, appendChild() {}, querySelectorAll: () => [], getContext: () => ctx2d
        };
    }

    const THREE = {
        Scene: class extends Object3D {}, Group: class extends Object3D {},
        PerspectiveCamera: class extends Object3D { constructor(f, a) { super(); this.fov = f; this.aspect = a; } updateProjectionMatrix() {} },
        WebGLRenderer: class { constructor() { this.domElement = makeEl('canvas'); this.shadowMap = {}; } setSize() {} setPixelRatio() {} render() {} },
        HemisphereLight: class extends Object3D { constructor(s = 0xffffff, g = 0, i = 1) { super(); this.color = new Color(s); this.intensity = i; } },
        DirectionalLight: class extends Object3D { constructor(c = 0xffffff, i = 1) { super(); this.color = new Color(c); this.intensity = i; this.shadow = { mapSize: {}, camera: {} }; } },
        PointLight: class extends Object3D { constructor(c = 0xffffff, i = 1) { super(); this.color = new Color(c); this.intensity = i; } },
        Mesh, LineSegments: class extends Mesh {}, Points: class extends Mesh {},
        Sprite: class extends Object3D { constructor(m = new Material()) { super(); this.isSprite = true; this.geometry = new BufferGeometry(); this.material = m; } },
        BufferGeometry, BoxGeometry: BufferGeometry, CylinderGeometry: BufferGeometry, SphereGeometry: BufferGeometry,
        ConeGeometry: BufferGeometry, DodecahedronGeometry: BufferGeometry, IcosahedronGeometry: BufferGeometry,
        PlaneGeometry: BufferGeometry, RingGeometry: BufferGeometry, TubeGeometry: BufferGeometry, ExtrudeGeometry: BufferGeometry,
        Shape: class { moveTo() {} lineTo() {} closePath() {} }, CatmullRomCurve3: class {},
        BufferAttribute, Float32BufferAttribute: BufferAttribute, CanvasTexture: Texture,
        MeshStandardMaterial: Material, MeshBasicMaterial: Material, LineBasicMaterial: Material, PointsMaterial: Material, SpriteMaterial: Material,
        Color, Vector3, Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
        Raycaster: class { setFromCamera() {} intersectObjects() { return []; } },
        RepeatWrapping: 1000, DoubleSide: 2, PCFSoftShadowMap: 2, ACESFilmicToneMapping: 4
    };

    const byId = new Map();
    const document = {
        body: makeEl('body'),
        hidden: false,
        createElement: makeEl,
        getElementById: (id) => { if (!byId.has(id)) byId.set(id, makeEl('div')); return byId.get(id); },
        querySelectorAll: () => [],
        addEventListener() {}
    };
    const windowObj = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, MO: {} };
    windowObj.window = windowObj;

    // Seed determinístico para comparar exatamente 30 / 60 / 120 FPS
    let rng = 123456789;
    const MathProxy = Object.create(Math);
    MathProxy.random = () => {
        rng = (rng * 1664525 + 1013904223) >>> 0;
        return rng / 4294967296;
    };

    const ctx = vm.createContext({
        window: windowObj, document, THREE, Math: MathProxy,
        performance: { now: () => 1000 },
        requestAnimationFrame: () => 0,
        setTimeout, clearTimeout, console
    });

    for (const rel of scriptMatches) {
        vm.runInContext(fs.readFileSync(path.join(rootDir, rel), 'utf8'), ctx, { filename: rel });
    }
    return windowObj.MO;
}

test('MO.simClock executa exatamente 60 passos por segundo em 30, 60 e 120 FPS', () => {
    const MO = loadSimClockModule();

    for (const fps of [30, 60, 120]) {
        const clock = MO.createSimulationClock({ fixedDt: 1 / 60 });
        const frameDt = 1 / fps;
        let ticks = 0;

        for (let f = 0; f < fps; f++) {
            clock.advance(frameDt, () => { ticks++; });
        }

        assert.equal(ticks, 60, `${fps} FPS deve executar exatamente 60 passos em 1 segundo`);
        assert.equal(clock.stepCount, 60);
        assert.equal(clock.simTime, 1.0);
        assert.ok(clock.alpha < 0.01, `alpha residual em ${fps} FPS deve ser ~0 (atual: ${clock.alpha})`);
    }
});

test('MO.simClock interpola alpha corretamente em 120 FPS sem saltos', () => {
    const MO = loadSimClockModule();
    const clock = MO.createSimulationClock({ fixedDt: 1 / 60 });

    const alphas = [];
    const stepsPerFrame = [];
    for (let f = 0; f < 6; f++) {
        const steps = clock.advance(1 / 120);
        stepsPerFrame.push(steps);
        alphas.push(Number(clock.alpha.toFixed(3)));
    }

    assert.deepEqual(stepsPerFrame, [0, 1, 0, 1, 0, 1]);
    assert.deepEqual(alphas, [0.5, 0, 0.5, 0, 0.5, 0]);
});

test('MO.simClock limita acumulador e evita saltos após pausas prolongadas (aba em segundo plano)', () => {
    const MO = loadSimClockModule();
    const clock = MO.createSimulationClock({
        fixedDt: 1 / 60,
        maxFrameDt: 0.1,
        maxStepsPerFrame: 5
    });

    const steps = clock.advance(30.0); // 30 segundos em segundo plano
    assert.equal(steps, 5, 'Deve limitar passos no frame da retomada');
    assert.ok(clock.simTime <= (5 / 60) + 1e-9);

    // Próximo frame normal de 60 FPS não deve herdar dívida acumulada
    const nextSteps = clock.advance(1 / 60);
    assert.ok(nextSteps <= 2, `Frame seguinte não pode disparar rajada de catch-up (passos: ${nextSteps})`);
});

test('MO.simClock ignora valores inválidos de frameDt e respeita paused/timeScale', () => {
    const MO = loadSimClockModule();
    const clock = MO.createSimulationClock();

    assert.equal(clock.advance(-1), 0);
    assert.equal(clock.advance(NaN), 0);
    assert.equal(clock.advance(Infinity), 0);
    assert.equal(clock.stepCount, 0);

    clock.paused = true;
    assert.equal(clock.advance(1 / 60), 0);
    clock.paused = false;

    clock.timeScale = 2;
    assert.equal(clock.advance(1 / 60), 2);
});

test('simulação completa produz progressão equivalente em 30, 60 e 120 FPS', () => {
    function runSecondsAtFps(fps, seconds) {
        const MO = bootFullAppContext();
        MO.toggleScreensaverMode(true);
        const totalFrames = fps * seconds;
        const dt = 1 / fps;
        for (let i = 0; i < totalFrames; i++) {
            MO.stepFrame(dt);
        }
        return {
            stepCount: MO.simClock.stepCount,
            simTime: MO.simClock.simTime,
            timeOfDay: MO.state.timeOfDay,
            phase: MO.state.phase,
            workerPositions: Array.from(MO.state.workers, w => ({
                x: Number(w.rig.group.position.x.toFixed(4)),
                z: Number(w.rig.group.position.z.toFixed(4)),
                energy: Number(w.energy.toFixed(4)),
                hunger: Number(w.hunger.toFixed(4)),
                hydration: Number(w.hydration.toFixed(4))
            }))
        };
    }

    const r30 = runSecondsAtFps(30, 4);
    const r60 = runSecondsAtFps(60, 4);
    const r120 = runSecondsAtFps(120, 4);

    assert.equal(r30.stepCount, 240);
    assert.equal(r60.stepCount, 240);
    assert.equal(r120.stepCount, 240);

    assert.equal(r30.simTime, 4.0);
    assert.equal(r60.simTime, 4.0);
    assert.equal(r120.simTime, 4.0);

    assert.ok(Math.abs(r30.timeOfDay - r60.timeOfDay) < 1e-12);
    assert.ok(Math.abs(r120.timeOfDay - r60.timeOfDay) < 1e-12);
    assert.equal(r30.phase, r60.phase);
    assert.equal(r120.phase, r60.phase);
    assert.deepEqual(r30.workerPositions, r60.workerPositions);
    assert.deepEqual(r120.workerPositions, r60.workerPositions);
});

test('alternância entre Casa, Ponte, Prédio e Torre e pausa longa mantêm o motor estável no Modo Relax', () => {
    const MO = bootFullAppContext();
    MO.toggleScreensaverMode(true);

    // Pausa longa de 20s simulando aba em segundo plano
    const beforeTod = MO.state.timeOfDay;
    MO.stepFrame(20.0);
    assert.ok(MO.simClock.simTime <= (5 / 60) + 1e-9, 'Pausa longa não pode dar salto na simulação');
    assert.ok(Math.abs(MO.state.timeOfDay - beforeTod) < 0.01, 'Ciclo dia/noite não pode pular após pausa longa');

    const modes = ['house', 'bridge', 'building', 'tower'];
    for (const mode of modes) {
        MO.switchMode(mode);
        assert.equal(MO.state.mode, mode);
        assert.equal(MO.state.workers.length, 5, `Modo ${mode} deve manter 1 Supervisor + 4 Ajudantes no Modo Relax`);
        for (let f = 0; f < 30; f++) {
            MO.stepFrame(1 / 60);
        }
    }

    assert.ok(MO.simClock.stepCount >= 120);
});

test('MO.simClock mantém precisão exata em 1x, 2x e 4x para 30, 60 e 120 FPS sem descarte indevido', () => {
    const MO = loadSimClockModule();
    for (const scale of [1, 2, 4]) {
        for (const fps of [30, 60, 120]) {
            const clock = MO.createSimulationClock();
            clock.timeScale = scale;
            const totalFrames = fps * 2; // 2 segundos de parede
            const frameDt = 1 / fps;
            for (let i = 0; i < totalFrames; i++) {
                clock.advance(frameDt);
            }
            const expectedSimTime = 2.0 * scale;
            assert.ok(
                Math.abs(clock.simTime - expectedSimTime) <= (1 / 60) + 1e-6,
                `scale=${scale}x fps=${fps} deveria atingir ~${expectedSimTime}s (obtido: ${clock.simTime}s)`
            );
            assert.equal(clock.stepCount, 120 * scale);
        }
    }
});

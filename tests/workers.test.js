const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootApp() {
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
        body: makeEl('body'), hidden: false, createElement: makeEl,
        getElementById: (id) => { if (!byId.has(id)) byId.set(id, makeEl('div')); return byId.get(id); },
        querySelectorAll: () => [], addEventListener() {}
    };
    const windowObj = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, MO: {} };
    windowObj.window = windowObj;

    const ctx = vm.createContext({
        window: windowObj, document, THREE,
        performance: { now: () => 1000 }, requestAnimationFrame: () => 0,
        setTimeout, clearTimeout, console
    });
    for (const rel of scriptMatches) {
        vm.runInContext(fs.readFileSync(path.join(rootDir, rel), 'utf8'), ctx, { filename: rel });
    }
    return windowObj.MO;
}

test('módulos de NPC expõem API completa e aplicam limite de 1 Supervisor e até 10 Ajudantes', () => {
    const MO = bootApp();

    assert.ok(MO.workerFactory);
    assert.ok(MO.workerNeeds);
    assert.ok(MO.workerTasks);
    assert.ok(MO.workerAgent);

    const sup1 = MO.hireSupervisor();
    const sup2 = MO.hireSupervisor();
    assert.ok(sup1);
    assert.equal(sup1.role, 'supervisor');
    assert.equal(sup2, null, 'Não deve permitir mais de 1 Supervisor por mapa');

    for (let i = 0; i < 10; i++) {
        const h = MO.hireHelper();
        assert.ok(h, `Ajudante ${i + 1} deve ser contratado`);
        assert.notEqual(h.role, 'supervisor');
    }
    const extraHelper = MO.hireHelper();
    assert.equal(extraHelper, null, 'Não deve permitir mais de 10 Ajudantes');

    const counts = MO.workerFactory.getNpcCounts();
    assert.equal(counts.supervisors, 1);
    assert.equal(counts.helpers, 10);
    assert.equal(counts.total, 11);
    assert.equal(MO.state.workers.length, 11);
});

test('workerFactory suporta contratar mais de 3 NPCs configuráveis com novos papéis', () => {
    const MO = bootApp();

    for (let i = 0; i < 8; i++) {
        const w = MO.workerFactory.hireWorker({
            maxWorkers: 10,
            silent: true,
            profile: { name: `Morador ${i + 1}`, role: i % 2 === 0 ? 'carpenter' : 'farmer', speed: 2.5 + i * 0.05 }
        });
        assert.ok(w);
        assert.equal(w.id, i);
    }

    assert.equal(MO.state.workers.length, 8);
    assert.equal(MO.state.workers[7].name, 'Morador 8');
    assert.equal(MO.state.workers[7].role, 'farmer');

    for (let f = 0; f < 30; f++) {
        MO.stepFrame(1 / 60);
    }
    assert.equal(MO.state.workers.length, 8);
    assert.ok(MO.state.workers.every(w => Number.isFinite(w.rig.group.position.x)));
});

test('workerNeeds gerencia drenagem, sono noturno e despertar matinal sem regressão', () => {
    const MO = bootApp();
    const w = MO.workerFactory.hireWorker({ silent: true });

    MO.state.isNight = true;
    MO.state.camp.nightMode = 'sleep';
    MO.state.camp.floodlights.forEach(fl => { fl.built = true; });
    MO.state.camp.tents[0].built = true;

    const assigned = MO.workerNeeds.assignCampOrLifeTask(
        w, MO.workerTasks.setDestination, MO.workerFactory.setWorkerTool, 1.0, false
    );
    assert.equal(assigned, true);
    assert.equal(w.task.type, 'sleep-tent');
    assert.equal(MO.state.camp.tents[0].reserved, w.id);

    w.sleepingInside = true;
    w.energy = 20;
    MO.workerNeeds.updateNeeds(w, 2.0, true, false);
    assert.equal(w.energy, 43);

    MO.state.isNight = false;
    const woke = MO.workerNeeds.shouldWakeFromSleep(w, MO.state);
    assert.equal(woke, true);
    assert.equal(w.sleepingInside, false);
    assert.equal(w.task, null);
    assert.equal(MO.state.camp.tents[0].reserved, false);
});

test('workerTasks.releaseTaskReservations libera todos os recursos reservados', () => {
    const MO = bootApp();
    const col = { res: true };
    const slot = { res: true };
    const wall = { res: true, mepBusy: true };
    const brick = { placed: false, res: true };
    MO.state.roofWorkerBusy = true;

    MO.workerTasks.releaseTaskReservations({
        type: 'roof-stage',
        col,
        slot,
        wall,
        pickedBrick: brick
    });

    assert.equal(col.res, false);
    assert.equal(slot.res, false);
    assert.equal(wall.res, false);
    assert.equal(wall.mepBusy, false);
    assert.equal(brick.res, false);
    assert.equal(MO.state.roofWorkerBusy, false);
});

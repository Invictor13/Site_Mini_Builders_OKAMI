const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createThreeAndDomHarness() {
    const tracker = {
        createdGeos: 0,
        disposedGeos: 0,
        liveGeos: new Set(),
        createdMats: 0,
        disposedMats: 0,
        liveMats: new Set(),
        createdTexs: 0,
        disposedTexs: 0,
        liveTexs: new Set(),
        doubleDisposes: []
    };

    class BaseDisposable {
        constructor(kind, set, counterKey, disposeKey) {
            this._kind = kind;
            this._set = set;
            this._disposeKey = disposeKey;
            this._disposed = false;
            tracker[counterKey]++;
            set.add(this);
        }
        dispose() {
            if (this._disposed) {
                tracker.doubleDisposes.push(this._kind);
                return;
            }
            this._disposed = true;
            tracker[this._disposeKey]++;
            this._set.delete(this);
        }
    }

    class BufferGeometry extends BaseDisposable {
        constructor() {
            super('geometry', tracker.liveGeos, 'createdGeos', 'disposedGeos');
            this.isBufferGeometry = true;
            this.attributes = {};
            this.index = null;
        }
        setAttribute(name, attr) { this.attributes[name] = attr; return this; }
        setIndex(idx) { this.index = idx; return this; }
        computeVertexNormals() {}
        clone() { return new BufferGeometry(); }
    }

    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
            this.count = array ? Math.floor(array.length / itemSize) : 0;
            this.needsUpdate = false;
        }
        getX(i) { return this.array[i * this.itemSize]; }
        getY(i) { return this.array[i * this.itemSize + 1]; }
        getZ(i) { return this.array[i * this.itemSize + 2]; }
        setY(i, v) { this.array[i * this.itemSize + 1] = v; }
        setXYZ(i, x, y, z) {
            const o = i * this.itemSize;
            this.array[o] = x; this.array[o + 1] = y; this.array[o + 2] = z;
        }
    }

    class Texture extends BaseDisposable {
        constructor(canvas) {
            super('texture', tracker.liveTexs, 'createdTexs', 'disposedTexs');
            this.isTexture = true;
            this.image = canvas;
            this.wrapS = 0; this.wrapT = 0;
            this.repeat = { set() {} };
            this.offset = { x: 0, y: 0 };
            this.needsUpdate = false;
        }
    }

    class Color {
        constructor(hex = 0xffffff) {
            this.r = 1; this.g = 1; this.b = 1;
            this.set(hex);
        }
        set(val) {
            if (typeof val === 'number') return this.setHex(val);
            if (typeof val === 'string' && val.startsWith('#')) {
                return this.setHex(parseInt(val.slice(1), 16));
            }
            return this;
        }
        setHex(hex) {
            this.r = ((hex >> 16) & 255) / 255;
            this.g = ((hex >> 8) & 255) / 255;
            this.b = (hex & 255) / 255;
            return this;
        }
        copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
        lerp(c, a) {
            this.r += (c.r - this.r) * a;
            this.g += (c.g - this.g) * a;
            this.b += (c.b - this.b) * a;
            return this;
        }
    }

    class Material extends BaseDisposable {
        constructor(opts = {}) {
            super('material', tracker.liveMats, 'createdMats', 'disposedMats');
            this.isMaterial = true;
            Object.assign(this, opts);
            if (!(this.color instanceof Color)) this.color = new Color(opts.color ?? 0xffffff);
            if (!(this.emissive instanceof Color)) this.emissive = new Color(opts.emissive ?? 0x000000);
        }
        clone() { return new Material({ ...this }); }
    }

    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
        addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
        distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
        subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
        length() { return Math.hypot(this.x, this.y, this.z); }
        normalize() {
            const l = this.length() || 1;
            this.x /= l; this.y /= l; this.z /= l;
            return this;
        }
        clone() { return new Vector3(this.x, this.y, this.z); }
        setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
    }

    class Object3D {
        constructor() {
            this.children = [];
            this.parent = null;
            this.position = new Vector3();
            this.rotation = new Vector3();
            this.scale = new Vector3(1, 1, 1);
            this.quaternion = { setFromUnitVectors() {} };
            this.visible = true;
            this.castShadow = false;
            this.receiveShadow = false;
            this.userData = {};
        }
        add(...objs) {
            for (const o of objs) {
                if (!o) continue;
                if (o.parent && o.parent !== this) o.parent.remove(o);
                if (!this.children.includes(o)) {
                    this.children.push(o);
                    o.parent = this;
                }
            }
            return this;
        }
        remove(o) {
            const i = this.children.indexOf(o);
            if (i !== -1) {
                this.children.splice(i, 1);
                o.parent = null;
            }
            return this;
        }
        traverse(fn) {
            fn(this);
            for (const c of this.children.slice()) {
                c.traverse(fn);
            }
        }
        lookAt() {}
        clone() {
            const c = new this.constructor(this.geometry, this.material);
            c.position.copy(this.position);
            c.rotation.copy(this.rotation);
            c.scale.copy(this.scale);
            return c;
        }
    }

    class Mesh extends Object3D {
        constructor(geometry = new BufferGeometry(), material = new Material()) {
            super();
            this.isMesh = true;
            this.geometry = geometry;
            this.material = material;
        }
    }

    const SPRITE_SHARED_GEO = new BufferGeometry();
    class Sprite extends Object3D {
        constructor(material = new Material()) {
            super();
            this.isSprite = true;
            this.geometry = SPRITE_SHARED_GEO;
            this.material = material;
        }
    }

    const THREE = {
        Scene: class extends Object3D {},
        Group: class extends Object3D {},
        PerspectiveCamera: class extends Object3D {
            constructor(fov, aspect) {
                super();
                this.fov = fov; this.aspect = aspect;
            }
            updateProjectionMatrix() {}
        },
        WebGLRenderer: class {
            constructor() {
                this.domElement = makeFakeElement('canvas');
                this.shadowMap = {};
            }
            setSize() {}
            setPixelRatio() {}
            render() {}
        },
        HemisphereLight: class extends Object3D {
            constructor(sky = 0xffffff, ground = 0x000000, intensity = 1) {
                super();
                this.color = new Color(sky);
                this.groundColor = new Color(ground);
                this.intensity = intensity;
            }
        },
        DirectionalLight: class extends Object3D {
            constructor(color = 0xffffff, intensity = 1) {
                super();
                this.color = new Color(color);
                this.intensity = intensity;
                this.shadow = { mapSize: {}, camera: {} };
            }
        },
        PointLight: class extends Object3D {
            constructor(color = 0xffffff, intensity = 1) {
                super();
                this.color = new Color(color);
                this.intensity = intensity;
            }
        },
        Mesh,
        LineSegments: class extends Mesh {},
        Points: class extends Mesh {},
        Sprite,
        BufferGeometry,
        BoxGeometry: class extends BufferGeometry {},
        CylinderGeometry: class extends BufferGeometry {},
        SphereGeometry: class extends BufferGeometry {},
        ConeGeometry: class extends BufferGeometry {},
        DodecahedronGeometry: class extends BufferGeometry {},
        IcosahedronGeometry: class extends BufferGeometry {},
        PlaneGeometry: class extends BufferGeometry {},
        RingGeometry: class extends BufferGeometry {},
        TubeGeometry: class extends BufferGeometry {},
        ExtrudeGeometry: class extends BufferGeometry {},
        Shape: class { moveTo() {} lineTo() {} closePath() {} },
        CatmullRomCurve3: class {},
        BufferAttribute,
        Float32BufferAttribute: BufferAttribute,
        CanvasTexture: Texture,
        MeshStandardMaterial: Material,
        MeshBasicMaterial: Material,
        LineBasicMaterial: Material,
        PointsMaterial: Material,
        SpriteMaterial: Material,
        Color,
        Vector3,
        Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
        Raycaster: class { setFromCamera() {} intersectObjects() { return []; } },
        RepeatWrapping: 1000,
        DoubleSide: 2,
        PCFSoftShadowMap: 2,
        ACESFilmicToneMapping: 4
    };

    function makeFakeElement(tag) {
        const ctx2d = {
            fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
            fillRect() {}, strokeRect() {}, clearRect() {},
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData() {},
            createLinearGradient: () => ({ addColorStop() {} }),
            beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, fillText() {}
        };
        const classSet = new Set();
        return {
            tagName: tag.toUpperCase(),
            style: {},
            textContent: '',
            className: '',
            classList: {
                add: (...c) => c.forEach(x => classSet.add(x)),
                remove: (...c) => c.forEach(x => classSet.delete(x)),
                toggle: (c, force) => (force === undefined ? (classSet.has(c) ? classSet.delete(c) : classSet.add(c)) : (force ? classSet.add(c) : classSet.delete(c)))
            },
            dataset: {},
            addEventListener() {},
            appendChild() {},
            querySelectorAll: () => [],
            getContext: () => ctx2d
        };
    }

    const elementsById = new Map();
    const document = {
        body: makeFakeElement('body'),
        createElement: (tag) => makeFakeElement(tag),
        getElementById: (id) => {
            if (!elementsById.has(id)) elementsById.set(id, makeFakeElement('div'));
            return elementsById.get(id);
        },
        querySelectorAll: () => []
    };

    const windowObj = {
        innerWidth: 1280,
        innerHeight: 720,
        devicePixelRatio: 1,
        addEventListener() {},
        MO: {}
    };
    windowObj.window = windowObj;

    const sandbox = {
        window: windowObj,
        document,
        THREE,
        performance: { now: () => 1000 },
        requestAnimationFrame: () => 0,
        setTimeout,
        clearTimeout,
        console
    };

    return { sandbox, tracker, SPRITE_SHARED_GEO };
}

test('carrega todos os scripts na ordem do index.html e estabiliza geometrias/materiais/texturas entre regenerações dos 4 modos', () => {
    const rootDir = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    const scriptMatches = [...html.matchAll(/<script\s+src="\.\/(src\/[^"]+)"><\/script>/g)].map(m => m[1]);
    assert.ok(scriptMatches.length >= 20, 'Deve encontrar a cadeia de scripts do index.html');

    const { sandbox, tracker, SPRITE_SHARED_GEO } = createThreeAndDomHarness();
    const ctx = vm.createContext(sandbox);

    for (const relPath of scriptMatches) {
        const code = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
        vm.runInContext(code, ctx, { filename: relPath });
    }

    const MO = sandbox.window.MO;
    assert.ok(MO.resources, 'MO.resources deve estar inicializado');
    assert.ok(MO.resources.getProtectedCount() > 0, 'Recursos compartilhados devem estar protegidos');

    // Simula 20 regenerações alternando entre os 4 modos e verifica que não há crescimento linear
    const modes = ['house', 'bridge', 'building', 'tower'];
    const snapshots = [];

    for (let i = 0; i < 20; i++) {
        const mode = modes[i % modes.length];
        MO.regenerateNewTerrain(mode);
        while (MO.state.workers.length < 3) MO.hireMiniWorker();
        if (i >= 4) {
            snapshots.push({
                geos: tracker.liveGeos.size,
                mats: tracker.liveMats.size,
                texs: tracker.liveTexs.size
            });
        }
    }

    assert.equal(tracker.doubleDisposes.length, 0, 'Não deve ocorrer double dispose em recursos');
    assert.equal(SPRITE_SHARED_GEO._disposed, false, 'Geometria interna de Sprite nunca deve ser descartada');
    Object.values(MO.mats).forEach((mat, idx) => {
        assert.equal(mat._disposed, false, `MO.mats[${idx}] não pode ser descartado`);
        if (mat.map) assert.equal(mat.map._disposed, false, 'Textura de MO.mats não pode ser descartada');
    });

    const maxGeos = Math.max(...snapshots.map(s => s.geos));
    const maxMats = Math.max(...snapshots.map(s => s.mats));
    const maxTexs = Math.max(...snapshots.map(s => s.texs));

    // Compara primeira janela (ciclos 4..7) com última janela (ciclos 16..19): não deve crescer
    const firstWindowMaxGeos = Math.max(...snapshots.slice(0, 4).map(s => s.geos));
    const lastWindowMaxGeos = Math.max(...snapshots.slice(-4).map(s => s.geos));
    const firstWindowMaxMats = Math.max(...snapshots.slice(0, 4).map(s => s.mats));
    const lastWindowMaxMats = Math.max(...snapshots.slice(-4).map(s => s.mats));
    const firstWindowMaxTexs = Math.max(...snapshots.slice(0, 4).map(s => s.texs));
    const lastWindowMaxTexs = Math.max(...snapshots.slice(-4).map(s => s.texs));

    // Prédios variam proceduralmente entre 2 e 4 andares por seed, então comparamos a média de janela
    // e validamos igualdade exata ao retornar ao mesmo modo+seed após todos os ciclos.
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    assert.ok(avg(snapshots.slice(-4).map(s => s.geos)) <= avg(snapshots.slice(0, 4).map(s => s.geos)) + 160,
        `Média de geometrias cresceu: ${firstWindowMaxGeos} -> ${lastWindowMaxGeos}`);
    assert.ok(lastWindowMaxMats <= firstWindowMaxMats + 80, `Materiais cresceram entre janelas: ${firstWindowMaxMats} -> ${lastWindowMaxMats}`);
    assert.equal(lastWindowMaxTexs, firstWindowMaxTexs, `Texturas devem permanecer estáveis: ${firstWindowMaxTexs} -> ${lastWindowMaxTexs}`);

    // Prova determinística de zero vazamento: mesma seed após ciclos completos deve produzir exatamente a mesma contagem
    vm.runInContext('globalThis.__origRandom = Math.random; Math.random = () => 0.42;', ctx);
    for (let k = 0; k < 4; k++) MO.regenerateNewTerrain(modes[k], 'forest');
    MO.regenerateNewTerrain('house', 'forest');
    const baseline = { geos: tracker.liveGeos.size, mats: tracker.liveMats.size, texs: tracker.liveTexs.size };
    for (let k = 0; k < 4; k++) {
        MO.regenerateNewTerrain(modes[k], 'forest');
    }
    MO.regenerateNewTerrain('house', 'forest');
    const afterCycle = { geos: tracker.liveGeos.size, mats: tracker.liveMats.size, texs: tracker.liveTexs.size };
    vm.runInContext('Math.random = globalThis.__origRandom;', ctx);
    assert.deepEqual(afterCycle, baseline, 'Contagem de recursos deve ser idêntica ao retornar à mesma cena');
    assert.ok(tracker.disposedGeos > 500, `Esperava descarte significativo de geometrias ao longo de 20 ciclos (descartadas: ${tracker.disposedGeos}, pico vivo: ${maxGeos})`);
    assert.ok(tracker.disposedMats > 200, `Esperava descarte significativo de materiais ao longo de 20 ciclos (descartados: ${tracker.disposedMats}, pico vivo: ${maxMats})`);
    assert.ok(tracker.disposedTexs >= 100, `Esperava descarte de texturas dinâmicas (badges/sacos de areia) (descartadas: ${tracker.disposedTexs}, pico vivo: ${maxTexs})`);
});

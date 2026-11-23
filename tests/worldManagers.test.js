const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootWorldApp() {
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
        rotateY() { return this; }
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

    const storageMap = new Map();
    const byId = new Map();
    const document = {
        body: makeEl('body'), hidden: false, createElement: makeEl,
        getElementById: (id) => { if (!byId.has(id)) byId.set(id, makeEl('div')); return byId.get(id); },
        querySelectorAll: () => [], addEventListener() {}
    };
    const windowObj = {
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
        localStorage: {
            getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
            setItem: (k, v) => storageMap.set(k, String(v))
        },
        addEventListener() {},
        MO: {}
    };
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

test('RegionManager e WorldManager inicializam vila unificada com 5 lotes por seed e coordenadas', () => {
    const MO = bootWorldApp();

    assert.ok(MO.regionManager);
    assert.ok(MO.constructionManager);
    assert.ok(MO.worldManager);

    const lots = MO.regionManager.getLotsForRegion('main-valley');
    assert.equal(lots.length, 5);
    assert.equal(lots[0].id, 'lot-house-1');
    assert.equal(lots[0].status, 'active');
    assert.equal(lots[1].id, 'lot-west-2');
    assert.equal(lots[2].id, 'lot-bridge');
    assert.equal(lots[3].id, 'lot-east-1');
    assert.equal(lots[4].id, 'lot-tower');

    const worldPt = MO.regionManager.lotToWorld('lot-west-2', 1.5, -0.5);
    const localPt = MO.regionManager.worldToLot('lot-west-2', worldPt.x, worldPt.z);
    assert.ok(Math.abs(localPt.x - 1.5) < 1e-9);
    assert.ok(Math.abs(localPt.z - (-0.5)) < 1e-9);
});

test('archiveAndAdvanceToNextLot preserva casa concluída, registra obstáculos/luzes e avança para o próximo lote', () => {
    const MO = bootWorldApp();

    MO.loadPresetHouse('compact');
    MO.buildFoundation3D();
    MO.state.columns.forEach(c => {
        c.dug = true;
        c.hasRebar = true;
        MO.attachWoodFormworkToColumn(c);
        MO.concreteColumn(c);
    });
    MO.buildInteractiveWalls3D();
    MO.buildFloorGrid3D();
    MO.state.walls.forEach(w => {
        w.slots.forEach(sl => { sl.placed = true; sl.mesh.visible = true; });
        w.hasTopBeam = true;
        w.topBeamMesh.visible = true;
        w.isPlastered = true;
        w.plasterGroup.visible = true;
    });
    MO.state.floorTiles.forEach(ft => { ft.concreted = true; });
    MO.buildRealGableRoofStage();
    MO.buildRealGableRoofStage();

    const prevCompletedCount = MO.constructionManager.getCompletedConstructions().length;
    const { archived, nextLot, nextConstruction } = MO.worldManager.archiveAndAdvanceToNextLot('house');

    assert.equal(archived.status, 'completed');
    assert.equal(archived.lotId, 'lot-house-1');
    assert.ok(MO.groups.archivedConstructions.children.includes(archived.group));
    assert.ok(archived.group.children.length > 0, 'Malhas construídas devem ser preservadas no grupo arquivado');
    assert.equal(MO.groups.walls.children.length, 0, 'Guias e hitboxes da obra antiga devem ser limpos');
    assert.equal(MO.groups.roof.children.length, 0);

    // Próximo lote passa a ativo
    assert.equal(MO.constructionManager.getCompletedConstructions().length, prevCompletedCount + 1);
    assert.ok(nextLot);
    assert.equal(nextLot.id, 'lot-west-2');
    assert.equal(nextLot.status, 'active');
    assert.ok(nextConstruction);
    assert.equal(nextConstruction.lotId, 'lot-west-2');

    // Obstáculos da casa arquivada são expostos para navegação
    const obs = MO.worldManager.getWorldObstacles();
    assert.ok(obs.segments.length > 0, 'Paredes da casa arquivada devem virar obstáculos');
    assert.ok(obs.circles.length > 0, 'Colunas da casa arquivada devem virar obstáculos');
    assert.ok(obs.doorCenters.length > 0, 'Portas da casa arquivada devem ser preservadas');
});

test('WorldManager serializa, salva no storage, restaura estado e limpa arquivados na regeneração', () => {
    const MO = bootWorldApp();

    MO.loadPresetHouse('chalet');
    MO.buildInteractiveWalls3D();
    MO.state.walls.forEach(w => {
        w.slots.forEach(sl => { sl.placed = true; sl.mesh.visible = true; });
    });

    MO.worldManager.archiveAndAdvanceToNextLot('house');
    const savedOk = MO.worldManager.saveToStorage('test_world_key');
    assert.equal(savedOk, true);

    const snapshot = MO.worldManager.serialize();
    assert.equal(snapshot.version, 2);
    assert.equal(snapshot.constructions.constructions.length, 2);
    assert.equal(snapshot.regions.activeLotId, 'lot-west-2');

    // Regenerar terreno deve limpar construções arquivadas e voltar ao lote 1
    MO.regenerateNewTerrain('house');
    assert.equal(MO.groups.archivedConstructions.children.length, 0);
    assert.equal(MO.regionManager.getActiveLot().id, 'lot-house-1');
    assert.equal(MO.constructionManager.getCompletedConstructions().length, 0);

    // Restaurar do storage recupera metadados dos lotes e construções
    const loaded = MO.worldManager.loadFromStorage('test_world_key');
    assert.ok(loaded);
    assert.equal(MO.regionManager.getActiveLot().id, 'lot-west-2');
    assert.equal(MO.constructionManager.getCompletedConstructions().length, 1);
});

test('crescimento contínuo conclui Casa 1, preserva-a e inicia próxima obra no Lote 2 sem regenerar o mundo', () => {
    const MO = bootWorldApp();
    const initialSeed = MO.state.seed;

    MO.hireSupervisor({ silent: true });
    MO.hireHelper({ silent: true });
    MO.hireHelper({ silent: true });

    // Conclui Casa 1 no Lote 1
    MO.loadPresetHouse('compact');
    MO.buildFoundation3D();
    MO.state.columns.forEach(c => {
        c.dug = true; c.hasRebar = true;
        MO.attachWoodFormworkToColumn(c);
        MO.concreteColumn(c);
    });
    MO.buildInteractiveWalls3D();
    MO.buildFloorGrid3D();
    MO.state.walls.forEach(w => {
        if (w.opening) w.hasProp = true;
        w.slots.forEach(sl => { sl.placed = true; sl.mesh.visible = true; });
        w.hasTopBeam = true; w.topBeamMesh.visible = true;
        w.isPlastered = true; w.plasterGroup.visible = true;
        w.isPainted = true;
    });
    MO.state.floorTiles.forEach(ft => { ft.concreted = true; });
    MO.buildRealGableRoofStage();
    MO.buildRealGableRoofStage();

    const advanced = MO.advanceToNextVillageLot();
    assert.equal(advanced, true);

    // Mundo NÃO regenerou: seed e trabalhadores preservados
    assert.equal(MO.state.seed, initialSeed);
    assert.equal(MO.state.workers.length, 3);
    assert.equal(MO.constructionManager.getCompletedConstructions().length, 1);
    assert.equal(MO.groups.archivedConstructions.children.length, 1);
    assert.equal(MO.regionManager.getActiveLot().id, 'lot-west-2');
    assert.equal(MO.state.phase, 0);
    assert.ok(MO.state.weeds.length > 0, 'Lote 2 deve receber mato novo para capinar');

    // Simula restauração persistente após recarregar a página
    const restored = MO.worldManager.restoreSavedWorld();
    assert.equal(restored, true);
    assert.equal(MO.groups.archivedConstructions.children.length, 1);
    assert.equal(MO.regionManager.getActiveLot().id, 'lot-west-2');
});

test('Início Zero: apenas Caixa de Ferramentas ativa até Supervisor demarcar e Ajudantes abrirem estrada', () => {
    const MO = bootWorldApp();
    const infra = MO.state.villageInfra;

    assert.equal(infra.demarcated, false);
    assert.equal(infra.roadBuilt, false);
    assert.equal(infra.unloadingBuilt, false);
    assert.equal(infra.mixerBuilt, false);
    assert.equal(infra.workbenchBuilt, false);
    assert.equal(MO.mixer.stationGroup.visible, false);

    // Solicitação de caminhão antes da estrada e baia deve ficar enfileirada (sem entrar no terreno)
    MO.requestSupplyTruck('wood');
    assert.equal(MO.state.site.truckActive, false);
    assert.ok(MO.state.site.truckQueue.includes('wood'));

    // Supervisor demarca e Ajudantes constroem infraestrutura
    MO.hireSupervisor({ silent: true });
    for (let i = 0; i < 4; i++) MO.hireHelper({ silent: true });

    for (let f = 0; f < 60 * 40; f++) {
        MO.stepFrame(1 / 60);
        if (infra.demarcated && infra.roadBuilt && infra.unloadingBuilt && infra.mixerBuilt && infra.workbenchBuilt && infra.yardsBuilt) break;
    }

    assert.equal(infra.demarcated, true, 'Supervisor deve demarcar estradas e estações');
    assert.equal(infra.roadBuilt, true, 'Ajudantes devem construir estrada de terra');
    assert.equal(infra.unloadingBuilt, true, 'Ajudantes devem construir baia de descarga');
    assert.equal(infra.mixerBuilt, true, 'Ajudantes devem montar masseira');
    assert.equal(infra.workbenchBuilt, true, 'Ajudantes devem montar bancada de madeira');
    assert.equal(MO.mixer.stationGroup.visible, true);
    assert.ok(MO.sampleRoadWeight(MO.STATION_UNLOAD.x, MO.STATION_UNLOAD.z) > 0.2);
});

test('Bancada de Madeira recebe toras, ajudante serra e peças prontas são consumidas na obra', () => {
    const MO = bootWorldApp();
    MO.setWorkbenchBuilt(true);
    MO.state.villageInfra.demarcated = true;
    MO.state.villageInfra.roadBuilt = true;
    MO.state.villageInfra.unloadingBuilt = true;
    MO.state.villageInfra.mixerBuilt = true;

    MO.deliverRawWood(3);
    assert.equal(MO.state.workbench.rawWood, 3);
    assert.equal(MO.state.workbench.cutWood, 0);

    const sawOk = MO.completeWoodSawing();
    assert.equal(sawOk, true);
    assert.equal(MO.state.workbench.rawWood, 2);
    assert.ok(MO.state.workbench.cutWood > 0);

    const beforeCut = MO.state.workbench.cutWood;
    const consumed = MO.consumeCutWood(1);
    assert.equal(consumed, true);
    assert.equal(MO.state.workbench.cutWood, beforeCut - 1);
});

test('Ponte desbloqueia o Banco Leste na navegação A* e na progressão completa da Vila', () => {
    const MO = bootWorldApp();
    const rx = MO.getRiverCenterX ? MO.getRiverCenterX(0, MO.state.seed) : 1.6;

    // Rio bloqueado antes da ponte
    assert.equal(MO.isRiverBlockedAt(rx, -0.4), true);

    // Lotes Leste ficam bloqueados enquanto ponte não foi liberada
    MO.state.villageInfra.bridgeUnlocked = false;
    MO.regionManager.getLotsForRegion('main-valley').filter(l => l.bank === 'west' || l.id === 'lot-bridge').forEach(l => {
        if (l.status === 'active') l.status = 'available';
        if (l.bank === 'west') l.status = 'completed';
    });
    const nextBeforeBridge = MO.worldManager.getNextBuildableVillageLot();
    assert.equal(nextBeforeBridge.id, 'lot-bridge');

    // Simula conclusão da ponte desbloqueando Banco Leste
    nextBeforeBridge.status = 'completed';
    MO.state.villageInfra.bridgeUnlocked = true;
    const bridgeZ = (MO.state.villageInfra && MO.state.villageInfra.bridgeZ !== undefined) ? MO.state.villageInfra.bridgeZ : nextBeforeBridge.originZ;
    assert.equal(MO.isRiverBlockedAt(rx, bridgeZ), false);

    const nextEast = MO.worldManager.getNextBuildableVillageLot();
    assert.equal(nextEast.bank, 'east');
    assert.equal(nextEast.id, 'lot-east-1');

    // Coexistência completa dos 5 lotes da Vila por seed (Casa, Prédio, Ponte e Torre arquivados no cenário)
    MO.worldManager.initDefaultWorld();
    MO.state.mode = 'house';
    if (MO.modes.house && MO.modes.house.onInit) MO.modes.house.onInit();
    for (let step = 0; step < 5; step++) {
        if (MO.state.mode === 'house' && MO.loadPresetHouse) MO.loadPresetHouse('compact');
        MO.advanceToNextVillageLot();
    }
    assert.equal(MO.state.villageCompleted, true);
    assert.equal(MO.groups.archivedConstructions.children.length, 5);
    const archivedModes = MO.constructionManager.getCompletedConstructions().map(c => c.mode);
    ['house', 'bridge', 'building', 'tower'].forEach(modeId => {
        assert.ok(archivedModes.includes(modeId), `Vila concluída deve preservar modo ${modeId}`);
    });
});

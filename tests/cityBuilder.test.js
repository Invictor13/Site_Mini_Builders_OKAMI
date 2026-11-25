const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootCityApp() {
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
    class InstancedMesh extends Mesh {
        constructor(geo, mat, count = 0) {
            super(geo, mat);
            this.isInstancedMesh = true;
            this.count = count;
            this.instanceMatrix = { needsUpdate: false };
            this.instanceColor = { needsUpdate: false };
            this._matrices = new Array(count);
            this._colors = new Array(count);
        }
        setMatrixAt(i, m) { this._matrices[i] = m; }
        setColorAt(i, c) { this._colors[i] = { r: c.r, g: c.g, b: c.b }; }
    }
    class Euler { set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; } }
    class Quaternion { setFromEuler() { return this; } }
    class Matrix4 { compose() { return this; } }
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
            tagName: tag.toUpperCase(), style: {}, textContent: '', value: '', checked: false, className: '',
            classList: {
                add: (...c) => c.forEach(x => cls.add(x)),
                remove: (...c) => c.forEach(x => cls.delete(x)),
                toggle: (c, f) => { if (f === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); } else if (f) cls.add(c); else cls.delete(c); },
                contains: (c) => cls.has(c)
            },
            dataset: {}, addEventListener() {}, appendChild() {}, querySelectorAll: () => [], closest: () => null, getContext: () => ctx2d
        };
    }

    const THREE = {
        Scene: class extends Object3D {}, Group: class extends Object3D {},
        FogExp2: class { constructor(c, d) { this.color = new Color(c); this.density = d; } },
        PerspectiveCamera: class extends Object3D { constructor(f, a) { super(); this.fov = f; this.aspect = a; } updateProjectionMatrix() {} },
        WebGLRenderer: class { constructor() { this.domElement = makeEl('canvas'); this.shadowMap = {}; } setSize() {} setPixelRatio() {} render() {} },
        HemisphereLight: class extends Object3D { constructor(s = 0xffffff, g = 0, i = 1) { super(); this.color = new Color(s); this.intensity = i; } },
        DirectionalLight: class extends Object3D { constructor(c = 0xffffff, i = 1) { super(); this.color = new Color(c); this.intensity = i; this.shadow = { mapSize: {}, camera: {} }; this.target = new Object3D(); } },
        PointLight: class extends Object3D { constructor(c = 0xffffff, i = 1) { super(); this.color = new Color(c); this.intensity = i; } },
        Mesh, InstancedMesh, LineSegments: class extends Mesh {}, Points: class extends Mesh {},
        Sprite: class extends Object3D { constructor(m = new Material()) { super(); this.isSprite = true; this.geometry = new BufferGeometry(); this.material = m; } },
        BufferGeometry, BoxGeometry: BufferGeometry, CylinderGeometry: BufferGeometry, SphereGeometry: BufferGeometry,
        ConeGeometry: BufferGeometry, DodecahedronGeometry: BufferGeometry, IcosahedronGeometry: BufferGeometry,
        PlaneGeometry: BufferGeometry, RingGeometry: BufferGeometry, TubeGeometry: BufferGeometry, ExtrudeGeometry: BufferGeometry,
        Shape: class { moveTo() {} lineTo() {} closePath() {} }, CatmullRomCurve3: class {},
        BufferAttribute, Float32BufferAttribute: BufferAttribute, CanvasTexture: Texture,
        MeshStandardMaterial: Material, MeshBasicMaterial: Material, LineBasicMaterial: Material, PointsMaterial: Material, SpriteMaterial: Material,
        Color, Vector3, Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
        Matrix4, Quaternion, Euler,
        Raycaster: class { setFromCamera() {} intersectObjects() { return []; } intersectObject() { return []; } },
        RepeatWrapping: 1000, DoubleSide: 2, PCFSoftShadowMap: 2, ACESFilmicToneMapping: 4
    };

    const storageMap = new Map();
    const byId = new Map();
    const document = {
        body: makeEl('body'), hidden: false, readyState: 'complete', createElement: makeEl,
        getElementById: (id) => { if (!byId.has(id)) byId.set(id, makeEl('div')); return byId.get(id); },
        querySelectorAll: () => [], addEventListener() {}
    };
    const windowObj = {
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, MO: {},
        localStorage: {
            getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
            setItem: (k, v) => storageMap.set(k, String(v)),
            removeItem: (k) => storageMap.delete(k)
        }
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

test('City Builder: início customizado com nome do Supervisor, 1 Operário e terreno infinito por chunks', () => {
    const MO = bootCityApp();

    const startRes = MO.cityManager.startCityGame({
        supervisorName: 'Eng. Juliana',
        seed: 7777,
        biome: 'forest',
        sandboxMode: false
    });

    assert.equal(startRes.supervisorName, 'Eng. Juliana');
    assert.equal(MO.state.workers.length, 2, 'Deve iniciar com exatamente 1 Supervisor e 1 Trabalhador');
    assert.equal(MO.state.workers[0].role, 'supervisor');
    assert.equal(MO.state.workers[0].name, 'Eng. Juliana');
    assert.equal(MO.state.economy.wood, 6, 'Deve iniciar com estoque mínimo de emergência até extrair/comprar');
    assert.equal(MO.state.economy.coins, 90);
    assert.equal(MO.chunkManager.getLoadedChunkCount(), 49, 'Janela deslizante 7x7 de chunks 24m deve carregar 49 chunks');

    // Navegar câmera para longe carrega novos chunks e descarrega os distantes (sem crescer memória)
    MO.chunkManager.updateAround(128, -96);
    assert.equal(MO.chunkManager.getLoadedChunkCount(), 49);
    assert.ok(MO.chunkManager.getLoadedResourceNodes('wood').length > 0, 'Chunks distantes devem gerar árvores colhíveis');
    const naturalOres = MO.chunkManager.getLoadedResourceNodes().filter(n => n.kind === 'mine' || n.kind === 'stone' || n.kind === 'iron');
    assert.ok(naturalOres.length > 0, 'Mapa deve gerar minas naturais, pedreiras e jazidas');

    // Sol e Lua devem orbitar no horizonte celeste distante (> 100m) sem atravessar o terreno
    MO.updateSkyAndWeather(0.1, 1.0);
    const skyGroup = MO.scene.children.find(g => g && g.children && g.children.some(c => c.position && Math.hypot(c.position.x, c.position.z) > 100));
    assert.ok(skyGroup, 'Sol/Lua devem orbitar bem além dos chunks visíveis (> 100m)');
    assert.equal(MO.terrainGridLines, null, 'Grade amarela fixa 28x28 não deve aparecer no Modo Cidade sem limites');

    // A* e física funcionam em coordenadas infinitas sem prender em 15m
    const pathFar = MO.computeWorkerPath(null, 120, -90, 134, -84);
    assert.ok(pathFar.length >= 1);
    const resolvedFar = MO.resolveWorkerPhysics({ sleepingInside: true }, 128, -96);
    assert.ok(Math.abs(resolvedFar.x - 128) < 5);
});

test('City Builder: posicionamento livre de ruas, estradas, fazendas, mercados e casa de tamanho personalizado', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Mestre Lucas', seed: 5511, sandboxMode: false });

    // Pintar estrada de terra grátis + rua pavimentada com custo real de pedra/moeda
    const prevCoins = MO.state.economy.coins;
    const prevStone = MO.state.economy.stone;
    assert.equal(MO.cityManager.paintRoadOrStreet({ x: 35.2, z: -18.4 }, 'dirt'), true);
    assert.equal(MO.state.economy.coins, prevCoins);

    assert.equal(MO.cityManager.paintRoadOrStreet({ x: 38.2, z: -18.4 }, 'paved'), true);
    assert.equal(MO.state.economy.stone, prevStone - 1);
    assert.equal(MO.state.economy.coins, prevCoins - 1);
    assert.ok(MO.sampleRoadWeight(38.2, -18.4) > 0.2);

    // Simula extração/compra prévia para erguer casa personalizada grande 3x4 (12🪵 12🪨 12🪙)
    MO.cityManager.addResources({ wood: 14, stone: 14 });
    MO.cityManager.setActiveBuildTool('house-custom');
    MO.cityManager.handlePlacementPointerDown({ x: 40.2, z: 20.2 });
    MO.cityManager.handlePlacementPointerMove({ x: 42.8, z: 23.8 });
    MO.cityManager.handlePlacementPointerUp({ x: 42.8, z: 23.8 });

    assert.equal(MO.state.mode, 'house');
    assert.equal(MO.state.occupiedCells.size, 12, 'Casa personalizada 3x4 deve criar 12 células no terreno infinito');
    assert.ok(MO.state.walls.length > 0 && MO.state.columns.length > 0);
    assert.ok(MO.state.walls.every(w => w.x1 >= 39 && w.z1 >= 19), 'Casa personalizada deve nascer na coordenada escolhida pelo jogador');

    // Construir fazenda e mercado e validar alternância Sandbox (sem gasto)
    const farm = MO.cityManager.placeProductiveStructure('farm', { x: 48, z: 22 });
    assert.ok(farm);
    MO.cityManager.toggleSandboxMode(true);
    const coinsBeforeFree = MO.state.economy.coins;
    MO.cityManager.placeProductiveStructure('market', { x: 52, z: 22 });
    assert.equal(MO.state.economy.coins, coinsBeforeFree, 'Modo Sandbox não deve consumir recursos');
});

test('City Builder: novas profissões (Lenhador, Mineiro, Fazendeiro e Comerciante) produzem recursos da cidade', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Sup. Ana', seed: 9123, sandboxMode: true });

    const lumberjack = MO.hireSpecialist('lumberjack', { free: true, silent: true });
    const miner = MO.hireSpecialist('miner', { free: true, silent: true });
    const farmer = MO.hireSpecialist('farmer', { free: true, silent: true });
    const merchant = MO.hireSpecialist('merchant', { free: true, silent: true });

    const farm = MO.cityManager.placeProductiveStructure('farm', { x: 5, z: 5 });
    const market = MO.cityManager.placeProductiveStructure('market', { x: -5, z: 5 });
    farm.built = true;
    market.built = true;

    const eco0 = { ...MO.state.economy };

    // Simula execução das tarefas de cada especialista até completar ciclos produtivos
    MO.workerTasks.assignWorkerTask(lumberjack, 1.0);
    assert.equal(lumberjack.task.type, 'harvest-wood');
    MO.workerAgent.completeTask(lumberjack, lumberjack.task);
    assert.ok(MO.state.economy.wood > eco0.wood, 'Lenhador deve aumentar estoque de madeira');

    MO.workerTasks.assignWorkerTask(miner, 1.0);
    assert.equal(miner.task.type, 'harvest-ore');
    MO.workerAgent.completeTask(miner, miner.task);
    assert.ok(
        MO.state.economy.stone > eco0.stone || MO.state.economy.iron > eco0.iron,
        'Mineiro deve aumentar estoque de pedra ou ferro'
    );

    MO.workerTasks.assignWorkerTask(farmer, 1.0);
    assert.equal(farmer.task.type, 'work-farm');
    MO.workerAgent.completeTask(farmer, farmer.task);
    assert.ok(MO.state.economy.food > eco0.food, 'Fazendeiro deve produzir alimentos');

    MO.workerTasks.assignWorkerTask(merchant, 1.0);
    assert.equal(merchant.task.type, 'work-market');
    MO.workerAgent.completeTask(merchant, merchant.task);
    assert.ok(MO.state.economy.coins > eco0.coins, 'Comerciante deve gerar moedas');
});

test('City Builder: início 100% vazio (sem estruturas automáticas), Ghost Preview, Estrada A->B e apoio escolhido pelo usuário', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Eng. Clara', seed: 4412, sandboxMode: true });

    // ZERO estruturas pré-criadas no mapa além da Caixa de Ferramentas + 2 NPCs
    assert.equal(MO.state.camp.messHall, null, 'Lanchonete não deve nascer automática');
    assert.equal(MO.state.camp.tents.length, 0, 'Barracas não devem nascer automáticas');
    assert.equal(MO.state.camp.floodlights.length, 0, 'Refletores não devem nascer automáticos');
    assert.equal(MO.state.villageInfra.unloadingBuilt, false, 'Baia não deve nascer construída');
    assert.equal(MO.state.villageInfra.mixerBuilt, false, 'Masseira não deve nascer construída');
    assert.equal(MO.state.villageInfra.workbenchBuilt, false, 'Bancada não deve nascer construída');
    assert.equal(MO.regionManager.getLotsForRegion('main-valley').length, 0, 'Nenhum lote pré-demarcado automaticamente');

    // Supervisor em modo playerDriven NÃO auto-demarca infraestrutura fixa
    const sup = MO.state.workers.find(w => w.role === 'supervisor');
    MO.workerTasks.assignWorkerTask(sup, 1.0);
    assert.notEqual(sup.task.type, 'demarcate-site');
    assert.equal(MO.state.villageInfra.demarcated, false);

    // Ghost Preview 3D ativa em terreno seco e desativa sem ferramenta
    MO.cityManager.setActiveBuildTool('mess-hall');
    MO.cityManager.updatePlacementPreview({ x: 3.0, z: 3.0 });
    assert.equal(MO.placementGhost.visible, true);

    // Estrada A -> B em linha reta
    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: 2.0, z: 2.0 });
    MO.cityManager.handlePlacementPointerMove({ x: 6.0, z: 2.0 });
    MO.cityManager.handlePlacementPointerUp({ x: 6.0, z: 2.0 });
    for (let gx = 2; gx <= 6; gx++) {
        assert.ok(MO.state.city.roadTiles.has(`${gx},2`), `Célula (${gx},2) da estrada reta A->B deve existir`);
    }

    // Usuário escolhe locais para Baia, Masseira, Lanchonete e Barraca
    MO.cityManager.placeProductiveStructure('unloading', { x: -4.0, z: 4.0 });
    assert.equal(MO.groups.demarcation.children.length, 0, 'Não deve desenhar caixas fantasmas de Masseira/Bancada/Depósito não posicionados');
    MO.cityManager.placeProductiveStructure('mixer', { x: 4.0, z: 4.0 });
    MO.cityManager.placeProductiveStructure('mess-hall', { x: -6.0, z: -4.0 });
    MO.cityManager.placeProductiveStructure('tent', { x: -8.0, z: -4.0 });

    assert.equal(MO.STATION_UNLOAD.x, -4.0);
    assert.equal(MO.STATION_MIXER.x, 4.0);
    assert.ok(MO.state.camp.messHall, 'Lanchonete criada apenas onde usuário escolheu');
    assert.equal(MO.state.camp.tents.length, 1, 'Barraca criada apenas onde usuário escolheu');

    // Depósito deve gerar estoques e tambores exatamente no ponto clicado, não em posição fixa
    MO.cityManager.placeProductiveStructure('stockyard', { x: 11.0, z: -8.0 });
    assert.equal(MO.STATION_STOCKYARD.x, 11.0);
    assert.ok(Math.abs(MO.STATION_TIMBER.x - 11.0) < 1.5, 'Estoque de vigas deve nascer no ponto clicado do Depósito');
    assert.ok(MO.state.draggableSupplies.some(s => s.type === 'water' && Math.hypot(s.mesh.position.x - 11.0, s.mesh.position.z - (-8.0)) < 3.0), 'Tambores de água devem ficar no Depósito clicado');

    // Celular do Gestor exige via conectada DA RODOVIA REGIONAL até a Baia para o caminhão entrar
    assert.equal(MO.togglePhonePanel(true), true);
    assert.equal(MO.requestSupplyTruck('bricks', true), false, 'Sem via conectada à Rodovia, caminhão não deve cortar pelo mato');
    // Conecta estrada reta da Rodovia Regional até a Baia (-4,4)
    const hwStartX = Math.round(MO.chunkManager.getHighwayCenterX(4.0, 4412) + 2);
    if (MO.state.city.activeBuildTool !== 'dirt-road') MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: hwStartX, z: 4.0 });
    MO.cityManager.handlePlacementPointerMove({ x: -4.0, z: 4.0 });
    MO.cityManager.handlePlacementPointerUp({ x: -4.0, z: 4.0 });
    assert.equal(MO.requestSupplyTruck('bricks', true), true, 'Com estrada ligando a Rodovia à Baia, caminhão deve entrar vindo da Rodovia');
    assert.equal(MO.state.site.truckActive, true);
    assert.ok(Array.isArray(MO.state.site.truckRoute) && MO.state.site.truckRoute.length >= 6, 'Caminhão deve possuir rota da Rodovia até a Baia');

    // Ao posicionar casa na cidade, workers constroem automaticamente sem abrir dock manual de ferramentas
    MO.cityManager.setActiveBuildTool('house-auto');
    MO.cityManager.handlePlacementPointerDown({ x: 6.0, z: -6.0 });
    assert.equal(MO.state.phase, 2, 'Casa posicionada na cidade inicia automaticamente na Fundação (Fase 2)');
    assert.ok(MO.updateCityConstructionAutomation, 'Motor automático da cidade deve existir');
    const worker = MO.state.workers.find(w => w.role !== 'supervisor');
    MO.workerTasks.assignWorkerTask(worker, 1.0);
    assert.equal(worker.task.type, 'dig', 'Trabalhador deve pegar automaticamente tarefa de cavar sapatas');
});

test('Vertical Slice Floresta: relevo multi-camada (vale, rio, montanhas), nuvens low-poly e Continuar Cidade persistente', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Eng. Helena', seed: 4280, biome: 'forest', sandboxMode: false });

    // Relevo deve ter contraste real: vale central suave, leito do rio abaixo da água e montanhas altas
    const hCenter = MO.chunkManager.getHeightAt(0, 0);
    const rx = MO.chunkManager.getRiverCenterX(0, 4280);
    const hRiver = MO.chunkManager.getHeightAt(rx, 0);
    assert.ok(hCenter > MO.WATER_LEVEL + 0.3 && hCenter < 1.2, 'Vale central deve ser próprio para construção');
    assert.ok(hRiver < MO.WATER_LEVEL, 'Leito do rio deve estar abaixo do nível da água');

    let maxPeak = -Infinity;
    for (let z = -120; z <= 120; z += 8) {
        for (let x = -120; x <= 120; x += 8) {
            maxPeak = Math.max(maxPeak, MO.chunkManager.getHeightAt(x, z));
        }
    }
    assert.ok(maxPeak > 2.2, `Relevo multi-camada deve formar montanhas expressivas (pico medido: ${maxPeak.toFixed(2)}m)`);

    // Construir vias, apoio e fazenda, salvar e restaurar via continueCityGame
    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: 0, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: 4, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: 4, z: 2 });
    MO.cityManager.placeProductiveStructure('unloading', { x: 4, z: 4 });
    MO.cityManager.addResources({ wood: 5 });
    MO.cityManager.placeProductiveStructure('mess-hall', { x: -5, z: -3 });
    const farm = MO.cityManager.placeProductiveStructure('farm', { x: 8, z: -5 });
    assert.ok(farm, 'Fazenda deve ser criada após extrair/obter madeira');
    MO.hireSpecialist('lumberjack', { free: true, silent: true });

    const summary = MO.cityManager.getSavedCitySummary();
    assert.ok(summary);
    assert.equal(summary.supervisorName, 'Eng. Helena');
    assert.equal(summary.seed, 4280);
    assert.equal(summary.workers, 3);
    assert.ok(summary.roads >= 5);

    // Simula reinício em memória e restauração via Continuar Cidade
    MO.cityManager.startCityGame({ supervisorName: 'Temp', seed: 1111, biome: 'coast', sandboxMode: true, skipSave: true });
    assert.equal(MO.state.workers.length, 2);
    assert.equal(MO.cityManager.continueCityGame(), true);

    assert.equal(MO.state.supervisorName, 'Eng. Helena');
    assert.equal(MO.state.seed, 4280);
    assert.equal(MO.state.biome, 'forest');
    assert.equal(MO.state.workers.length, 3);
    assert.ok(MO.state.city.roadTiles.size >= 5, 'Estradas salvas devem ser restauradas');
    assert.ok(MO.state.camp.messHall, 'Lanchonete salva deve ser restaurada');
    assert.equal(MO.state.city.structures.length, 1, 'Fazenda salva deve ser restaurada');
});

test('World Visual 2.0 & Persistência Real de Ecossistemas: InstancedMesh, atmosfera noturna legível e árvores cortadas não ressurgem', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Eng. Marcos', seed: 4280, biome: 'forest', sandboxMode: false });

    // 1. Deve gerar vegetação densa com InstancedMesh nos chunks carregados
    let instancedCount = 0;
    MO.groups.terrainChunks.traverse(obj => {
        if (obj && obj.isInstancedMesh && obj.count > 0) instancedCount++;
    });
    assert.ok(instancedCount >= 12, `Ecossistema 2.0 deve usar InstancedMesh para flora em lotes (encontrados: ${instancedCount})`);

    // 2. Mapa inicial limpo (sem caixa de ferramentas feia no chão) e legibilidade noturna preservada
    assert.equal(MO.groups.toolbox.children.length, 0, 'Mapa inicial no Modo Cidade não deve gerar caixa de ferramentas nem objetos no chão');
    MO.state.timeOfDay = 0.78;
    MO.updateAtmosphere(0.05, 1.0);
    assert.equal(MO.state.isNight, true);
    assert.ok(MO.lights.hemiLight.intensity >= 0.50, 'Luz hemisférica noturna deve preservar leitura do terreno');
    assert.ok(MO.lights.sunLight.intensity >= 0.52, 'Luar direcional noturno deve manter silhuetas e sombras');

    // 3. Início vivo: operário ocioso faz reconhecimento inicial e cede imediatamente ao colocar obra
    const helper = MO.state.workers.find(w => w.role !== 'supervisor');
    MO.workerTasks.assignWorkerTask(helper, 1.0);
    assert.equal(helper.task.type, 'survey-area', 'Operário sem obras deve fazer reconhecimento do terreno inicial');

    // 4. Persistência Real dos Ecossistemas: colher parcial e esgotar totalmente uma árvore, descarregar chunk e recarregar
    const trees = MO.chunkManager.getLoadedResourceNodes('wood');
    assert.ok(trees.length >= 20, `Floresta densa 2.0 deve gerar amplos nós de madeira nos chunks iniciais (atual: ${trees.length})`);
    const partialTree = trees[0];
    const depletedTree = trees[1];
    const partialId = partialTree.id;
    const depletedId = depletedTree.id;

    MO.chunkManager.harvestNode(partialTree, 2);
    MO.chunkManager.harvestNode(depletedTree, depletedTree.maxAmount);
    assert.equal(depletedTree.amount, 0);

    // Simula deslocamento distante (descarrega chunks ao redor da origem) e retorno para (0,0)
    MO.chunkManager.updateAround(240, 240);
    assert.equal(MO.chunkManager.getLoadedResourceNodes('wood').some(n => n.id === partialId), false, 'Chunk inicial deve ter sido descarregado');

    MO.chunkManager.updateAround(0, 0);
    const reloadedTrees = MO.chunkManager.getLoadedResourceNodes('wood');
    const reloadedPartial = reloadedTrees.find(n => n.id === partialId);
    const reloadedDepleted = reloadedTrees.find(n => n.id === depletedId);
    assert.ok(reloadedPartial, 'Árvore colhida parcialmente deve continuar existente após recarregar chunk');
    assert.equal(reloadedPartial.amount, partialTree.maxAmount - 2, 'Quantidade restante da árvore deve persistir após unload/reload');
    assert.equal(reloadedDepleted, undefined, 'Árvore esgotada NÃO pode reaparecer após unload/reload');

    // 5. Persistência em localStorage via Continuar Cidade
    MO.cityManager.saveCityState();
    MO.cityManager.startCityGame({ supervisorName: 'Novo', seed: 1111, biome: 'forest', skipSave: true });
    assert.equal(MO.cityManager.continueCityGame(), true);

    const afterSaveTrees = MO.chunkManager.getLoadedResourceNodes('wood');
    assert.equal(afterSaveTrees.find(n => n.id === partialId)?.amount, partialTree.maxAmount - 2, 'Colheita parcial deve persistir no save/continue');
    assert.equal(afterSaveTrees.find(n => n.id === depletedId), undefined, 'Árvore derrubada deve continuar derrubada após Continuar Cidade');

    // 6. Métricas de otimização com InstancedMesh + instanceColor devem manter draw calls contidos
    const perf = MO.chunkManager.getPerformanceStats();
    assert.ok(perf.totalInstances >= 3000, `Floresta 2.0 deve instanciar rica vegetação/árvores (atual: ${perf.totalInstances})`);
    assert.ok(perf.estimatedDrawCalls < 1200, `Draw calls estimados devem permanecer otimizados (atual: ${perf.estimatedDrawCalls})`);

    // 7. Construir sobre área de floresta limpa vegetação e persiste em clearedAreas
    const treeToClear = afterSaveTrees[0];
    MO.chunkManager.clearNatureInArea(treeToClear.x, treeToClear.z, 2.5);
    assert.equal(MO.chunkManager.getLoadedResourceNodes('wood').some(n => n.id === treeToClear.id), false, 'Árvore sob nova obra deve ser limpa');
    const modSnap = MO.chunkManager.serializeModifications();
    assert.equal(modSnap.version, 2);
    assert.ok(modSnap.clearedAreas.length >= 1, 'Áreas limpas devem persistir no snapshot v2');
});

test('Economia Produtiva 2.0 & NPC Intelligence 2.0: Serraria, Mercado com excedente, Contratos, Ciclo Financeiro, XP e Moral', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Eng. Beatriz', seed: 4280, biome: 'forest', sandboxMode: false });

    // 1. Contrato de Construção: aceitar recebe adiantamento e cumprir paga recompensa final
    const coins0 = MO.state.economy.coins;
    assert.equal(MO.economyManager.acceptContract('road-access'), true, 'Deve aceitar contrato da Prefeitura');
    assert.equal(MO.state.economy.coins, coins0 + 12, 'Aceitar contrato deve creditar adiantamento imediatamente');

    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: 0, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: 6, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: 6, z: 2 });
    // Conclui os 7 segmentos de estrada como se os operários tivessem finalizado
    MO.state.city.roadTiles.forEach(t => { t.built = true; });
    const completedNow = MO.economyManager.evaluateContracts();
    assert.equal(completedNow.length, 1, 'Contrato de 6m de estrada deve ser concluído automaticamente');
    assert.equal(completedNow[0].id, 'road-access');
    assert.equal(MO.state.economy.coins, coins0 + 12 + 25, 'Recompensa final do contrato deve ser paga');

    // 2. Serraria funcional: consome toras brutas, produz madeira beneficiada + moedas + cutWood
    MO.cityManager.addResources({ wood: 10 });
    const sawStruct = MO.cityManager.placeProductiveStructure('lumberyard', { x: 4, z: -4 });
    assert.ok(sawStruct);
    sawStruct.built = true;
    const coinsBeforeSaw = MO.state.economy.coins;
    const sawRes = MO.economyManager.processSawmillBatch();
    assert.equal(sawRes.processed, true, 'Serraria deve processar lote real de toras');
    assert.ok(MO.state.economy.coins > coinsBeforeSaw, 'Serraria deve gerar receita de madeira beneficiada');
    assert.ok(MO.state.workbench.cutWood >= 2, 'Serraria deve abastecer madeira beneficiada da bancada');

    // 3. Mercado com regra explícita: vende excedente físico real acima da reserva
    MO.cityManager.addResources({ stone: 12 });
    const stoneBeforeTrade = MO.state.economy.stone;
    const coinsBeforeTrade = MO.state.economy.coins;
    const tradeRes = MO.economyManager.processMarketTrade(true);
    assert.ok(tradeRes.soldKind, 'Mercado com excedente deve vender um recurso físico real');
    assert.ok(MO.state.economy.coins > coinsBeforeTrade, 'Venda no mercado deve gerar moedas');
    if (tradeRes.soldKind === 'stone') {
        assert.equal(MO.state.economy.stone, stoneBeforeTrade - 1, 'Recurso vendido no mercado deve ser debitado do estoque');
    }

    // 4. Ciclo econômico periódico: cobra salários e manutenção, alimenta equipe e registra balanço
    const report = MO.economyManager.runEconomicCycle();
    assert.ok(report, 'Ciclo econômico deve retornar relatório');
    assert.ok(report.wages >= 3, 'Deve calcular salários da equipe (Supervisor + Operário)');
    assert.ok(report.upkeep >= 1, 'Deve calcular manutenção das estruturas construídas');

    // 5. NPC Intelligence 2.0: XP, subida de nível, moral e laços sociais
    const helper = MO.state.workers.find(w => w.role !== 'supervisor');
    const sup = MO.state.workers.find(w => w.role === 'supervisor');
    assert.equal(helper.level, 1);
    MO.workerFactory.awardWorkerExperience(helper, 35, 5);
    assert.equal(helper.level, 2, 'Operário deve subir para Nível 2 ao atingir 30+ XP');
    assert.ok(helper.celebrateTimer > 0, 'Subir de nível deve acionar animação de comemoração');
    MO.workerFactory.recordPeerBond(sup, helper, 10);
    assert.ok(sup.relationships[helper.name] >= 20, 'Interação social deve registrar afinidade entre colegas');

    // 6. Persistência de contratos, nível de NPCs e retrocompatibilidade no Continuar Cidade
    MO.cityManager.saveCityState();
    MO.cityManager.startCityGame({ supervisorName: 'Outro', seed: 9999, biome: 'forest', skipSave: true });
    assert.equal(MO.cityManager.continueCityGame(), true);
    assert.ok(MO.state.economy.completedContracts.includes('road-access'), 'Contratos concluídos devem persistir no save');
    const restoredHelper = MO.state.workers.find(w => w.role !== 'supervisor');
    assert.equal(restoredHelper.level, 2, 'Nível do NPC deve persistir no Continuar Cidade');

    // 7. Painel contextual de Gestão da Cidade abre/renderiza sem erros
    assert.equal(MO.toggleEconomyPanel(true), true);
    MO.renderEconomyPanelUI();
});

test('Modo Chillout: inicia sem caixa no chão e constrói cidade progressivamente das estradas às casas', () => {
    const MO = bootCityApp();
    MO.chilloutManager.startChilloutGame({ supervisorName: 'Supervisor Beto', seed: 4280, biome: 'forest' });

    assert.equal(MO.groups.toolbox.children.length, 0, 'Modo Chillout também deve iniciar com terreno limpo, sem caixa no chão');
    assert.equal(MO.state.city.chilloutMode, true);
    assert.equal(MO.state.city.roadTiles.size, 0, 'Estradas devem ser construídas progressivamente, não pré-criadas');

    // Etapa 1: após o cooldown inicial, abre a estrada pioneira e contrata equipe básica
    assert.equal(MO.chilloutManager.update(2.0), true);
    assert.ok(MO.state.city.roadTiles.size >= 10, 'Etapa 1 do Chillout deve demarcar a estrada pioneira');
    assert.ok(MO.state.workers.length >= 5, 'Etapa 1 do Chillout deve contratar especialistas iniciais');

    // Enquanto a estrada ainda não terminou, não dispara etapa 2
    assert.equal(MO.chilloutManager.update(5.0), false);

    // Conclui estrada -> dispara Etapa 2 (apoio: Baia, Masseira, Bancada, Depósito)
    MO.state.villageInfra.roadSegments.forEach(s => { s.built = true; });
    MO.state.city.roadTiles.forEach(t => { t.built = true; });
    assert.equal(MO.chilloutManager.update(2.0), true);
    assert.equal(MO.state.villageInfra.unloadingPlaced, true, 'Etapa 2 deve posicionar Baia de Descarga');
    assert.equal(MO.state.villageInfra.mixerPlaced, true, 'Etapa 2 deve posicionar Masseira');
    assert.equal(MO.state.villageInfra.workbenchPlaced, true, 'Etapa 2 deve posicionar Bancada');

    // Conclui apoio -> dispara Etapa 3 (acampamento: refeitório, barracas, refletor)
    MO.setUnloadingBuilt(true);
    MO.setMixerBuilt(true);
    MO.setWorkbenchBuilt(true);
    MO.setStockYardsBuilt(true);
    assert.equal(MO.chilloutManager.update(2.0), true);
    assert.ok(MO.state.camp.messHall, 'Etapa 3 deve posicionar refeitório');
    assert.ok(MO.state.camp.tents.length >= 2, 'Etapa 3 deve posicionar barracas');

    // Conclui acampamento -> dispara Etapa 4 (Fazenda e Serraria)
    MO.completeMessBuild();
    MO.state.camp.tents.forEach(t => MO.completeTentBuild(t));
    MO.state.camp.floodlights.forEach(f => MO.completeFloodlightBuild(f));
    assert.equal(MO.chilloutManager.update(2.0), true);
    assert.ok(MO.state.city.structures.some(s => s.kind === 'farm'), 'Etapa 4 deve criar Fazenda');
    assert.ok(MO.state.city.structures.some(s => s.kind === 'lumberyard'), 'Etapa 4 deve criar Serraria');

    // Conclui fazenda/serraria e ramal -> Etapa 5 (Avenida + Mercado) -> Etapa 6 (Casa #1!)
    MO.state.villageInfra.roadSegments.forEach(s => { s.built = true; });
    MO.state.city.structures.forEach(s => { s.built = true; });
    assert.equal(MO.chilloutManager.update(2.0), true); // Etapa 5: Mercado + Avenida
    assert.ok(MO.state.city.structures.some(s => s.kind === 'market'), 'Etapa 5 deve criar Mercado');

    MO.state.villageInfra.roadSegments.forEach(s => { s.built = true; });
    MO.state.city.structures.forEach(s => { s.built = true; });
    assert.equal(MO.chilloutManager.update(2.0), true); // Etapa 6: Casa #1
    assert.equal(MO.state.mode, 'house');
    assert.ok(MO.constructionManager.getActiveConstruction(), 'Etapa 6 deve iniciar automaticamente a construção da Casa #1');

    // Pausar Chillout devolve controle manual
    assert.equal(MO.toggleChilloutMode(false), false);
    assert.equal(MO.state.city.chilloutMode, false);
});

test('OKAMI 2.0 Comunidade Viva: personalidade, memória de NPCs, câmera de acompanhamento, reflorestamento e Diário da Cidade', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Eng. Clara', seed: 4280, biome: 'forest', sandboxMode: false });

    // 1. Diário da Cidade registra fundação e marcos
    const journal0 = MO.economyManager.getJournal(10);
    assert.ok(journal0.length >= 1, 'Diário da Cidade deve registrar a fundação da comunidade');

    // 2. NPCs possuem traço de personalidade e memória persistente de obras/eventos
    const helper = MO.state.workers.find(w => w.role !== 'supervisor');
    assert.ok(helper.trait && helper.traitLabel, 'NPC deve nascer com traço de personalidade');
    MO.workerFactory.recordWorkerBuiltLot(helper, 'lot-casa-1', 'Casa da Cidade #1');
    assert.equal(helper.memory.builtLots.length, 1, 'Memória do NPC deve registrar obra que ajudou a construir');

    // 3. Câmera de acompanhamento segue o NPC e solta corretamente
    assert.equal(MO.followWorker(helper.id).id, helper.id);
    assert.equal(MO.state.followWorkerId, helper.id);
    MO.stopFollowingWorker();
    assert.equal(MO.state.followWorkerId, null);

    // 4. Ciclo da Madeira: cortar árvore -> replantar muda -> crescer muda + Contrato de Reflorestamento
    const trees = MO.chunkManager.getLoadedResourceNodes('wood');
    const t1 = trees[0];
    const t2 = trees[1];
    MO.chunkManager.harvestNode(t1, t1.maxAmount);
    MO.chunkManager.harvestNode(t2, t2.maxAmount);
    assert.ok(MO.chunkManager.getDepletedTreeNodes().length >= 2, 'Árvores cortadas devem ficar elegíveis para reflorestamento');

    assert.equal(MO.economyManager.acceptContract('reforest-valley'), true, 'Deve aceitar contrato ambiental de reflorestamento');
    const sap1 = MO.chunkManager.replantSapling(t1.id);
    const sap2 = MO.chunkManager.replantSapling(t2.id);
    assert.ok(sap1 && sap2, 'Mudas devem ser replantadas sobre tocos cortados');
    assert.equal(MO.chunkManager.getReplantedCount(), 2);
    const grown = MO.chunkManager.growSaplings();
    assert.ok(grown >= 2, 'Mudas devem crescer durante os ciclos ecológicos');

    const doneContracts = MO.economyManager.evaluateContracts();
    assert.ok(doneContracts.some(c => c.id === 'reforest-valley'), 'Contrato de reflorestamento deve concluir automaticamente após replantar 2 mudas');

    // 5. Fazenda evolui estágio visual da plantação quando cultivada
    MO.cityManager.addResources({ wood: 10 });
    const farm = MO.cityManager.placeProductiveStructure('farm', { x: 4, z: 4 });
    farm.built = true;
    assert.ok(farm.cropMeshes && farm.cropMeshes.length === 3, 'Fazenda 2.0 deve possuir 3 canteiros visuais');
    const prevStage = farm.cropStage;
    MO.workerAgent.completeTask(helper, { type: 'work-farm', cityStruct: farm });
    assert.notEqual(farm.cropStage, prevStage, 'Colheita/cultivo na fazenda deve evoluir o estágio visual da plantação');

    // 6. Persistência de memória, personalidade, replantios e Diário da Cidade no Continuar Cidade
    MO.cityManager.saveCityState();
    MO.cityManager.startCityGame({ supervisorName: 'Temp', seed: 1111, biome: 'forest', skipSave: true });
    assert.equal(MO.cityManager.continueCityGame(), true);
    const restoredHelper = MO.state.workers.find(w => w.role !== 'supervisor');
    assert.equal(restoredHelper.memory.builtLots.length, 1, 'Memória de obras do NPC deve persistir no Continuar Cidade');
    assert.ok(MO.economyManager.getJournal(10).length >= 2, 'Diário da Cidade deve persistir no Continuar Cidade');
});

test('Rodovia Regional, Tráfego de Carros apenas por vias e Conexão Obrigatória da Rodovia até a Cidade', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Pioneiro Beto', seed: 4280, biome: 'forest', sandboxMode: true });

    // 1. Rodovia Regional deve existir no oeste e nenhuma árvore pode nascer sobre a pista
    const hwX0 = MO.chunkManager.getHighwayCenterX(0, 4280);
    assert.ok(hwX0 < -10 && hwX0 > -28, `Rodovia Regional deve passar a oeste do vale (x=${hwX0.toFixed(1)})`);
    const trees = MO.chunkManager.getLoadedResourceNodes('wood');
    assert.equal(
        trees.some(tr => MO.chunkManager.isNearHighway(tr.x, tr.z, 1.5, 4280)),
        false,
        'Nenhuma árvore deve nascer em cima da Rodovia Regional'
    );

    // 2. Carros circulam na Rodovia Regional, mas ZERO carros urbanos sem rua conectada à Rodovia
    MO.trafficManager.update(0.5);
    const stats0 = MO.trafficManager.getTrafficStats();
    assert.equal(stats0.highwayActive, 6, '6 veículos devem circular continuamente na Rodovia Regional');
    assert.equal(stats0.cityActive, 0, 'Sem ruas conectadas à Rodovia, não deve haver carros urbanos');

    // 3. Rua isolada no meio do vale NÃO permite entrada de caminhão nem de carros urbanos
    MO.cityManager.placeProductiveStructure('unloading', { x: 2, z: 2 });
    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: 0, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: 2, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: 2, z: 2 });
    assert.equal(MO.requestSupplyTruck('bricks', true), false, 'Caminhão NÃO pode entrar sem pista conectada à Rodovia Regional');

    // 4. Conectar pista da Rodovia Regional até a Baia libera caminhões E carros circulando apenas sobre ruas construídas!
    const hwEdgeX = Math.round(MO.chunkManager.getHighwayCenterX(2, 4280) + 2);
    MO.cityManager.handlePlacementPointerDown({ x: hwEdgeX, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: 0, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: 0, z: 2 });

    assert.equal(MO.requestSupplyTruck('bricks', true), true, 'Com pista ligada à Rodovia Regional, caminhão deve conseguir chegar à Baia');

    // 5. Carros visitantes DEVEM nascer na Rodovia Regional, percorrer apenas as ruas conectadas e VOLTAR para a Rodovia!
    MO.trafficManager.update(0.1);
    const statsStart = MO.trafficManager.getTrafficStats();
    assert.ok(statsStart.cityActive >= 1, 'Com ruas ligadas à Rodovia, carro visitante deve iniciar viagem');
    const visitor0 = statsStart.cityVehicles.find(c => c.visible);
    assert.equal(visitor0.phase, 'highway-in', 'Carro visitante deve obrigatoriamente nascer na Rodovia Regional, nunca dentro da estrada de terra');
    assert.equal(visitor0.onHighway, true);

    const seenPhases = new Set([visitor0.phase]);
    for (let step = 0; step < 180; step++) {
        MO.trafficManager.update(0.25);
        const st = MO.trafficManager.getTrafficStats();
        st.cityVehicles.filter(c => c.visible).forEach(car => {
            seenPhases.add(car.phase);
            if (!car.onHighway && car.key) {
                assert.ok(MO.state.city.roadTiles.has(car.key), 'Quando fora da Rodovia, carro deve estar estritamente sobre tile de rua conectado');
            }
        });
    }
    assert.ok(seenPhases.has('highway-in'), 'Carro deve entrar vindo da Rodovia Regional');
    assert.ok(seenPhases.has('city-in'), 'Carro deve percorrer a estrada construída da cidade');
    assert.ok(seenPhases.has('city-out'), 'Carro deve fazer retorno pelas ruas construídas sem ficar preso');
    assert.ok(seenPhases.has('highway-out'), 'Carro deve retornar e seguir embora pela Rodovia Regional');
});

test('Lenhador & Madeireira 3D: queda física de árvore, 4 toras, destoca, mudas em crescimento, Madeireira peça-a-peça e Bônus Rodovia', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Pioneiro Beto', seed: 4280, biome: 'forest', sandboxMode: true });

    // 1. Promove árvore da floresta infinita, aplica golpes de machado e simula física de queda até atingir o solo
    const woodNodes = MO.chunkManager.getLoadedResourceNodes('wood');
    assert.ok(woodNodes.length > 0);
    const tree = MO.forestryManager.promoteChunkTree(woodNodes[0]);
    assert.equal(tree.status, 'standing');
    for (let h = 0; h < 4; h++) MO.forestryManager.applyAxeHitToTree(tree, 0, 0);
    assert.equal(tree.status, 'falling', 'Árvore deve entrar em queda física após 4 golpes de machado');
    for (let step = 0; step < 120 && tree.status === 'falling'; step++) {
        MO.forestryManager.update(0.05);
    }
    assert.equal(tree.status, 'fallen', 'Árvore em queda deve atingir o solo como tronco caído');

    // 2. Partir tronco caído gera 4 toras físicas que caem com gravidade no terreno
    for (let b = 0; b < 3; b++) MO.forestryManager.applyBuckHitToTree(tree);
    assert.equal(tree.status, 'bucked');
    assert.equal(MO.forestryManager.state.groundLogs.length, 4, 'Tronco partido deve gerar 4 toras físicas');
    for (let step = 0; step < 60; step++) MO.forestryManager.update(0.05);
    assert.ok(MO.forestryManager.state.groundLogs.every(l => l.grounded), 'Todas as 4 toras devem pousar no terreno');

    // 3. Destoca remove o toco residual deixando terreno limpo
    for (let s = 0; s < 3; s++) MO.forestryManager.applyStumpHit(tree);
    assert.equal(tree.stumpRemoved, true, 'Destoca deve remover o toco após 3 golpes');

    // 4. Reflorestamento ativo marca pontos, planta muda 3D e ela cresce até virar árvore adulta
    const marked = MO.forestryManager.markReforestSpots(2, { x: 0, z: 0 });
    assert.ok(marked >= 1, 'Reflorestamento deve marcar anéis em pontos livres');
    const spot = MO.forestryManager.state.plantQueue[0];
    const sapling = MO.forestryManager.completePlantSapling(spot);
    assert.equal(sapling.status, 'sapling');
    for (let step = 0; step < 120; step++) MO.forestryManager.update(1.0);
    assert.equal(sapling.status, 'standing', 'Muda plantada deve crescer gradualmente até virar árvore adulta');

    // 5. Madeireira montada peça por peça (15 peças) + exposição de lotes + Bônus de Rodovia (+35%)
    MO.cityManager.placeProductiveStructure('woodshop', { x: -4, z: 2 });
    const ws = MO.forestryManager.state.woodshop;
    assert.equal(ws.placed, true);
    assert.equal(ws.completed, false);
    const totalPieces = ws.buildQueue.length;
    assert.ok(totalPieces >= 12, 'Madeireira deve ser construída peça por peça');
    for (let p = 0; p < totalPieces; p++) {
        MO.forestryManager.installNextWoodshopPiece();
    }
    assert.equal(ws.completed, true, 'Madeireira deve inaugurar ao instalar todas as peças');

    // Expor 2 lotes (Pinho + Carvalho Nobre) e vender SEM ligação à rodovia
    assert.equal(MO.forestryManager.deliverDisplayBundle('pine'), true);
    assert.equal(MO.forestryManager.deliverDisplayBundle('oak'), true);
    assert.equal(ws.displayedBundles.length, 2);
    const saleNoHw = MO.forestryManager.sellDisplayedWood({ silent: true });
    assert.equal(saleNoHw.soldCount, 2);
    assert.equal(saleNoHw.highwayBonus, false);
    assert.equal(saleNoHw.earned, 20, 'Pinho (9) + Carvalho Nobre (11) = 20 moedas sem rodovia');

    // Conectar estrada da Rodovia Regional até a Madeireira (-4, 2) ativa +35% Bônus Rodovia!
    const hwX = Math.round(MO.chunkManager.getHighwayCenterX(2, 4280) + 2);
    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: hwX, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: -4, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: -4, z: 2 });

    assert.equal(MO.forestryManager.deliverDisplayBundle('pine'), true);
    assert.equal(MO.forestryManager.deliverDisplayBundle('oak'), true);
    const saleWithHw = MO.forestryManager.sellDisplayedWood({ silent: true });
    assert.equal(saleWithHw.highwayBonus, true, 'Com pista ligada à Rodovia Regional, Madeireira deve ganhar Bônus Rodovia');
    assert.equal(saleWithHw.earned, 27, '20 * 1.35 = 27 moedas com Bônus Rodovia');

    // 6. Persistência da Madeireira e expositores no Continuar Cidade
    MO.forestryManager.deliverDisplayBundle('birch');
    MO.cityManager.saveCityState();
    MO.cityManager.startCityGame({ supervisorName: 'Temp', seed: 1111, biome: 'forest', skipSave: true });
    assert.equal(MO.forestryManager.state.woodshop.placed, false);
    assert.equal(MO.cityManager.continueCityGame(), true);
    assert.equal(MO.forestryManager.state.woodshop.placed, true, 'Madeireira deve persistir no Continuar Cidade');
    assert.equal(MO.forestryManager.state.woodshop.completed, true);
    assert.equal(MO.forestryManager.state.woodshop.displayedBundles.length, 1, 'Lotes expostos devem persistir no save');
});

test('Pedreira & Mineração 3D: fratura de rocha em 4 pedaços, entulho, prospecção, Britador (3p), Fundição (16p), Quartzo e Bônus Rodovia', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Pioneiro Beto', seed: 4280, biome: 'forest', sandboxMode: true });

    // 1. Promove rocha/minério do chunk, aplica golpes de picareta e fratura em 4 pedaços físicos com gravidade
    const oreNodes = MO.chunkManager.getLoadedResourceNodes().filter(n => n.kind === 'stone' || n.kind === 'iron' || n.kind === 'mine');
    assert.ok(oreNodes.length > 0);
    const rock = MO.miningManager.promoteChunkRock(oreNodes[0]);
    assert.equal(rock.status, 'intact');
    const hitsNeeded = rock.hp;
    for (let h = 0; h < hitsNeeded; h++) MO.miningManager.applyPickaxeHit(rock);
    assert.equal(rock.status, 'rubble', 'Rocha deve fraturar em entulho após esgotar HP');
    assert.equal(MO.miningManager.state.groundChunks.length, 4, 'Rocha fraturada deve gerar 4 pedaços físicos');
    for (let s = 0; s < 60; s++) MO.miningManager.update(0.05);
    assert.ok(MO.miningManager.state.groundChunks.every(c => c.grounded), 'Todos os 4 pedaços devem pousar no terreno');

    // 2. Limpeza de entulho remove base residual da rocha
    for (let r = 0; r < 2; r++) MO.miningManager.applyRubbleHit(rock);
    assert.equal(rock.rubbleCleared, true, 'Entulho deve ser limpo após 2 golpes de pá');

    // 3. Prospecção cria novos veios no terreno
    const prospected = MO.miningManager.prospectNewVeins(3, { x: 0, z: 0 });
    assert.ok(prospected >= 1, 'Prospecção deve gerar novos afloramentos');

    // 4. Britador montado em 3 peças + animação da Serra Diamantada
    MO.cityManager.placeProductiveStructure('crusher', { x: -2, z: 4 });
    const cr = MO.miningManager.state.crusher;
    assert.equal(cr.placed, true);
    assert.equal(cr.built, false);
    assert.equal(cr.buildQueue.length, 3);
    for (let p = 0; p < 3; p++) MO.miningManager.installNextCrusherPiece();
    assert.equal(cr.built, true, 'Britador deve concluir após 3 peças');
    MO.miningManager.animateCrusher(true, 0.1, 0.5);
    assert.equal(cr.progressBarFill.visible, true, 'Barra de progresso 3D do Britador deve ativar durante corte');
    MO.miningManager.animateCrusher(false, 0, null);

    // 5. Galpão de Pedra & Fundição montado peça por peça (16 peças) + exposição de Granito/Ouro/Quartzo + Bônus Rodovia (+35%)
    MO.cityManager.placeProductiveStructure('mineral-depot', { x: -4, z: 2 });
    const dp = MO.miningManager.state.depot;
    assert.equal(dp.placed, true);
    assert.equal(dp.completed, false);
    assert.equal(dp.buildQueue.length, 16);
    for (let p = 0; p < dp.buildQueue.length; p++) MO.miningManager.installNextDepotPiece();
    assert.equal(dp.completed, true, 'Fundição deve inaugurar após instalar todas as 16 peças');

    assert.equal(MO.miningManager.deliverDisplayMineral('granite'), true);
    assert.equal(MO.miningManager.deliverDisplayMineral('gold'), true);
    assert.equal(MO.miningManager.deliverDisplayMineral('crystal'), true);
    assert.equal(dp.displayedMinerals.length, 3);
    const saleNoHw = MO.miningManager.sellDisplayedMinerals({ silent: true });
    assert.equal(saleNoHw.soldCount, 3);
    assert.equal(saleNoHw.highwayBonus, false);
    assert.equal(saleNoHw.earned, 70, 'Granito (10) + Ouro (26) + Quartzo (34) = 70 moedas sem rodovia');

    // Conectar estrada da Rodovia Regional até a Fundição (-4, 2) ativa +35% Bônus Rodovia!
    const hwX = Math.round(MO.chunkManager.getHighwayCenterX(2, 4280) + 2);
    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: hwX, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: -4, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: -4, z: 2 });

    MO.miningManager.deliverDisplayMineral('granite');
    MO.miningManager.deliverDisplayMineral('iron');
    const saleWithHw = MO.miningManager.sellDisplayedMinerals({ silent: true });
    assert.equal(saleWithHw.highwayBonus, true, 'Com pista ligada à Rodovia Regional, Fundição deve ganhar Bônus Rodovia');
    assert.equal(saleWithHw.earned, Math.round(25 * 1.35), '25 * 1.35 = 34 moedas com Bônus Rodovia');

    // 6. Persistência de Britador, Fundição e estoque exposto no Continuar Cidade
    MO.miningManager.deliverDisplayMineral('gold');
    MO.cityManager.saveCityState();
    MO.cityManager.startCityGame({ supervisorName: 'Temp', seed: 1111, biome: 'forest', skipSave: true });
    assert.equal(MO.miningManager.state.crusher.placed, false);
    assert.equal(MO.miningManager.state.depot.placed, false);
    assert.equal(MO.cityManager.continueCityGame(), true);
    assert.equal(MO.miningManager.state.crusher.built, true, 'Britador deve persistir no Continuar Cidade');
    assert.equal(MO.miningManager.state.depot.completed, true, 'Fundição deve persistir no Continuar Cidade');
    assert.equal(MO.miningManager.state.depot.displayedMinerals.length, 1, 'Minérios expostos devem persistir no save');
});

test('Fazenda & Colheita 3D: lavoura contígua (6 estágios), chuva auto-irrigando, Poço (3), Triagem (3), Celeiro+Silo (14) e Bônus Rodovia', () => {
    const MO = bootCityApp();
    MO.cityManager.startCityGame({ supervisorName: 'Pioneiro Beto', seed: 4280, biome: 'forest', sandboxMode: true });

    // 1. Abre 2 blocos contíguos da lavoura e avança pelos estágios físicos completos
    MO.cityManager.placeProductiveStructure('farm-plot', { x: 6, z: 2 });
    MO.cityManager.placeProductiveStructure('farm-plot', { x: 6, z: 2 });
    assert.equal(MO.farmingManager.state.plots.length, 2, 'Deve abrir 2 blocos encaixados da lavoura');

    const p0 = MO.farmingManager.state.plots[0];
    const p1 = MO.farmingManager.state.plots[1];
    assert.equal(p0.status, 'overgrown');
    assert.equal(MO.farmingManager.advancePlotStage(p0), 'cleared');
    assert.equal(MO.farmingManager.advancePlotStage(p0), 'tilled');
    assert.equal(MO.farmingManager.advancePlotStage(p0), 'seeded');
    assert.equal(MO.farmingManager.advancePlotStage(p0), 'growing');

    // Bloco p1 semeado é auto-irrigado pela chuva!
    MO.farmingManager.advancePlotStage(p1); // cleared
    MO.farmingManager.advancePlotStage(p1); // tilled
    MO.farmingManager.advancePlotStage(p1); // seeded
    MO.state.weather = 'rain';
    MO.farmingManager.update(1.0, 1.0);
    assert.equal(p1.status, 'growing', 'Chuva deve irrigar automaticamente blocos semeados');

    // Cresce p0 até ficar maduro ('ripe') e colhe gerando cesto físico + comida na cidade
    for (let s = 0; s < 80 && p0.status === 'growing'; s++) MO.farmingManager.update(1.0, s);
    assert.equal(p0.status, 'ripe', 'Cultura irrigada deve amadurecer até ficar pronta para colheita');
    const foodBefore = MO.state.economy.food;
    assert.equal(MO.farmingManager.advancePlotStage(p0), 'harvested');
    assert.ok(MO.state.economy.food > foodBefore, 'Colheita deve abastecer comida da cidade');
    assert.equal(MO.farmingManager.state.harvestBundles.length, 1, 'Colheita deve gerar cesto físico no chão');
    for (let s = 0; s < 50; s++) MO.farmingManager.update(0.05, s);
    assert.equal(MO.farmingManager.state.harvestBundles[0].grounded, true, 'Cesto colhido deve pousar no terreno');

    // 2. Poço d'Água (3 etapas) e Bancada de Triagem (3 peças + barra 3D)
    MO.cityManager.placeProductiveStructure('farm-well', { x: 2, z: -2 });
    const wl = MO.farmingManager.state.well;
    assert.equal(wl.buildQueue.length, 3);
    for (let i = 0; i < 3; i++) MO.farmingManager.installNextWellPiece();
    assert.equal(wl.built, true, 'Poço deve concluir após 3 etapas');

    MO.cityManager.placeProductiveStructure('farm-bench', { x: 2, z: 4 });
    const bn = MO.farmingManager.state.bench;
    assert.equal(bn.buildQueue.length, 3);
    for (let i = 0; i < 3; i++) MO.farmingManager.installNextBenchPiece();
    assert.equal(bn.built, true, 'Triagem deve concluir após 3 peças');
    MO.farmingManager.animateBench(true, 0.5);
    assert.equal(bn.progressBarFill.visible, true, 'Barra de progresso 3D da Triagem deve ativar durante embalagem');
    MO.farmingManager.animateBench(false, null);

    // 3. Celeiro & Feira Agrícola com Silo (14 peças) + exposição de caixotes + Bônus Rodovia (+35%)
    MO.cityManager.placeProductiveStructure('farm-barn', { x: -4, z: 2 });
    const br = MO.farmingManager.state.barn;
    assert.equal(br.buildQueue.length, 14);
    for (let i = 0; i < br.buildQueue.length; i++) MO.farmingManager.installNextBarnPiece();
    assert.equal(br.completed, true, 'Celeiro deve inaugurar após 14 peças');

    assert.equal(MO.farmingManager.deliverDisplayCrate('wheat'), true);
    assert.equal(MO.farmingManager.deliverDisplayCrate('pumpkin'), true);
    const saleNoHw = MO.farmingManager.sellDisplayedHarvest({ silent: true });
    assert.equal(saleNoHw.soldCount, 2);
    assert.equal(saleNoHw.highwayBonus, false);
    assert.equal(saleNoHw.earned, 28, 'Trigo (10) + Abóbora (18) = 28 moedas sem rodovia');

    // Conectar estrada da Rodovia Regional até o Celeiro (-4, 2) ativa +35% Bônus Rodovia!
    const hwX = Math.round(MO.chunkManager.getHighwayCenterX(2, 4280) + 2);
    MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: hwX, z: 2 });
    MO.cityManager.handlePlacementPointerMove({ x: -4, z: 2 });
    MO.cityManager.handlePlacementPointerUp({ x: -4, z: 2 });

    MO.farmingManager.deliverDisplayCrate('corn');
    MO.farmingManager.deliverDisplayCrate('sunflower');
    const saleWithHw = MO.farmingManager.sellDisplayedHarvest({ silent: true });
    assert.equal(saleWithHw.highwayBonus, true, 'Com estrada ligada à Rodovia Regional, Feira deve ganhar Bônus Rodovia');
    assert.equal(saleWithHw.earned, Math.round(28 * 1.35), '28 * 1.35 = 38 moedas com Bônus Rodovia');

    // 4. Persistência completa (Lavoura, Poço, Triagem, Celeiro e caixotes) no Continuar Cidade
    MO.farmingManager.deliverDisplayCrate('carrot');
    MO.cityManager.saveCityState();
    MO.cityManager.startCityGame({ supervisorName: 'Temp', seed: 1111, biome: 'forest', skipSave: true });
    assert.equal(MO.farmingManager.state.plots.length, 0);
    assert.equal(MO.cityManager.continueCityGame(), true);
    assert.equal(MO.farmingManager.state.plots.length, 2, 'Blocos da lavoura devem persistir no save');
    assert.equal(MO.farmingManager.state.well.built, true, 'Poço deve persistir no save');
    assert.equal(MO.farmingManager.state.bench.built, true, 'Triagem deve persistir no save');
    assert.equal(MO.farmingManager.state.barn.completed, true, 'Celeiro deve persistir no save');
    assert.equal(MO.farmingManager.state.barn.displayedCrates.length, 1, 'Caixotes expostos devem persistir no save');
});

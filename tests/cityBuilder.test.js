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
        Mesh, LineSegments: class extends Mesh {}, Points: class extends Mesh {},
        Sprite: class extends Object3D { constructor(m = new Material()) { super(); this.isSprite = true; this.geometry = new BufferGeometry(); this.material = m; } },
        BufferGeometry, BoxGeometry: BufferGeometry, CylinderGeometry: BufferGeometry, SphereGeometry: BufferGeometry,
        ConeGeometry: BufferGeometry, DodecahedronGeometry: BufferGeometry, IcosahedronGeometry: BufferGeometry,
        PlaneGeometry: BufferGeometry, RingGeometry: BufferGeometry, TubeGeometry: BufferGeometry, ExtrudeGeometry: BufferGeometry,
        Shape: class { moveTo() {} lineTo() {} closePath() {} }, CatmullRomCurve3: class {},
        BufferAttribute, Float32BufferAttribute: BufferAttribute, CanvasTexture: Texture,
        MeshStandardMaterial: Material, MeshBasicMaterial: Material, LineBasicMaterial: Material, PointsMaterial: Material, SpriteMaterial: Material,
        Color, Vector3, Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
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

    // Celular do Gestor exige via conectada até a Baia para o caminhão entrar seguindo a estrada
    assert.equal(MO.togglePhonePanel(true), true);
    assert.equal(MO.requestSupplyTruck('bricks', true), false, 'Sem via conectada na Baia (-4,4), caminhão não deve cortar pelo mato');
    // Conecta estrada reta até a Baia (-4,4) -> (-1,4)
    if (MO.state.city.activeBuildTool !== 'dirt-road') MO.cityManager.setActiveBuildTool('dirt-road');
    MO.cityManager.handlePlacementPointerDown({ x: -1.0, z: 4.0 });
    MO.cityManager.handlePlacementPointerMove({ x: -4.0, z: 4.0 });
    MO.cityManager.handlePlacementPointerUp({ x: -4.0, z: 4.0 });
    assert.equal(MO.requestSupplyTruck('bricks', true), true, 'Com estrada conectada à Baia, caminhão deve seguir a via');
    assert.equal(MO.state.site.truckActive, true);
    assert.ok(Array.isArray(MO.state.site.truckRoute) && MO.state.site.truckRoute.length >= 3, 'Caminhão deve possuir rota ponto-a-ponto nas ruas do jogador');

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

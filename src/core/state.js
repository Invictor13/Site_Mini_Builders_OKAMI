// =========================================================================
// CORE: CONSTANTES, REGISTRY DE MODOS E ESTADO GLOBAL COMPARTILHADO
// =========================================================================
(function(MO) {
    MO.DIORAMA_R = 9.2;
    MO.GRID_SIZE = 10;          // Grade 10x10 metros
    MO.GRID_OFFSET_Z = -0.8;    // Desloca ligeiramente para trás do lago
    MO.PLATEAU_Y = 0.28;        // Altura alvo de terraplanagem
    MO.WATER_LEVEL = -0.36;     // Nível do lago / rio reflexivo
    MO.WALL_HEIGHT = 1.80;      // Altura das paredes da casa

    MO.LEVEL_RES = 45;          // Resolução do mapa de terraplanagem
    MO.levelMap = new Float32Array(MO.LEVEL_RES * MO.LEVEL_RES);

    MO.STATION_MIXER = { x: -5.9, z: 0.6 };
    MO.STATION_REBAR = { x: -4.8, z: 3.5 };
    MO.STATION_BRICK = { x: 6.0, z: 0.5 };
    MO.STATION_TIMBER = { x: 4.9, z: 2.3 };

    MO.modes = {};
    MO.MODE_ORDER = ['house', 'bridge', 'building', 'tower'];
    MO.BIOME_ORDER = ['forest', 'coast', 'cerrado', 'mountain'];

    MO.state = {
        mode: 'house',
        variant: 'L-shape',        // Variante arquitetônica sorteada ou selecionada
        biome: 'forest',           // 'forest' | 'coast' | 'cerrado' | 'mountain'
        weather: 'clear',          // 'clear' | 'rain' | 'wind'
        riskProfile: 'realistic',  // 'calm' (100% OK) | 'realistic' (imprevistos & risco de queda)
        seed: Math.floor(1000 + Math.random() * 8999),
        phase: 0,
        tool: 'clear-weeds',
        xray: false,
        screensaver: false,
        playlist: true,
        zenMode: false,
        muted: false,              // Mudo para efeitos da obra (martelo, pá, etc.)
        ambientMuted: true,        // Som ambiente ASMR (começa mutado até usuário ativar ou interagir)
        timeOfDay: 0.22,
        cycleDayNight: true,
        isNight: false,
        screensaverCompletedTime: 0,
        brickType: 'standard',
        paintColorHex: '#f1f5f9',

        // Integridade Estrutural, Eventos Aleatórios & Colapso
        structural: {
            integrity: 100,
            issues: [],
            collapsed: false,
            collapseTimer: 0,
            repairedOnce: false,
            mixerTarpCovered: false,
            waterTablePumped: true,
            laudoStatus: null      // null | 'approved' | 'failed'
        },
        events: {
            timer: 10,
            active: null,
            bannerTimer: 0
        },

        // Fase 0: Mato, Arbustos, Pedras Soltas & Pontos de Terraplanagem do Lote
        weeds: [],
        levelTargets: [],
        levelProgress: 0,

        // Masseira & Balde
        sand: 0,
        cement: 0,
        water: 0,
        mixProgress: 0,
        mortarCharges: 0,
        bucketCharges: 0,
        mixerWorkerBusy: false,

        // Modo Casa
        houseBaseY: MO.PLATEAU_Y,
        occupiedCells: new Set(),
        columns: [],
        walls: [],
        muros: [],
        stairs: [],
        floorTiles: [],
        elecNodes: [],
        elecConduits: [],
        elecLights: [],
        elecPowerOn: false,
        plumbNodes: [],
        plumbPipes: [],
        waterFlowActive: false,
        leakPoints: [],
        tankBusy: false,
        fixBusy: false,
        sewageBusy: false,
        roofStage: 0,
        roofWorkerBusy: false,
        furnitureBuilt: false,

        // Modo Ponte
        bridge: {
            abutments: [],
            piers: [],
            girders: [],
            decks: [],
            rails: [],
            lamps: [],
            truck: null,
            truckTesting: false,
            truckProgress: 0,
            loadPassed: false,
            centerSpanGroup: null
        },

        // Modo Prédio Multi-Andar
        building: {
            numFloors: 3,
            floorCut: 3,
            crane: null,
            craneTargetAngle: 0,
            craneAngle: 0,
            floors: [],
            roofDone: false,
            roofBusy: false
        },

        // Modo Torre Treliçada
        tower: {
            footings: [],
            tiers: [],
            topDeck: null,
            topInstalled: false,
            topBusy: false,
            beaconLight: null,
            beaconMesh: null,
            windTesting: false,
            windPhase: 0,
            windAmplitude: 0,
            windPassed: false,
            towerPivot: null
        },

        // Logística de Canteiro & Clima
        site: {
            truckMesh: null,
            truckActive: false,
            truckProgress: 0,
            truckCargo: null,
            truckQueue: [],
            truckDropped: false,
            wheelbarrowMesh: null,
            tarpMesh: null,
            rainDrops: [],
            birds: [],
            swayingTrees: [],
            debris: [],
            fireflies: [],
            tracks: [],
            ripples: [],
            ambientMotes: []
        },

        // Área de Vivência dos NPCs (Barracas, Refeitório, Bebedouro & Refletores)
        camp: {
            nightMode: 'rotate',    // 'rotate' (revezamento + refletores) | 'sleep' (todos dormem de noite)
            tents: [],
            messHall: null,
            waterCooler: null,
            stoveSpot: null,
            floodlights: [],
            campLight: null,
            steamTimer: 0
        },

        // Objetos Físicos
        looseRebars: [],
        looseBeams: [],
        draggableSupplies: [],
        looseBricks: [],
        selectedBrickInHand: null,
        draggedItem: null,

        // Trabalhadores & FX
        workers: [],
        animatedBricks: [],
        particles: [],
        isStirringMixer: false,
        isLevelingTerrain: false,
        lastStirPos: new THREE.Vector2(),
        lastScrapeTime: 0,
        lastShovelTime: 0
    };
})(window.MO = window.MO || {});

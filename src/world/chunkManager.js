// =========================================================================
// WORLD: STREAMING DE TERRENO PROCEDURAL INFINITO, ECOSSISTEMAS 2.0 & PERSISTÊNCIA
// =========================================================================
(function(MO) {
    const CHUNK_SIZE = 24;
    const CHUNK_SEG = 20;
    const VIEW_RADIUS = 3; // Grade 7x7 = 168m x 168m ao redor da câmera

    const chunks = new Map();        // key "cx,cz" -> { cx, cz, key, group, mesh, nodesGroup, resourceNodes }
    const resourceNodes = new Map(); // id -> nó carregado atualmente em memória
    const modifiedNodes = new Map(); // id -> { id, chunkKey, kind, x, z, amount, maxAmount } (persistente)
    const levelCells = new Map();    // key "gx,gz" -> { weight, targetY }
    const roadCells = new Map();     // key "gx,gz" -> { gx, gz, kind: 'dirt'|'paved', built: boolean }
    const clearedAreas = [];         // [{ x, z, r }] áreas onde construções limparam vegetação permanentemente
    let replantedCount = 0;          // Total de mudas replantadas no ciclo da madeira

    let infiniteWaterMesh = null;
    let lastFocusChunkX = null;
    let lastFocusChunkZ = null;
    let sharedTerrainMat = null;
    let sharedIronMat = null;
    let sharedBirchMat = null;
    let sharedFoamMat = null;
    let sharedStumpMat = null;
    let sharedFloraAssets = null;
    let sharedTreeGeos = null;
    let sharedHighwayAssets = null;
    let sharedVertexLeafMat = null;
    let sharedVertexFlowerMat = null;
    const sharedTreeMats = new Map();
    const _tmpInstColor = typeof THREE !== 'undefined' && typeof THREE.Color === 'function' ? new THREE.Color() : null;

    // Buffers temporários reutilizados na composição de matrizes instanciadas
    const _m4 = typeof THREE !== 'undefined' && typeof THREE.Matrix4 === 'function' ? new THREE.Matrix4() : null;
    const _vPos = typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function' ? new THREE.Vector3() : null;
    const _vScl = typeof THREE !== 'undefined' && typeof THREE.Vector3 === 'function' ? new THREE.Vector3() : null;
    const _quat = typeof THREE !== 'undefined' && typeof THREE.Quaternion === 'function' ? new THREE.Quaternion() : null;
    const _euler = typeof THREE !== 'undefined' && typeof THREE.Euler === 'function' ? new THREE.Euler() : null;

    function hash2D(ix, iz, seed) {
        let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
        n = (n ^ (n >>> 13)) >>> 0;
        n = Math.imul(n, 1274126177) >>> 0;
        return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    function valueNoise2D(x, z, seed) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const fx = x - ix;
        const fz = z - iz;
        const u = fx * fx * (3 - 2 * fx);
        const v = fz * fz * (3 - 2 * fz);
        const a = hash2D(ix, iz, seed);
        const b = hash2D(ix + 1, iz, seed);
        const c = hash2D(ix, iz + 1, seed);
        const d = hash2D(ix + 1, iz + 1, seed);
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }

    function fbm(x, z, seed) {
        let val = 0;
        let amp = 0.55;
        let freq = 0.08;
        for (let o = 0; o < 4; o++) {
            val += (valueNoise2D(x * freq, z * freq, seed + o * 101) - 0.5) * 2 * amp;
            freq *= 2.05;
            amp *= 0.48;
        }
        return val;
    }

    const HIGHWAY_HALF_W = 2.35; // 4.7m total = 2 faixas + acostamento

    function getHighwayCenterX(z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        const shift = ((s % 7) - 3) * 0.55 - 16.5;
        return shift + Math.sin(z * 0.042 + (s % 11)) * 3.4 + Math.cos(z * 0.019) * 2.1;
    }

    function getHighwayHeight(z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        return 0.42 + Math.sin(z * 0.032 + (s % 5)) * 0.14;
    }

    function isNearHighway(x, z, margin = 2.2, seed) {
        const hx = getHighwayCenterX(z, seed);
        return Math.abs(x - hx) <= (HIGHWAY_HALF_W + margin);
    }

    function getInfiniteRiverX(z, seed) {
        const s = seed !== undefined ? seed : MO.state.seed;
        const shift = ((s % 9) - 4) * 0.8 + 23.0;
        return shift + Math.sin(z * 0.075 + (s % 13)) * 4.4 + Math.cos(z * 0.028) * 5.2;
    }

    function getRiverHalfWidth(z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        return 2.75 + Math.sin(z * 0.09 + (s % 7)) * 0.62;
    }

    function ridgeNoise(x, z, seed) {
        const v = valueNoise2D(x, z, seed);
        const r = 1 - Math.abs(v * 2 - 1);
        return r * r;
    }

    function getTerrainMasks(x, z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        const macro = valueNoise2D(x * 0.017, z * 0.017, s + 31);
        const mountainMask = Math.max(0, Math.min(1, (valueNoise2D(x * 0.023, z * 0.023, s + 307) - 0.45) / 0.45));
        const moisture = valueNoise2D(x * 0.032, z * 0.032, s + 701);
        const forestMask = valueNoise2D(x * 0.044, z * 0.044, s + 911);
        const meadowMask = valueNoise2D(x * 0.065, z * 0.065, s + 1201);
        return { macro, mountainMask, moisture, forestMask, meadowMask };
    }

    // Trilha natural orgânica partindo da clareira central rumo ao bosque e margem do rio
    function getNaturalTrailFactor(x, z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        const pathEastZ = Math.sin(x * 0.14 + (s % 5)) * 2.2 - 1.5;
        const dEast = (x > 2 && x < 21) ? Math.abs(z - pathEastZ) : 99;
        const pathWestZ = Math.cos(x * 0.12 + (s % 7)) * 2.4 + 2.0;
        const dWest = (x < -2 && x > -26) ? Math.abs(z - pathWestZ) : 99;
        const pathNorthX = Math.sin(z * 0.11 + (s % 9)) * 2.0 - 1.0;
        const dNorth = (z < -2 && z > -24) ? Math.abs(x - pathNorthX) : 99;
        const minD = Math.min(dEast, dWest, dNorth);
        if (minD >= 1.35) return 0;
        const t = 1 - minD / 1.35;
        return t * t;
    }

    function isInClearedArea(x, z) {
        for (let i = 0; i < clearedAreas.length; i++) {
            const a = clearedAreas[i];
            const dx = x - a.x;
            const dz = z - a.z;
            if (dx * dx + dz * dz <= a.r * a.r) return true;
        }
        return false;
    }

    function isSpotBlockedByInfra(x, z, seed) {
        if (isInClearedArea(x, z)) return true;
        if (isNearHighway(x, z, 2.0, seed)) return true;
        const key = `${Math.floor(x)},${Math.floor(z)}`;
        if (roadCells.has(key)) return true;
        const lvl = levelCells.get(key);
        if (lvl && lvl.weight > 0.35) return true;
        if (getNaturalTrailFactor(x, z, seed) > 0.34) return true;
        return false;
    }

    function getProceduralHeight(x, z) {
        const s = MO.state ? MO.state.seed : 1234;
        const { macro, mountainMask } = getTerrainMasks(x, z, s);

        const rx = getInfiniteRiverX(z, s);
        const riverHalfW = getRiverHalfWidth(z, s);
        const distRiver = Math.abs(x - rx);
        const riverMountainAtten = Math.min(1, Math.max(0, (distRiver - riverHalfW - 1.2) / 6.5));

        const hwX = getHighwayCenterX(z, s);
        const distHw = Math.abs(x - hwX);
        const hwMountainAtten = Math.min(1, Math.max(0, (distHw - HIGHWAY_HALF_W - 1.5) / 7.0));

        // Camada 1: Geografia multi-escala (macro-vale + terraços férteis + cordilheiras dramáticas + micro-relevo)
        const hMacro = (macro - 0.42) * 1.48;
        const rawHills = fbm(x, z, s) * 0.96;
        const terracedHills = rawHills * 0.62 + (Math.round(rawHills * 2.6) / 2.6) * 0.38;
        const ridge = ridgeNoise(x * 0.052, z * 0.052, s + 503) * 0.66 + ridgeNoise(x * 0.105, z * 0.105, s + 613) * 0.34;
        const hMountains = Math.pow(mountainMask, 1.26) * ridge * 7.4 * riverMountainAtten * hwMountainAtten;
        const hDetails = (valueNoise2D(x * 0.19, z * 0.19, s + 809) - 0.5) * 0.24;

        let h = 0.36 + hMacro + terracedHills + hMountains + hDetails;

        // Clareira central edificável no vale entre a Rodovia (Oeste) e o Rio (Leste)
        const dOrigin = Math.hypot(x, z);
        if (dOrigin < 15.5) {
            const t = 1 - dOrigin / 15.5;
            const smooth = t * t * (3 - 2 * t);
            h = h * (1 - smooth * 0.85) + MO.PLATEAU_Y * (smooth * 0.85);
        }

        // Camada 2: Hidrografia — Rio sinuoso escavado até o leito + margens suaves + lagos naturais
        if (distRiver < riverHalfW) {
            const t = 1 - distRiver / riverHalfW;
            const carve = t * t * (3 - 2 * t);
            const bedTarget = (MO.WATER_LEVEL || -0.36) - 0.64;
            h = h * (1 - carve) + bedTarget * carve;
        } else if (distRiver < riverHalfW + 1.95) {
            const bankT = (distRiver - riverHalfW) / 1.95;
            const bankTarget = Math.min(h, 0.28 + bankT * 0.26);
            h = h * bankT + bankTarget * (1 - bankT);
        } else if (dOrigin > 28.0 && distHw > HIGHWAY_HALF_W + 5.0 && macro < 0.16 && mountainMask < 0.08) {
            const lakeDepth = (0.16 - macro) / 0.16;
            h = Math.min(h, 0.15 - lakeDepth * 0.85);
        }

        // Camada 3: Corredor da Rodovia Regional (aterro/talude suave ao longo do mundo infinito)
        const hwY = getHighwayHeight(z, s);
        if (distHw < HIGHWAY_HALF_W + 0.65) {
            h = hwY;
        } else if (distHw < HIGHWAY_HALF_W + 3.6) {
            const bt = (distHw - (HIGHWAY_HALF_W + 0.65)) / 2.95;
            const smooth = bt * bt * (3 - 2 * bt);
            h = hwY * (1 - smooth) + h * smooth;
        }

        const key = `${Math.floor(x)},${Math.floor(z)}`;
        const road = roadCells.get(key);
        if (road && road.built) {
            h = MO.PLATEAU_Y;
        }
        const lvl = levelCells.get(key);
        if (lvl && lvl.weight > 0.01) {
            h = h * (1 - lvl.weight) + lvl.targetY * lvl.weight;
        }

        return Math.max(-1.15, Math.min(7.2, h));
    }

    function getTerrainMaterial() {
        if (!sharedTerrainMat) {
            sharedTerrainMat = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.86,
                metalness: 0.03,
                flatShading: true
            });
            if (MO.resources) MO.resources.protect(sharedTerrainMat);
        }
        return sharedTerrainMat;
    }

    function getIronOreMat() {
        if (!sharedIronMat) {
            sharedIronMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.72, roughness: 0.32 });
            if (MO.resources) MO.resources.protect(sharedIronMat);
        }
        return sharedIronMat;
    }

    function getBirchTrunkMat() {
        if (!sharedBirchMat) {
            sharedBirchMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.88, flatShading: true });
            if (MO.resources) MO.resources.protect(sharedBirchMat);
        }
        return sharedBirchMat;
    }

    function getWaterFoamMat() {
        if (!sharedFoamMat) {
            sharedFoamMat = new THREE.MeshStandardMaterial({
                color: 0xe0f2fe,
                roughness: 0.35,
                transparent: true,
                opacity: 0.72,
                flatShading: true
            });
            if (MO.resources) MO.resources.protect(sharedFoamMat);
        }
        return sharedFoamMat;
    }

    function getStumpMat() {
        if (!sharedStumpMat) {
            sharedStumpMat = new THREE.MeshStandardMaterial({ color: 0x785233, roughness: 0.94, flatShading: true });
            if (MO.resources) MO.resources.protect(sharedStumpMat);
        }
        return sharedStumpMat;
    }

    function getTreeMat(biomeId, hex) {
        const key = `${biomeId}|${hex}`;
        if (sharedTreeMats.has(key)) return sharedTreeMats.get(key);
        const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.88, flatShading: true });
        if (MO.resources) MO.resources.protect(mat);
        sharedTreeMats.set(key, mat);
        return mat;
    }

    function getInstancedLeafMat() {
        if (!sharedVertexLeafMat) {
            sharedVertexLeafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, flatShading: true });
            if (MO.resources) MO.resources.protect(sharedVertexLeafMat);
        }
        return sharedVertexLeafMat;
    }

    function getInstancedFlowerMat() {
        if (!sharedVertexFlowerMat) {
            sharedVertexFlowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
            if (MO.resources) MO.resources.protect(sharedVertexFlowerMat);
        }
        return sharedVertexFlowerMat;
    }

    function getSharedTreeGeos() {
        if (sharedTreeGeos) return sharedTreeGeos;
        sharedTreeGeos = {
            trunkGeo: new THREE.CylinderGeometry(0.09, 0.16, 1.0, 6),
            pineGeo: new THREE.ConeGeometry(0.75, 1.0, 6),
            oakGeo: new THREE.IcosahedronGeometry(0.68, 0),
            ancientGeo: new THREE.DodecahedronGeometry(1.12, 0),
            stumpGeo: new THREE.CylinderGeometry(0.14, 0.21, 0.28, 6),
            rockGeo: new THREE.DodecahedronGeometry(0.50, 0),
            mineHillGeo: new THREE.DodecahedronGeometry(1.05, 0),
            caveHoleGeo: new THREE.BoxGeometry(0.72, 0.72, 0.36),
            minePostGeo: new THREE.BoxGeometry(0.10, 0.82, 0.10),
            mineLintelGeo: new THREE.BoxGeometry(0.88, 0.10, 0.12),
            veinGeo: new THREE.DodecahedronGeometry(0.20, 0),
            cartGeo: new THREE.BoxGeometry(0.40, 0.25, 0.36),
            logGeo: new THREE.CylinderGeometry(0.14, 0.16, 1.45, 6),
            holeMat: MO.mats.hole || new THREE.MeshBasicMaterial({ color: 0x090d16 })
        };
        if (MO.resources) {
            MO.resources.protect(
                sharedTreeGeos.trunkGeo, sharedTreeGeos.pineGeo, sharedTreeGeos.oakGeo,
                sharedTreeGeos.ancientGeo, sharedTreeGeos.stumpGeo, sharedTreeGeos.rockGeo,
                sharedTreeGeos.mineHillGeo, sharedTreeGeos.caveHoleGeo, sharedTreeGeos.minePostGeo,
                sharedTreeGeos.mineLintelGeo, sharedTreeGeos.veinGeo, sharedTreeGeos.cartGeo,
                sharedTreeGeos.logGeo, sharedTreeGeos.holeMat
            );
        }
        return sharedTreeGeos;
    }

    function getSharedFloraAssets() {
        if (sharedFloraAssets) return sharedFloraAssets;
        sharedFloraAssets = {
            grassGeo: new THREE.ConeGeometry(0.12, 0.32, 4),
            grassMat: new THREE.MeshStandardMaterial({ color: 0x6ab03b, roughness: 0.88, flatShading: true }),
            flowerGeo: new THREE.DodecahedronGeometry(0.09, 0),
            flowerMats: [
                new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.65 }),
                new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.65 }),
                new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.65 }),
                new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 })
            ],
            bushGeo: new THREE.IcosahedronGeometry(0.35, 0),
            bushMat: new THREE.MeshStandardMaterial({ color: 0x3f842c, roughness: 0.90, flatShading: true }),
            mushCapGeo: new THREE.ConeGeometry(0.20, 0.16, 6),
            mushCapMat: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.72, flatShading: true }),
            mushStemGeo: new THREE.CylinderGeometry(0.05, 0.07, 0.14, 5),
            mushStemMat: new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 }),
            pebbleGeo: new THREE.DodecahedronGeometry(0.19, 0),
            pebbleMat: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88, flatShading: true }),
            reedGeo: new THREE.CylinderGeometry(0.028, 0.048, 0.72, 4),
            reedMat: new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.88, flatShading: true })
        };
        if (MO.resources) {
            MO.resources.protect(
                sharedFloraAssets.grassGeo, sharedFloraAssets.grassMat,
                sharedFloraAssets.flowerGeo, ...sharedFloraAssets.flowerMats,
                sharedFloraAssets.bushGeo, sharedFloraAssets.bushMat,
                sharedFloraAssets.mushCapGeo, sharedFloraAssets.mushCapMat,
                sharedFloraAssets.mushStemGeo, sharedFloraAssets.mushStemMat,
                sharedFloraAssets.pebbleGeo, sharedFloraAssets.pebbleMat,
                sharedFloraAssets.reedGeo, sharedFloraAssets.reedMat
            );
        }
        return sharedFloraAssets;
    }

    function ensureInfiniteWater() {
        if (infiniteWaterMesh || !MO.groups || !MO.groups.diorama) return;
        let tex = MO.waterTex;
        if (!tex && typeof document !== 'undefined') {
            const wc = document.createElement('canvas');
            wc.width = wc.height = 256;
            const wctx = wc.getContext('2d');
            wctx.fillStyle = '#14627e';
            wctx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 420; i++) {
                const isLight = i % 3 !== 0;
                wctx.fillStyle = isLight ? 'rgba(186,230,253,0.16)' : 'rgba(8,47,73,0.18)';
                const x = (hash2D(i, 1, 77) * 256) % 256;
                const y = (hash2D(i, 2, 77) * 256) % 256;
                wctx.fillRect(x, y, 2 + hash2D(i, 3, 77) * 4, 16 + hash2D(i, 4, 77) * 26);
            }
            tex = new THREE.CanvasTexture(wc);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(28, 28);
            MO.waterTex = tex;
        }
        const geo = new THREE.PlaneGeometry(230, 230, 1, 1);
        const mat = new THREE.MeshStandardMaterial({
            map: tex || null,
            color: 0x1e8eb8,
            roughness: 0.14,
            metalness: 0.28,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        infiniteWaterMesh = new THREE.Mesh(geo, mat);
        infiniteWaterMesh.rotation.x = -Math.PI / 2;
        infiniteWaterMesh.position.set(0, MO.WATER_LEVEL + 0.02, 0);
        infiniteWaterMesh.receiveShadow = true;
        MO.groups.diorama.add(infiniteWaterMesh);
        MO.waterSurfaceMesh = infiniteWaterMesh;
        if (MO.resources) MO.resources.protect(geo, mat);
    }

    const cGrassDark = new THREE.Color('#2f6425');
    const cGrassLight = new THREE.Color('#6db33f');
    const cEarthPad = new THREE.Color('#a47e54');
    const cSandShore = new THREE.Color('#d9c796');
    const cWetLoam = new THREE.Color('#475c32');
    const cRoadDirt = new THREE.Color('#8c6844');
    const cRoadPaved = new THREE.Color('#475569');
    const cPondBed = new THREE.Color('#134e63');
    const cRockSlope = new THREE.Color('#73706b');
    const cSnowPeak = new THREE.Color('#f1f5f9');
    const tmpCol = new THREE.Color();

    // Buffer reutilizável de alturas da grade do chunk (evita 3x avaliações redundantes por vértice)
    const GRID_STRIDE = CHUNK_SEG + 2;
    const heightScratch = new Float32Array(GRID_STRIDE * GRID_STRIDE);

    function syncBiomeColors() {
        const state = MO.state;
        const biome = (MO.BIOMES && state && MO.BIOMES[state.biome]) || (MO.BIOMES && MO.BIOMES.forest);
        if (!biome) return;
        cGrassDark.set(biome.grassDark);
        cGrassLight.set(biome.grassLight);
        cEarthPad.set(biome.earthPad);
        cPondBed.set(biome.pondBed);
        cRockSlope.set(biome.rockSlope);
        if (biome.sandShore) cSandShore.set(biome.sandShore);
        if (biome.snowPeak) cSnowPeak.set(biome.snowPeak);
    }

    function updateChunkMeshGeometry(chunk) {
        if (!chunk || !chunk.mesh) return;
        syncBiomeColors();
        const seed = MO.state ? MO.state.seed : 1234;
        const pos = chunk.mesh.geometry.attributes.position;
        const col = chunk.mesh.geometry.attributes.color;
        const ox = chunk.cx * CHUNK_SIZE;
        const oz = chunk.cz * CHUNK_SIZE;
        const seg = CHUNK_SEG;
        const step = CHUNK_SIZE / seg;
        const half = CHUNK_SIZE * 0.5;

        // 1. Pré-calcula todas as alturas (seg+2)x(seg+2) em uma única passada
        for (let iz = 0; iz <= seg + 1; iz++) {
            const wz = oz - half + iz * step;
            const rowOff = iz * GRID_STRIDE;
            for (let ix = 0; ix <= seg + 1; ix++) {
                const wx = ox - half + ix * step;
                heightScratch[rowOff + ix] = getProceduralHeight(wx, wz);
            }
        }

        // 2. Aplica elevações e pintura por vértice (umidade, inclinação, trilha, margem, neve)
        let vIdx = 0;
        for (let iz = 0; iz <= seg; iz++) {
            const wz = oz - half + iz * step;
            const rowOff = iz * GRID_STRIDE;
            const nextRowOff = (iz + 1) * GRID_STRIDE;
            for (let ix = 0; ix <= seg; ix++) {
                const wx = ox - half + ix * step;
                const h = heightScratch[rowOff + ix];
                pos.setY(vIdx, h);

                const key = `${Math.floor(wx)},${Math.floor(wz)}`;
                const road = roadCells.get(key);
                const lvl = levelCells.get(key);

                if (h < MO.WATER_LEVEL + 0.04) {
                    const t = Math.max(0, Math.min(1, (MO.WATER_LEVEL + 0.04 - h) / 0.55));
                    tmpCol.copy(cSandShore).lerp(cPondBed, t);
                } else if (h < MO.WATER_LEVEL + 0.34) {
                    const bankT = (h - (MO.WATER_LEVEL + 0.04)) / 0.30;
                    tmpCol.copy(cSandShore).lerp(cWetLoam, bankT * 0.90);
                } else {
                    const hx = heightScratch[rowOff + ix + 1];
                    const hz = heightScratch[nextRowOff + ix];
                    const slope = (Math.abs(hx - h) + Math.abs(hz - h)) * (0.9 / step);
                    const n = valueNoise2D(wx * 0.22, wz * 0.22, seed + 77);
                    const moisture = valueNoise2D(wx * 0.038, wz * 0.038, seed + 701);
                    const forest = valueNoise2D(wx * 0.044, wz * 0.044, seed + 911);

                    tmpCol.copy(cGrassDark).lerp(cGrassLight, Math.min(1, n * 0.65 + (1 - forest) * 0.35));
                    if (forest > 0.50 && h < 1.9) {
                        tmpCol.lerp(cWetLoam, (forest - 0.50) * 0.78);
                    }
                    if (moisture < 0.36 && h < 1.15) {
                        tmpCol.lerp(cEarthPad, (0.36 - moisture) * 0.72);
                    }
                    const trailT = getNaturalTrailFactor(wx, wz, seed);
                    if (trailT > 0.05 && h > MO.WATER_LEVEL + 0.16) {
                        tmpCol.lerp(cEarthPad, trailT * 0.70);
                    }
                    if (slope > 0.33 || h > 1.75) {
                        const rockBlend = Math.min(0.92, Math.max((slope - 0.33) * 1.45, (h - 1.75) * 0.44));
                        tmpCol.lerp(cRockSlope, rockBlend);
                    }
                    if (h > 4.0) {
                        const snowBlend = Math.min(0.95, (h - 4.0) / 1.45);
                        tmpCol.lerp(cSnowPeak, snowBlend);
                    }
                    if (lvl && lvl.weight > 0.05) tmpCol.lerp(cEarthPad, Math.min(0.85, lvl.weight * 0.75));
                    if (road && road.built) {
                        tmpCol.lerp(road.kind === 'paved' ? cRoadPaved : cRoadDirt, 0.85);
                    }
                    const dHw = Math.abs(wx - getHighwayCenterX(wz, seed));
                    if (dHw < HIGHWAY_HALF_W + 1.2) {
                        const hwBlend = dHw < HIGHWAY_HALF_W ? 0.92 : Math.max(0, 1 - (dHw - HIGHWAY_HALF_W) / 1.2) * 0.65;
                        tmpCol.lerp(cRoadPaved, hwBlend);
                    }
                }
                col.setXYZ(vIdx, tmpCol.r, tmpCol.g, tmpCol.b);
                vIdx++;
            }
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        chunk.mesh.geometry.computeVertexNormals();
    }

    function supportsInstancing() {
        return Boolean(
            typeof THREE !== 'undefined' &&
            typeof THREE.InstancedMesh === 'function' &&
            _m4 && _vPos && _vScl && _quat && _euler
        );
    }

    function composeEntryMatrix(e, scaleMult = 1.0) {
        _vPos.set(e.x, e.y, e.z);
        _euler.set(e.rx || 0, e.ry || 0, e.rz || 0);
        _quat.setFromEuler(_euler);
        _vScl.set((e.sx || 1) * scaleMult, (e.sy || 1) * scaleMult, (e.sz || 1) * scaleMult);
        _m4.compose(_vPos, _quat, _vScl);
        return _m4;
    }

    function appendInstancedBatch(parent, geo, mat, entries, castShadow = false, useInstanceColor = false) {
        if (!entries || entries.length === 0) return null;
        if (supportsInstancing()) {
            const inst = new THREE.InstancedMesh(geo, mat, entries.length);
            inst.castShadow = castShadow;
            inst.receiveShadow = true;
            const canColor = useInstanceColor && typeof inst.setColorAt === 'function' && _tmpInstColor;
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                inst.setMatrixAt(i, composeEntryMatrix(e, 1.0));
                if (canColor && e.color !== undefined) {
                    _tmpInstColor.set(e.color);
                    inst.setColorAt(i, _tmpInstColor);
                }
                if (e.ownerNode) {
                    if (!e.ownerNode.instRefs) e.ownerNode.instRefs = [];
                    e.ownerNode.instRefs.push({ inst, index: i, entry: e });
                }
            }
            if (inst.instanceMatrix) inst.instanceMatrix.needsUpdate = true;
            if (canColor && inst.instanceColor) inst.instanceColor.needsUpdate = true;
            parent.add(inst);
            return inst;
        } else {
            const limit = Math.min(entries.length, 10);
            for (let i = 0; i < limit; i++) {
                const e = entries[i];
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(e.x, e.y, e.z);
                mesh.rotation.set(e.rx || 0, e.ry || 0, e.rz || 0);
                mesh.scale.set(e.sx || 1, e.sy || 1, e.sz || 1);
                parent.add(mesh);
            }
            return null;
        }
    }

    function queueTreePartsToBatches(batches, species, x, y, z, sc, leafHex, rotY, ownerNode = null, simplified = false) {
        const trunkH = (species === 'birch' ? 1.55 : (species === 'pine' ? 1.35 : 1.15)) * sc;
        const trunkKey = species === 'birch' ? 'birchTrunk' : 'woodTrunk';
        const trunkS = sc * (species === 'birch' ? 0.72 : 1.0);
        batches[trunkKey].push({
            x, y: y + trunkH * 0.5, z, ry: rotY, sx: trunkS, sy: trunkH, sz: trunkS, ownerNode
        });

        const pushCrown = (geoKind, hex, entry) => {
            entry.color = hex;
            if (geoKind === 'pine') batches.pineCrowns.push(entry);
            else batches.oakCrowns.push(entry);
        };

        if (species === 'pine') {
            const tiers = simplified
                ? [
                    { y: trunkH * 0.85, s: 1.05 * sc, h: 1.35 * sc, r: rotY },
                    { y: trunkH * 1.45, s: 0.62 * sc, h: 0.95 * sc, r: rotY + 0.6 }
                ]
                : [
                    { y: trunkH * 0.72, s: 1.05 * sc, h: 1.15 * sc, r: rotY },
                    { y: trunkH * 1.16, s: 0.78 * sc, h: 0.96 * sc, r: rotY + 0.55 },
                    { y: trunkH * 1.54, s: 0.52 * sc, h: 0.76 * sc, r: rotY + 1.1 }
                ];
            for (let k = 0; k < tiers.length; k++) {
                const tr = tiers[k];
                pushCrown('pine', leafHex, { x, y: y + tr.y, z, ry: tr.r, sx: tr.s, sy: tr.h, sz: tr.s, ownerNode });
            }
        } else if (species === 'birch') {
            pushCrown('oak', leafHex, {
                x, y: y + trunkH + 0.25 * sc, z, ry: rotY, sx: 0.76 * sc, sy: 1.35 * sc, sz: 0.76 * sc, ownerNode
            });
        } else {
            pushCrown('oak', leafHex, {
                x, y: y + trunkH + 0.24 * sc, z, ry: rotY, sx: 1.22 * sc, sy: 0.92 * sc, sz: 1.18 * sc, ownerNode
            });
            if (!simplified) {
                const ox = Math.cos(rotY) * 0.34 * sc;
                const oz = Math.sin(rotY) * 0.34 * sc;
                pushCrown('oak', leafHex, {
                    x: x + ox, y: y + trunkH + 0.06 * sc, z: z + oz, ry: rotY + 0.7, sx: 0.76 * sc, sy: 0.68 * sc, sz: 0.76 * sc, ownerNode
                });
            }
        }
    }

    function getSharedHighwayAssets() {
        if (sharedHighwayAssets) return sharedHighwayAssets;
        sharedHighwayAssets = {
            deckGeo: new THREE.BoxGeometry(4.5, 0.07, 3.15),
            deckMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.78 }),
            shoulderGeo: new THREE.BoxGeometry(5.5, 0.045, 3.15),
            shoulderMat: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.90 }),
            centerLineGeo: new THREE.BoxGeometry(0.11, 0.08, 1.45),
            centerLineMat: new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
            edgeLineGeo: new THREE.BoxGeometry(0.08, 0.08, 3.12),
            edgeLineMat: new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
            railGeo: new THREE.BoxGeometry(0.08, 0.28, 3.05),
            railMat: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.55, roughness: 0.45 }),
            signPostGeo: new THREE.CylinderGeometry(0.04, 0.045, 2.2, 6),
            signBoardGeo: new THREE.BoxGeometry(1.4, 0.65, 0.07),
            signBoardMat: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55 }),
            lampPostGeo: new THREE.CylinderGeometry(0.04, 0.055, 2.6, 6),
            lampHeadGeo: new THREE.BoxGeometry(0.55, 0.09, 0.14),
            lampBulbGeo: new THREE.SphereGeometry(0.10, 7, 6),
            lampBulbMat: new THREE.MeshStandardMaterial({
                color: 0xfef3c7,
                emissive: 0xf59e0b,
                emissiveIntensity: 0.25,
                roughness: 0.3
            })
        };
        if (MO.resources) {
            MO.resources.protect(...Object.values(sharedHighwayAssets));
        }
        return sharedHighwayAssets;
    }

    function updateHighwayLights(isNight) {
        if (sharedHighwayAssets && sharedHighwayAssets.lampBulbMat) {
            sharedHighwayAssets.lampBulbMat.emissiveIntensity = isNight ? 2.4 : 0.22;
        }
    }

    function addChunkHighway(chunk, seed) {
        const ox = chunk.cx * CHUNK_SIZE;
        const oz = chunk.cz * CHUNK_SIZE;
        const sampleMidX = getHighwayCenterX(oz, seed);
        if (Math.abs(sampleMidX - ox) > CHUNK_SIZE * 0.78) return;

        const H = getSharedHighwayAssets();
        const segLen = 3.0;
        const count = Math.round(CHUNK_SIZE / segLen);
        const decks = [];
        const shoulders = [];
        const centers = [];
        const edges = [];
        const rails = [];
        const posts = [];
        const bulbs = [];

        for (let i = 0; i < count; i++) {
            const zA = oz - CHUNK_SIZE * 0.5 + i * segLen;
            const zB = zA + segLen;
            const zMid = (zA + zB) * 0.5;
            const xA = getHighwayCenterX(zA, seed);
            const xB = getHighwayCenterX(zB, seed);
            const xMid = (xA + xB) * 0.5;
            if (Math.abs(xMid - ox) > CHUNK_SIZE * 0.62) continue;
            const yMid = getHighwayHeight(zMid, seed);
            const yaw = Math.atan2(xB - xA, zB - zA);
            const cosY = Math.cos(yaw);
            const sinY = Math.sin(yaw);

            shoulders.push({ x: xMid, y: yMid + 0.015, z: zMid, ry: yaw, sx: 1, sy: 1, sz: 1 });
            decks.push({ x: xMid, y: yMid + 0.032, z: zMid, ry: yaw, sx: 1, sy: 1, sz: 1 });
            centers.push({ x: xMid, y: yMid + 0.038, z: zMid, ry: yaw, sx: 1, sy: 1, sz: 1 });
            edges.push({ x: xMid + cosY * 2.02, y: yMid + 0.038, z: zMid - sinY * 2.02, ry: yaw, sx: 1, sy: 1, sz: 1 });
            edges.push({ x: xMid - cosY * 2.02, y: yMid + 0.038, z: zMid + sinY * 2.02, ry: yaw, sx: 1, sy: 1, sz: 1 });

            // Guard-rail contínuo na borda oeste (mantém lado leste aberto para entroncamentos rumo à cidade!)
            rails.push({ x: xMid - cosY * 2.55, y: yMid + 0.18, z: zMid + sinY * 2.55, ry: yaw, sx: 1, sy: 1, sz: 1 });

            // Postes de rodovia a cada 12 metros
            if (i % 4 === 1) {
                const px = xMid - cosY * 2.72;
                const pz = zMid + sinY * 2.72;
                posts.push({ x: px, y: yMid + 1.30, z: pz, ry: yaw, sx: 1, sy: 1, sz: 1 });
                bulbs.push({ x: px + cosY * 0.35, y: yMid + 2.52, z: pz - sinY * 0.35, ry: yaw, sx: 1, sy: 1, sz: 1 });
            }
        }

        appendInstancedBatch(chunk.nodesGroup, H.shoulderGeo, H.shoulderMat, shoulders, false);
        appendInstancedBatch(chunk.nodesGroup, H.deckGeo, H.deckMat, decks, false);
        appendInstancedBatch(chunk.nodesGroup, H.centerLineGeo, H.centerLineMat, centers, false);
        appendInstancedBatch(chunk.nodesGroup, H.edgeLineGeo, H.edgeLineMat, edges, false);
        appendInstancedBatch(chunk.nodesGroup, H.railGeo, H.railMat, rails, true);
        appendInstancedBatch(chunk.nodesGroup, H.lampPostGeo, H.railMat, posts, true);
        appendInstancedBatch(chunk.nodesGroup, H.lampBulbGeo, H.lampBulbMat, bulbs, false);

        // Placa verde de rodovia no trecho inicial (sinalizando acesso ao vale dos peregrinos)
        if (chunk.cz === 0 && decks.length > 0) {
            const sx = getHighwayCenterX(4, seed) + 3.05;
            const sy = getHighwayHeight(4, seed);
            const signGrp = new THREE.Group();
            signGrp.position.set(sx, sy, 4);
            const pL = new THREE.Mesh(H.signPostGeo, H.railMat);
            pL.position.set(-0.42, 1.1, 0);
            const pR = new THREE.Mesh(H.signPostGeo, H.railMat);
            pR.position.set(0.42, 1.1, 0);
            const board = new THREE.Mesh(H.signBoardGeo, H.signBoardMat);
            board.position.set(0, 1.95, 0);
            board.castShadow = true;
            signGrp.add(pL, pR, board);
            chunk.nodesGroup.add(signGrp);
        }
    }

    function addChunkLandmarks(chunk, seed, biomeId, flora, tAssets, batches) {
        const ox = chunk.cx * CHUNK_SIZE;
        const oz = chunk.cz * CHUNK_SIZE;

        // Marco 1: Árvore Ancestral Gigante com raízes e pedras na borda do bosque oeste (referência visual imediata)
        if ((chunk.cx === -1 && chunk.cz === 0) || (chunk.cx !== 0 && chunk.cz !== 0 && hash2D(chunk.cx * 17, chunk.cz * 29, seed + 511) < 0.14)) {
            const lx = chunk.cx === -1 && chunk.cz === 0 ? -13.5 : ox + (hash2D(chunk.cx, 1, seed + 513) - 0.5) * 10;
            const lz = chunk.cx === -1 && chunk.cz === 0 ? -6.5 : oz + (hash2D(chunk.cz, 2, seed + 517) - 0.5) * 10;
            const ly = getProceduralHeight(lx, lz);
            if (ly > MO.WATER_LEVEL + 0.25 && ly < 2.6 && !isSpotBlockedByInfra(lx, lz, seed)) {
                const ancient = new THREE.Group();
                ancient.position.set(lx, ly - 0.05, lz);
                const tr = new THREE.Mesh(tAssets.trunkGeo, MO.mats.trunkWood);
                tr.scale.set(2.5, 2.8, 2.5);
                tr.position.y = 1.4;
                tr.castShadow = true;
                const crownMat = getTreeMat(biomeId, biomeId === 'cerrado' ? '#7f7835' : '#245824');
                const cMain = new THREE.Mesh(tAssets.ancientGeo, crownMat);
                cMain.position.y = 3.05;
                cMain.scale.set(1.60, 1.12, 1.60);
                cMain.castShadow = true;
                const cSide = new THREE.Mesh(tAssets.ancientGeo, getTreeMat(biomeId, '#35732c'));
                cSide.position.set(0.92, 2.48, 0.52);
                cSide.scale.set(0.96, 0.80, 0.96);
                cSide.castShadow = true;
                ancient.add(tr, cMain, cSide);
                chunk.nodesGroup.add(ancient);

                // Pedras e cogumelos na base da Árvore Ancestral (instanciados)
                for (let k = 0; k < 4; k++) {
                    const ang = (k / 4) * Math.PI * 2 + 0.4;
                    const px = lx + Math.cos(ang) * 1.45;
                    const pz = lz + Math.sin(ang) * 1.45;
                    const py = getProceduralHeight(px, pz);
                    batches.rocks.push({ x: px, y: py + 0.14, z: pz, ry: ang, sx: 0.65, sy: 0.45, sz: 0.58 });
                }
            }
        }

        // Marco 2: Corredeira / Rochas com espuma no rio ao lado da vila
        const riverSampleX = getInfiniteRiverX(oz, seed);
        if (Math.abs(riverSampleX - ox) <= CHUNK_SIZE * 0.65) {
            for (let k = 0; k < 3; k++) {
                const rz = oz - 7 + k * 7 + (hash2D(k, chunk.cz, seed + 601) - 0.5) * 2.5;
                const rx = getInfiniteRiverX(rz, seed) + (hash2D(k, chunk.cx, seed + 607) - 0.5) * 1.4;
                batches.rocks.push({ x: rx, y: (MO.WATER_LEVEL || -0.36) - 0.02, z: rz, ry: k * 1.4, sx: 1.1, sy: 0.75, sz: 0.95 });
                batches.foam.push({ x: rx, y: (MO.WATER_LEVEL || -0.36) + 0.05, z: rz + 0.25, ry: k * 0.9, sx: 2.4, sy: 0.25, sz: 2.2 });
            }
        }

        // Marco 3: Afloramento rochoso mirante em áreas montanhosas
        const cMasks = getTerrainMasks(ox, oz, seed);
        if (cMasks.mountainMask > 0.55) {
            const mx = ox + (hash2D(chunk.cx, 5, seed + 709) - 0.5) * 8;
            const mz = oz + (hash2D(chunk.cz, 6, seed + 719) - 0.5) * 8;
            const my = getProceduralHeight(mx, mz);
            if (my > 1.5 && !isSpotBlockedByInfra(mx, mz, seed)) {
                batches.rocks.push({ x: mx, y: my + 0.42, z: mz, ry: 0.6, sx: 2.1, sy: 1.35, sz: 1.7 });
                batches.rocks.push({ x: mx + 0.9, y: my + 0.24, z: mz + 0.55, ry: 1.9, sx: 1.35, sy: 0.85, sz: 1.25 });
                batches.rocks.push({ x: mx - 0.8, y: my + 0.18, z: mz - 0.45, ry: 2.8, sx: 1.1, sy: 0.72, sz: 1.0 });
            }
        }
    }

    function spawnDepletedVisualAt(chunk, node, tAssets) {
        if (!chunk || !chunk.nodesGroup || !node) return;
        const ry = getProceduralHeight(node.x, node.z);
        if (node.kind === 'wood') {
            const stump = new THREE.Mesh(tAssets.stumpGeo, getStumpMat());
            stump.position.set(node.x, ry + 0.12, node.z);
            stump.castShadow = true;
            chunk.nodesGroup.add(stump);
            node.stumpMesh = stump;
        } else {
            const rubble = new THREE.Mesh(tAssets.rockGeo, MO.mats.stone);
            rubble.position.set(node.x, ry + 0.05, node.z);
            rubble.scale.set(0.75, 0.24, 0.68);
            chunk.nodesGroup.add(rubble);
            node.stumpMesh = rubble;
        }
    }

    function populateChunkResourceNodes(chunk) {
        const seed = MO.state ? MO.state.seed : 1234;
        const biomeId = (MO.state && MO.state.biome) || 'forest';
        const ox = chunk.cx * CHUNK_SIZE;
        const oz = chunk.cz * CHUNK_SIZE;
        const flora = getSharedFloraAssets();
        const tAssets = getSharedTreeGeos();
        const greens = biomeId === 'cerrado'
            ? ['#5a6328', '#6e7330', '#7f7835', '#91602a']
            : ['#255421', '#2f6b28', '#418330', '#4f9637'];
        const autumnAccents = ['#c96f3b', '#d99a32'];

        const distFocus = Math.max(
            Math.abs(chunk.cx - (lastFocusChunkX || 0)),
            Math.abs(chunk.cz - (lastFocusChunkZ || 0))
        );
        const isNearCenter = Math.max(Math.abs(chunk.cx), Math.abs(chunk.cz)) <= 2;
        const useLodSimplified = distFocus >= 2;

        // Lotes instanciados unificados com instanceColor (reduz ~75% dos draw calls mantendo floresta 2x mais densa!)
        const flowerPalette = [0xfacc15, 0xf472b6, 0x38bdf8, 0xf8fafc];
        const batches = {
            grass: [],
            bush: [],
            pebble: [],
            reed: [],
            mushStem: [],
            mushCap: [],
            flowers: [],
            woodTrunk: [],
            birchTrunk: [],
            pineCrowns: [],
            oakCrowns: [],
            rocks: [],
            foam: [],
            logs: [],
            stumps: []
        };

        // 1. Camada Ecológica Instanciada em Manchas (capim, flores, arbustos, cogumelos, juncos e seixos)
        const decorAttempts = isNearCenter ? 98 : 48;
        for (let d = 0; d < decorAttempts; d++) {
            const dx = ox + (hash2D(chunk.cx * 41 + d, chunk.cz * 23 + 7, seed + 13) - 0.5) * (CHUNK_SIZE - 1.4);
            const dz = oz + (hash2D(chunk.cx * 27 + 9, chunk.cz * 43 + d, seed + 17) - 0.5) * (CHUNK_SIZE - 1.4);
            if (Math.hypot(dx, dz) < 7.2) continue;
            if (isSpotBlockedByInfra(dx, dz, seed)) continue;
            const dy = getProceduralHeight(dx, dz);
            if (dy < MO.WATER_LEVEL + 0.05 || dy > 2.95) continue;

            const { forestMask, moisture, meadowMask } = getTerrainMasks(dx, dz, seed);
            const distRiv = Math.abs(dx - getInfiniteRiverX(dz, seed));
            const halfW = getRiverHalfWidth(dz, seed);
            const rotY = hash2D(d, chunk.cx + chunk.cz, seed + 3) * Math.PI * 2;

            if (distRiv < halfW + 2.4) {
                const ps = 0.65 + hash2D(d, chunk.cx, seed + 2) * 1.35;
                batches.pebble.push({ x: dx, y: dy + 0.04, z: dz, ry: rotY, sx: ps * 1.35, sy: ps * 0.62, sz: ps });
                if (d % 3 === 0) {
                    const rh = 0.75 + hash2D(d + 5, chunk.cz, seed + 11) * 0.6;
                    batches.reed.push({ x: dx + 0.16, y: dy + 0.25 * rh, z: dz - 0.12, ry: rotY, rx: 0.08, sx: 1, sy: rh, sz: 1 });
                }
            } else if (forestMask > 0.50 && d % 5 === 0) {
                batches.mushStem.push({ x: dx, y: dy + 0.07, z: dz, ry: rotY, sx: 1, sy: 1, sz: 1 });
                batches.mushCap.push({ x: dx, y: dy + 0.17, z: dz, ry: rotY, sx: 1, sy: 1, sz: 1 });
            } else if (moisture > 0.44 && d % 4 === 0) {
                const bs = 0.72 + hash2D(chunk.cx + d, chunk.cz, seed + 9) * 0.72;
                batches.bush.push({ x: dx, y: dy + 0.12, z: dz, ry: rotY, sx: bs * 1.25, sy: bs * 0.78, sz: bs });
            } else {
                const gs = 0.78 + hash2D(d, chunk.cz, seed + 29) * 0.7;
                batches.grass.push({ x: dx, y: dy + 0.11 * gs, z: dz, ry: rotY, sx: gs, sy: gs, sz: gs });
                if (meadowMask > 0.40 && forestMask < 0.60 && d % 2 === 0) {
                    const fCol = flowerPalette[d % flowerPalette.length];
                    batches.flowers.push({ x: dx + 0.14, y: dy + 0.14, z: dz + 0.08, ry: rotY, sx: 1.05, sy: 1.05, sz: 1.05, color: fCol });
                }
            }
        }

        // Rodovia Regional Infinita & Marcos paisagísticos da região
        addChunkHighway(chunk, seed);
        addChunkLandmarks(chunk, seed, biomeId, flora, tAssets, batches);

        // 2. Bosques densos em manchas (2 núcleos por chunk), troncos caídos e Minas/Pedreiras naturais
        const chunkMasks = getTerrainMasks(ox, oz, seed);
        const isDenseForest = chunkMasks.forestMask > 0.41;
        const treeSlots = isDenseForest ? 16 : 7;
        const oreSlots = chunkMasks.mountainMask > 0.35 ? 3 : 2;
        const totalSlots = treeSlots + oreSlots;

        const groveA = {
            x: ox + (hash2D(chunk.cx * 13, chunk.cz * 7, seed + 19) - 0.5) * (CHUNK_SIZE * 0.46),
            z: oz + (hash2D(chunk.cx * 7, chunk.cz * 13, seed + 23) - 0.5) * (CHUNK_SIZE * 0.46)
        };
        const groveB = {
            x: ox + (hash2D(chunk.cx * 23, chunk.cz * 11, seed + 37) - 0.5) * (CHUNK_SIZE * 0.48),
            z: oz + (hash2D(chunk.cx * 11, chunk.cz * 23, seed + 43) - 0.5) * (CHUNK_SIZE * 0.48)
        };

        // Troncos caídos decorativos em florestas densas (instanciados)
        if (isDenseForest && Math.hypot(ox, oz) > 14) {
            for (let lg = 0; lg < 2; lg++) {
                const lx = groveA.x + (hash2D(lg, chunk.cx, seed + 71) - 0.5) * 6.5;
                const lz = groveA.z + (hash2D(chunk.cz, lg, seed + 73) - 0.5) * 6.5;
                if (isSpotBlockedByInfra(lx, lz, seed)) continue;
                const ly = getProceduralHeight(lx, lz);
                if (ly > MO.WATER_LEVEL + 0.25 && ly < 2.8) {
                    batches.logs.push({
                        x: lx, y: ly + 0.10, z: lz,
                        rz: Math.PI / 2,
                        ry: hash2D(lg, chunk.cx + chunk.cz, seed + 79) * Math.PI,
                        sx: 1, sy: 1, sz: 1
                    });
                }
            }
        }

        // Árvores extras de sub-bosque / preenchimento visual (jovens/bordas) puramente instanciadas
        const extraCanopyCount = isDenseForest ? 6 : 2;
        for (let ex = 0; ex < extraCanopyCount; ex++) {
            const base = ex % 2 === 0 ? groveA : groveB;
            const exX = base.x + (hash2D(chunk.cx * 53 + ex, chunk.cz * 11, seed + 211) - 0.5) * 11.5;
            const exZ = base.z + (hash2D(chunk.cx * 13, chunk.cz * 59 + ex, seed + 223) - 0.5) * 11.5;
            if (Math.hypot(exX, exZ) < 10.5 || isSpotBlockedByInfra(exX, exZ, seed)) continue;
            const exY = getProceduralHeight(exX, exZ);
            if (exY < MO.WATER_LEVEL + 0.24 || exY > 3.9) continue;
            const sc = 0.55 + hash2D(ex, chunk.cx * 7 + chunk.cz, seed + 233) * 0.52;
            const species = ex % 3 === 0 ? 'pine' : (ex % 3 === 1 ? 'oak' : 'birch');
            const leafHex = greens[(ex + Math.abs(chunk.cx)) % greens.length];
            const rotY = hash2D(ex, chunk.cz, seed + 239) * Math.PI * 2;
            queueTreePartsToBatches(batches, species, exX, exY - 0.04, exZ, sc, leafHex, rotY, null, true);
        }

        for (let i = 0; i < totalSlots; i++) {
            const isTree = i < treeSlots;
            const useGroveB = isTree && (i % 2 === 1);
            const spread = isTree ? (isDenseForest ? 9.5 : 5.8) : (CHUNK_SIZE - 4.0);
            const baseCx = isTree ? (useGroveB ? groveB.x : groveA.x) : ox;
            const baseCz = isTree ? (useGroveB ? groveB.z : groveA.z) : oz;
            const rx = baseCx + (hash2D(chunk.cx * 31 + i, chunk.cz * 17 + 3, seed) - 0.5) * spread;
            const rz = baseCz + (hash2D(chunk.cx * 19 + 5, chunk.cz * 29 + i, seed) - 0.5) * spread;
            if (Math.hypot(rx, rz) < 9.2) continue;
            if (isSpotBlockedByInfra(rx, rz, seed)) continue;
            const ry = getProceduralHeight(rx, rz);
            if (ry < MO.WATER_LEVEL + 0.22 || ry > 4.2) continue;

            const slope = Math.abs(getProceduralHeight(rx + 0.8, rz) - ry) + Math.abs(getProceduralHeight(rx, rz + 0.8) - ry);
            if (isTree && slope > 0.88) continue;

            const rollMine = !isTree && i === totalSlots - 1 && (ry > 0.80 || hash2D(chunk.cx + 9, chunk.cz + 11, seed + 91) < 0.50);
            const kind = isTree ? 'wood' : (rollMine ? 'mine' : (hash2D(i, chunk.cx + chunk.cz, seed + 55) < 0.60 ? 'stone' : 'iron'));
            const nodeId = `node-${chunk.cx},${chunk.cz}-${i}`;

            // Persistência Real dos Ecossistemas: respeita esgotamento ou colheita parcial gravada
            const savedState = modifiedNodes.get(nodeId);
            if (savedState && savedState.amount <= 0) {
                if (kind === 'wood') {
                    batches.stumps.push({ x: rx, y: ry + 0.12, z: rz, ry: i * 0.7, sx: 1, sy: 1, sz: 1 });
                }
                continue;
            }

            const maxAmt = kind === 'mine' ? 14 : (kind === 'wood' ? 5 : 6);
            const currentAmt = savedState ? savedState.amount : maxAmt;
            const rotY = hash2D(i * 7, chunk.cx + chunk.cz, seed + 61) * Math.PI * 2;

            const node = resourceNodes.get(nodeId) || {
                id: nodeId,
                chunkKey: `${chunk.cx},${chunk.cz}`,
                kind,
                x: rx,
                z: rz,
                amount: currentAmt,
                maxAmount: maxAmt,
                res: false,
                mesh: null,
                instRefs: null
            };
            node.amount = currentAmt;
            node.chunkKey = `${chunk.cx},${chunk.cz}`;
            node.instRefs = null;
            node.mesh = null;

            if (kind === 'wood') {
                const sc = (0.78 + hash2D(i * 3, chunk.cx + chunk.cz, seed + 41) * 0.82) * (0.76 + 0.24 * (currentAmt / maxAmt));
                const speciesRoll = hash2D(i * 5, chunk.cx - chunk.cz, seed + 97);
                const species = speciesRoll < 0.44 ? 'pine' : (speciesRoll < 0.78 ? 'oak' : 'birch');
                const useAutumn = biomeId === 'forest' && hash2D(i, chunk.cx * 5, seed + 88) < 0.14;
                const leafHex = useAutumn ? autumnAccents[i % autumnAccents.length] : greens[i % greens.length];
                queueTreePartsToBatches(batches, species, rx, ry - 0.04, rz, sc, leafHex, rotY, node, useLodSimplified);
            } else if (kind === 'stone') {
                const rScale = 0.72 + 0.28 * (currentAmt / maxAmt);
                // Afloramento agrupado de 2-3 rochas orgânicas (instanciado!)
                batches.rocks.push({
                    x: rx, y: ry + 0.22, z: rz, ry: rotY,
                    sx: 1.32 * rScale, sy: 0.76 * rScale, sz: 1.18 * rScale, ownerNode: node
                });
                batches.rocks.push({
                    x: rx + Math.cos(rotY) * 0.52, y: ry + 0.13, z: rz + Math.sin(rotY) * 0.52, ry: rotY + 1.2,
                    sx: 0.76 * rScale, sy: 0.52 * rScale, sz: 0.72 * rScale, ownerNode: node
                });
            } else if (kind === 'mine') {
                const grp = new THREE.Group();
                grp.position.set(rx, ry - 0.04, rz);
                const hill = new THREE.Mesh(tAssets.mineHillGeo, MO.mats.stone);
                hill.position.set(0, 0.48, -0.25);
                hill.scale.set(1.5, 0.95, 1.2);
                hill.castShadow = true;
                const caveHole = new THREE.Mesh(tAssets.caveHoleGeo, tAssets.holeMat);
                caveHole.position.set(0, 0.36, 0.42);
                const postL = new THREE.Mesh(tAssets.minePostGeo, MO.mats.wood);
                postL.position.set(-0.36, 0.41, 0.60);
                const postR = new THREE.Mesh(tAssets.minePostGeo, MO.mats.wood);
                postR.position.set(0.36, 0.41, 0.60);
                const lintel = new THREE.Mesh(tAssets.mineLintelGeo, MO.mats.wood);
                lintel.position.set(0, 0.82, 0.60);
                const veinA = new THREE.Mesh(tAssets.veinGeo, getIronOreMat());
                veinA.position.set(-0.58, 0.56, 0.34);
                const veinB = new THREE.Mesh(tAssets.veinGeo, getIronOreMat());
                veinB.position.set(0.58, 0.42, 0.26);
                const cart = new THREE.Mesh(tAssets.cartGeo, MO.mats.steel);
                cart.position.set(0.08, 0.16, 0.92);
                grp.rotation.y = rotY;
                grp.add(hill, caveHole, postL, postR, lintel, veinA, veinB, cart);
                chunk.nodesGroup.add(grp);
                node.mesh = grp;
            } else {
                // Jazida de ferro com rocha agrupada e veios metálicos
                const grp = new THREE.Group();
                grp.position.set(rx, ry - 0.04, rz);
                const rock = new THREE.Mesh(tAssets.rockGeo, MO.mats.stone);
                rock.position.y = 0.24;
                const rScale = 0.72 + 0.28 * (currentAmt / maxAmt);
                rock.scale.set(1.32 * rScale, 0.78 * rScale, 1.18 * rScale);
                rock.castShadow = true;
                const sideRock = new THREE.Mesh(tAssets.rockGeo, MO.mats.stone);
                sideRock.position.set(-0.42, 0.14, 0.25);
                sideRock.scale.set(0.68 * rScale, 0.48 * rScale, 0.62 * rScale);
                const vein = new THREE.Mesh(tAssets.veinGeo, getIronOreMat());
                vein.position.set(0.16, 0.39, 0.12);
                const vein2 = new THREE.Mesh(tAssets.veinGeo, getIronOreMat());
                vein2.position.set(-0.22, 0.28, -0.14);
                vein2.scale.setScalar(0.75);
                grp.add(rock, sideRock, vein, vein2);
                chunk.nodesGroup.add(grp);
                node.mesh = grp;
            }

            resourceNodes.set(nodeId, node);
            chunk.resourceNodes.push(node);
        }

        // 3. Emite todos os lotes instanciados do chunk (com instanceColor unificado por geometria)
        appendInstancedBatch(chunk.nodesGroup, flora.grassGeo, flora.grassMat, batches.grass, false);
        appendInstancedBatch(chunk.nodesGroup, flora.bushGeo, flora.bushMat, batches.bush, !useLodSimplified);
        appendInstancedBatch(chunk.nodesGroup, flora.pebbleGeo, flora.pebbleMat, batches.pebble, false);
        appendInstancedBatch(chunk.nodesGroup, flora.reedGeo, flora.reedMat, batches.reed, false);
        appendInstancedBatch(chunk.nodesGroup, flora.mushStemGeo, flora.mushStemMat, batches.mushStem, false);
        appendInstancedBatch(chunk.nodesGroup, flora.mushCapGeo, flora.mushCapMat, batches.mushCap, false);
        appendInstancedBatch(chunk.nodesGroup, flora.flowerGeo, getInstancedFlowerMat(), batches.flowers, false, true);
        appendInstancedBatch(chunk.nodesGroup, tAssets.trunkGeo, MO.mats.trunkWood, batches.woodTrunk, !useLodSimplified);
        appendInstancedBatch(chunk.nodesGroup, tAssets.trunkGeo, getBirchTrunkMat(), batches.birchTrunk, !useLodSimplified);
        appendInstancedBatch(chunk.nodesGroup, tAssets.pineGeo, getInstancedLeafMat(), batches.pineCrowns, !useLodSimplified, true);
        appendInstancedBatch(chunk.nodesGroup, tAssets.oakGeo, getInstancedLeafMat(), batches.oakCrowns, !useLodSimplified, true);
        appendInstancedBatch(chunk.nodesGroup, tAssets.rockGeo, MO.mats.stone, batches.rocks, !useLodSimplified);
        appendInstancedBatch(chunk.nodesGroup, flora.pebbleGeo, getWaterFoamMat(), batches.foam, false);
        appendInstancedBatch(chunk.nodesGroup, tAssets.logGeo, MO.mats.trunkWood, batches.logs, !useLodSimplified);
        appendInstancedBatch(chunk.nodesGroup, tAssets.stumpGeo, getStumpMat(), batches.stumps, false);
    }

    function createChunk(cx, cz) {
        const key = `${cx},${cz}`;
        if (chunks.has(key)) return chunks.get(key);

        const group = new THREE.Group();
        group.position.set(0, 0, 0);

        const geo = new THREE.BufferGeometry();
        const seg = CHUNK_SEG;
        const count = (seg + 1) * (seg + 1);
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const indices = [];

        for (let iz = 0; iz <= seg; iz++) {
            const lz = ((iz / seg) - 0.5) * CHUNK_SIZE;
            for (let ix = 0; ix <= seg; ix++) {
                const lx = ((ix / seg) - 0.5) * CHUNK_SIZE;
                const pIdx = (iz * (seg + 1) + ix) * 3;
                positions[pIdx] = lx;
                positions[pIdx + 1] = 0;
                positions[pIdx + 2] = lz;
            }
        }
        for (let iz = 0; iz < seg; iz++) {
            for (let ix = 0; ix < seg; ix++) {
                const a = iz * (seg + 1) + ix;
                const b = a + 1;
                const c = a + (seg + 1);
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setIndex(indices);

        const mesh = new THREE.Mesh(geo, getTerrainMaterial());
        mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        mesh.receiveShadow = true;
        mesh.userData = { terrainChunkKey: key };
        group.add(mesh);

        const nodesGroup = new THREE.Group();
        group.add(nodesGroup);

        if (MO.groups && MO.groups.terrainChunks) {
            MO.groups.terrainChunks.add(group);
        }

        const chunk = { cx, cz, key, group, mesh, nodesGroup, resourceNodes: [] };
        updateChunkMeshGeometry(chunk);
        populateChunkResourceNodes(chunk);
        chunks.set(key, chunk);
        return chunk;
    }

    function unloadChunk(key) {
        const chunk = chunks.get(key);
        if (!chunk) return;
        // Limpa apenas instâncias carregadas na RAM; modificações persistentes ficam salvas em `modifiedNodes`!
        chunk.resourceNodes.forEach(n => {
            if (n.amount < n.maxAmount) {
                modifiedNodes.set(n.id, {
                    id: n.id,
                    chunkKey: n.chunkKey,
                    kind: n.kind,
                    x: n.x,
                    z: n.z,
                    amount: n.amount,
                    maxAmount: n.maxAmount
                });
            }
            if (!n.res) resourceNodes.delete(n.id);
            else {
                n.mesh = null;
                n.instRefs = null;
            }
        });
        if (MO.groups && MO.groups.terrainChunks && MO.resources) {
            MO.resources.removeAndDispose(MO.groups.terrainChunks, chunk.group);
        }
        chunks.delete(key);
    }

    function updateAround(wx = 0, wz = 0) {
        if (!MO.state || !MO.state.infiniteWorld) return;
        ensureInfiniteWater();
        const fcx = Math.round(wx / CHUNK_SIZE);
        const fcz = Math.round(wz / CHUNK_SIZE);

        if (infiniteWaterMesh) {
            infiniteWaterMesh.position.x = fcx * CHUNK_SIZE;
            infiniteWaterMesh.position.z = fcz * CHUNK_SIZE;
        }

        if (fcx === lastFocusChunkX && fcz === lastFocusChunkZ && chunks.size > 0) return;
        lastFocusChunkX = fcx;
        lastFocusChunkZ = fcz;

        const needed = new Set();
        for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
            for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
                const cx = fcx + dx;
                const cz = fcz + dz;
                needed.add(`${cx},${cz}`);
                createChunk(cx, cz);
            }
        }

        Array.from(chunks.keys()).forEach(key => {
            if (!needed.has(key)) {
                unloadChunk(key);
            }
        });

        const centerChunk = chunks.get(`${fcx},${fcz}`) || chunks.get('0,0');
        if (centerChunk) MO.terrainMesh = centerChunk.mesh;
    }

    function markChunkDirtyAtWorld(wx, wz, radius = 1) {
        const minCx = Math.floor((wx - radius + CHUNK_SIZE / 2) / CHUNK_SIZE);
        const maxCx = Math.floor((wx + radius + CHUNK_SIZE / 2) / CHUNK_SIZE);
        const minCz = Math.floor((wz - radius + CHUNK_SIZE / 2) / CHUNK_SIZE);
        const maxCz = Math.floor((wz + radius + CHUNK_SIZE / 2) / CHUNK_SIZE);
        for (let cz = minCz; cz <= maxCz; cz++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const ch = chunks.get(`${cx},${cz}`);
                if (ch) updateChunkMeshGeometry(ch);
            }
        }
    }

    function paintRoadCell(wx, wz, kind = 'dirt', built = false, radius = 1) {
        const cx = Math.floor(wx);
        const cz = Math.floor(wz);
        for (let dz = -radius + 1; dz <= radius - 1; dz++) {
            for (let dx = -radius + 1; dx <= radius - 1; dx++) {
                const key = `${cx + dx},${cz + dz}`;
                roadCells.set(key, { gx: cx + dx, gz: cz + dz, kind, built });
            }
        }
        markChunkDirtyAtWorld(wx, wz, radius + 1);
    }

    function paintLevelArea(wx, wz, radius = 1.8, strength = 0.9, targetY = null) {
        const yTarget = targetY !== null ? targetY : (MO.PLATEAU_Y || 0.28);
        const rCeil = Math.ceil(radius);
        const cx = Math.floor(wx);
        const cz = Math.floor(wz);
        for (let dz = -rCeil; dz <= rCeil; dz++) {
            for (let dx = -rCeil; dx <= rCeil; dx++) {
                const dist = Math.hypot(dx, dz);
                if (dist <= radius) {
                    const falloff = 1 - dist / radius;
                    const key = `${cx + dx},${cz + dz}`;
                    const prev = levelCells.get(key) || { weight: 0, targetY: yTarget };
                    prev.weight = Math.min(1, prev.weight + falloff * strength);
                    prev.targetY = yTarget;
                    levelCells.set(key, prev);
                }
            }
        }
        markChunkDirtyAtWorld(wx, wz, radius + 1);
    }

    // Remove/esgota vegetação e rochas dentro do footprint de uma nova construção ou estrada
    function clearNatureInArea(wx, wz, radius = 2.4) {
        if (!Number.isFinite(wx) || !Number.isFinite(wz)) return 0;
        const r = Math.max(0.8, radius);
        clearedAreas.push({ x: Math.round(wx * 100) / 100, z: Math.round(wz * 100) / 100, r: Math.round(r * 100) / 100 });
        let clearedCount = 0;
        resourceNodes.forEach(node => {
            if (!node || node.amount <= 0) return;
            if (Math.hypot(node.x - wx, node.z - wz) <= r) {
                harvestNode(node, node.amount, { silent: true, skipStump: true });
                clearedCount++;
            }
        });
        return clearedCount;
    }

    function init(opts = {}) {
        reset({ keepModifications: Boolean(opts && opts.preserveModifications) });
        const tx = MO.camOrbit && MO.camOrbit.target ? MO.camOrbit.target.x : 0;
        const tz = MO.camOrbit && MO.camOrbit.target ? MO.camOrbit.target.z : 0;
        updateAround(tx, tz);
    }

    function reset(opts = {}) {
        if (MO.groups && MO.groups.terrainChunks && MO.resources) {
            MO.resources.clearGroup(MO.groups.terrainChunks);
        }
        chunks.clear();
        resourceNodes.clear();
        if (!opts || !opts.keepModifications) {
            modifiedNodes.clear();
            levelCells.clear();
            roadCells.clear();
            clearedAreas.length = 0;
            replantedCount = 0;
        }
        lastFocusChunkX = null;
        lastFocusChunkZ = null;
    }

    function getChunkMeshes() {
        const out = [];
        chunks.forEach(c => { if (c.mesh) out.push(c.mesh); });
        return out;
    }

    function getLoadedResourceNodes(kind = null) {
        const out = [];
        resourceNodes.forEach(n => {
            if (n.amount > 0 && (!kind || n.kind === kind)) out.push(n);
        });
        return out;
    }

    function harvestNode(node, qty = 1, opts = {}) {
        if (!node || node.amount <= 0) return 0;
        const taken = Math.min(node.amount, qty);
        node.amount -= taken;
        node.res = false;
        modifiedNodes.set(node.id, {
            id: node.id,
            chunkKey: node.chunkKey,
            kind: node.kind,
            x: node.x,
            z: node.z,
            amount: node.amount,
            maxAmount: node.maxAmount
        });

        const ratio = node.maxAmount > 0 ? Math.max(0, node.amount / node.maxAmount) : 0;
        if (Array.isArray(node.instRefs) && node.instRefs.length > 0 && supportsInstancing()) {
            const scaleMult = node.amount <= 0 ? 0.0001 : (0.76 + 0.24 * ratio);
            for (let i = 0; i < node.instRefs.length; i++) {
                const ref = node.instRefs[i];
                if (!ref || !ref.inst) continue;
                ref.inst.setMatrixAt(ref.index, composeEntryMatrix(ref.entry, scaleMult));
                if (ref.inst.instanceMatrix) ref.inst.instanceMatrix.needsUpdate = true;
            }
            if (node.amount <= 0 && !opts.skipStump) {
                const ch = chunks.get(node.chunkKey);
                if (ch) spawnDepletedVisualAt(ch, node, getSharedTreeGeos());
            }
        } else if (node.mesh) {
            if (node.amount <= 0) {
                node.mesh.visible = false;
                if (!opts.skipStump) {
                    const ch = chunks.get(node.chunkKey);
                    if (ch) spawnDepletedVisualAt(ch, node, getSharedTreeGeos());
                }
            } else {
                const s = 0.72 + 0.28 * ratio;
                node.mesh.scale.set(s, s, s);
            }
        }

        if (!opts.silent && MO.spawnBurst) {
            const hy = getProceduralHeight(node.x, node.z);
            const burstColor = node.kind === 'wood' ? 0x4f9637 : (node.kind === 'iron' ? 0x38bdf8 : 0x94a3b8);
            MO.spawnBurst(node.x, hy + 0.85, node.z, burstColor, node.amount <= 0 ? 12 : 5, 0.08);
        }
        return taken;
    }

    // Ciclo da Madeira: lista tocos elegíveis para reflorestamento em chunks carregados
    function getDepletedTreeNodes() {
        const out = [];
        modifiedNodes.forEach(n => {
            if (n && n.kind === 'wood' && n.amount <= 0 && chunks.has(n.chunkKey) && !isInClearedArea(n.x, n.z)) {
                out.push(n);
            }
        });
        return out;
    }

    function replantSapling(targetNodeId = null) {
        const candidates = getDepletedTreeNodes();
        if (candidates.length === 0) return null;
        const rec = targetNodeId ? candidates.find(c => c.id === targetNodeId) : candidates[0];
        if (!rec) return null;

        const maxAmt = rec.maxAmount || 5;
        rec.amount = 2;
        rec.isSapling = true;
        modifiedNodes.set(rec.id, { ...rec });
        replantedCount++;

        const ch = chunks.get(rec.chunkKey);
        const existing = resourceNodes.get(rec.id) || {
            id: rec.id,
            chunkKey: rec.chunkKey,
            kind: 'wood',
            x: rec.x,
            z: rec.z,
            amount: 2,
            maxAmount: maxAmt,
            res: false,
            isSapling: true,
            mesh: null,
            instRefs: null
        };
        existing.amount = 2;
        existing.isSapling = true;
        existing.res = false;

        if (ch && ch.nodesGroup) {
            if (existing.stumpMesh && MO.resources) {
                MO.resources.removeAndDispose(ch.nodesGroup, existing.stumpMesh);
                existing.stumpMesh = null;
            }
            const tAssets = getSharedTreeGeos();
            const hy = getProceduralHeight(rec.x, rec.z);
            const sapGrp = new THREE.Group();
            sapGrp.position.set(rec.x, hy - 0.03, rec.z);
            const trunk = new THREE.Mesh(tAssets.trunkGeo, MO.mats.trunkWood);
            trunk.scale.set(0.45, 0.65, 0.45);
            trunk.position.y = 0.32;
            const crown = new THREE.Mesh(tAssets.pineGeo, getTreeMat((MO.state && MO.state.biome) || 'forest', '#4f9637'));
            crown.scale.set(0.55, 0.72, 0.55);
            crown.position.y = 0.75;
            crown.castShadow = true;
            sapGrp.add(trunk, crown);
            ch.nodesGroup.add(sapGrp);
            existing.mesh = sapGrp;
            existing.instRefs = null;
        }
        resourceNodes.set(existing.id, existing);
        if (ch && !ch.resourceNodes.includes(existing)) ch.resourceNodes.push(existing);

        if (MO.spawnBurst) {
            const hy = getProceduralHeight(rec.x, rec.z);
            MO.spawnBurst(rec.x, hy + 0.45, rec.z, 0x86efac, 8, 0.07);
        }
        return existing;
    }

    function growSaplings() {
        let grown = 0;
        modifiedNodes.forEach((rec, id) => {
            if (!rec || !rec.isSapling || rec.kind !== 'wood') return;
            if (rec.amount < (rec.maxAmount || 5)) {
                rec.amount = Math.min(rec.maxAmount || 5, rec.amount + 1);
                if (rec.amount >= (rec.maxAmount || 5)) rec.isSapling = false;
                modifiedNodes.set(id, rec);
                const live = resourceNodes.get(id);
                if (live) {
                    live.amount = rec.amount;
                    live.isSapling = rec.isSapling;
                    if (live.mesh && live.mesh.scale) {
                        const s = 0.8 + (rec.amount / (rec.maxAmount || 5)) * 0.75;
                        live.mesh.scale.set(s, s, s);
                    }
                }
                grown++;
            }
        });
        return grown;
    }

    function serializeModifications() {
        const nodes = [];
        modifiedNodes.forEach(v => nodes.push({ ...v }));
        const levels = [];
        levelCells.forEach((v, key) => {
            levels.push({ key, weight: Math.round(v.weight * 1000) / 1000, targetY: Math.round(v.targetY * 1000) / 1000 });
        });
        const roads = [];
        roadCells.forEach((v, key) => {
            roads.push({ key, gx: v.gx, gz: v.gz, kind: v.kind, built: Boolean(v.built) });
        });
        return {
            version: 2,
            nodes,
            levels,
            roads,
            clearedAreas: clearedAreas.map(a => ({ ...a })),
            replantedCount
        };
    }

    function restoreModifications(snap) {
        modifiedNodes.clear();
        levelCells.clear();
        roadCells.clear();
        clearedAreas.length = 0;
        replantedCount = 0;
        if (!snap || typeof snap !== 'object') return;
        if (typeof snap.replantedCount === 'number') replantedCount = snap.replantedCount;
        if (Array.isArray(snap.nodes)) {
            snap.nodes.forEach(n => {
                if (n && n.id) modifiedNodes.set(n.id, { ...n });
            });
        }
        if (Array.isArray(snap.levels)) {
            snap.levels.forEach(l => {
                if (l && l.key) levelCells.set(l.key, { weight: l.weight, targetY: l.targetY });
            });
        }
        if (Array.isArray(snap.roads)) {
            snap.roads.forEach(r => {
                if (r && r.key) roadCells.set(r.key, { gx: r.gx, gz: r.gz, kind: r.kind || 'dirt', built: Boolean(r.built) });
            });
        }
        if (Array.isArray(snap.clearedAreas)) {
            snap.clearedAreas.forEach(a => {
                if (a && Number.isFinite(a.x) && Number.isFinite(a.z)) {
                    clearedAreas.push({ x: a.x, z: a.z, r: a.r || 2.2 });
                }
            });
        }
    }

    function getPerformanceStats() {
        let meshes = 0;
        let instancedMeshes = 0;
        let totalInstances = 0;
        if (MO.groups && MO.groups.terrainChunks) {
            MO.groups.terrainChunks.traverse(obj => {
                if (!obj) return;
                if (obj.isInstancedMesh) {
                    instancedMeshes++;
                    totalInstances += obj.count || 0;
                } else if (obj.isMesh) {
                    meshes++;
                }
            });
        }
        return {
            loadedChunks: chunks.size,
            loadedResourceNodes: resourceNodes.size,
            modifiedNodes: modifiedNodes.size,
            clearedAreas: clearedAreas.length,
            meshes,
            instancedMeshes,
            totalInstances,
            estimatedDrawCalls: meshes + instancedMeshes
        };
    }

    MO.chunkManager = {
        CHUNK_SIZE,
        HIGHWAY_HALF_W,
        init,
        reset,
        updateAround,
        getHeightAt: getProceduralHeight,
        getRiverCenterX: getInfiniteRiverX,
        getHighwayCenterX,
        getHighwayHeight,
        isNearHighway,
        updateHighwayLights,
        getChunkMeshes,
        getLoadedChunkCount: () => chunks.size,
        paintRoadCell,
        paintLevelArea,
        clearNatureInArea,
        getRoadCell: (wx, wz) => roadCells.get(`${Math.floor(wx)},${Math.floor(wz)}`) || null,
        getLevelCell: (wx, wz) => levelCells.get(`${Math.floor(wx)},${Math.floor(wz)}`) || null,
        getLoadedResourceNodes,
        harvestNode,
        getDepletedTreeNodes,
        replantSapling,
        growSaplings,
        getReplantedCount: () => replantedCount,
        getModifiedNodeState: (nodeId) => modifiedNodes.get(nodeId) || null,
        serializeModifications,
        restoreModifications,
        getPerformanceStats,
        refreshAllLoadedChunks: () => chunks.forEach(c => updateChunkMeshGeometry(c))
    };
})(window.MO = window.MO || {});

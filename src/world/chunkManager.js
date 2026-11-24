// =========================================================================
// WORLD: STREAMING DE TERRENO PROCEDURAL INFINITO POR CHUNKS & RECURSOS
// =========================================================================
(function(MO) {
    const CHUNK_SIZE = 24;
    const CHUNK_SEG = 20;
    const VIEW_RADIUS = 3; // Grade 7x7 = 168m x 168m ao redor da câmera

    const chunks = new Map();       // key "cx,cz" -> { cx, cz, group, mesh, nodesGroup, resourceNodes }
    const resourceNodes = new Map(); // id -> { id, chunkKey, kind, x, z, amount, maxAmount, mesh, res }
    const levelCells = new Map();   // key "gx,gz" -> { weight, targetY }
    const roadCells = new Map();    // key "gx,gz" -> { kind: 'dirt'|'paved', built: boolean }
    let infiniteWaterMesh = null;
    let lastFocusChunkX = null;
    let lastFocusChunkZ = null;
    let sharedTerrainMat = null;
    let sharedIronMat = null;
    let sharedFarmSoilMat = null;
    const sharedTreeMats = new Map();

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

    function getInfiniteRiverX(z, seed) {
        const s = seed !== undefined ? seed : MO.state.seed;
        const shift = ((s % 9) - 4) * 0.8 + 23.0;
        return shift + Math.sin(z * 0.075 + (s % 13)) * 4.4 + Math.cos(z * 0.028) * 5.2;
    }

    function getRiverHalfWidth(z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        return 2.75 + Math.sin(z * 0.09 + (s % 7)) * 0.55;
    }

    function ridgeNoise(x, z, seed) {
        const v = valueNoise2D(x, z, seed);
        const r = 1 - Math.abs(v * 2 - 1);
        return r * r;
    }

    function getTerrainMasks(x, z, seed) {
        const s = seed !== undefined ? seed : (MO.state ? MO.state.seed : 1234);
        const macro = valueNoise2D(x * 0.017, z * 0.017, s + 31);
        const mountainMask = Math.max(0, Math.min(1, (valueNoise2D(x * 0.023, z * 0.023, s + 307) - 0.46) / 0.44));
        const moisture = valueNoise2D(x * 0.032, z * 0.032, s + 701);
        const forestMask = valueNoise2D(x * 0.042, z * 0.042, s + 911);
        return { macro, mountainMask, moisture, forestMask };
    }

    function getProceduralHeight(x, z) {
        const s = MO.state ? MO.state.seed : 1234;
        const { macro, mountainMask } = getTerrainMasks(x, z, s);

        const rx = getInfiniteRiverX(z, s);
        const riverHalfW = getRiverHalfWidth(z, s);
        const distRiver = Math.abs(x - rx);
        const riverMountainAtten = Math.min(1, Math.max(0, (distRiver - riverHalfW - 1.2) / 6.5));

        // Camada 1: Geografia multi-escala (macro-vale + colinas terraceadas + cristas montanhosas + detalhes)
        const hMacro = (macro - 0.42) * 1.35;
        const rawHills = fbm(x, z, s) * 0.85;
        const terracedHills = rawHills * 0.72 + (Math.round(rawHills * 2.8) / 2.8) * 0.28;
        const ridge = ridgeNoise(x * 0.055, z * 0.055, s + 503) * 0.68 + ridgeNoise(x * 0.11, z * 0.11, s + 613) * 0.32;
        const hMountains = Math.pow(mountainMask, 1.35) * ridge * 6.4 * riverMountainAtten;
        const hDetails = (valueNoise2D(x * 0.18, z * 0.18, s + 809) - 0.5) * 0.24;

        let h = 0.34 + hMacro + terracedHills + hMountains + hDetails;

        // Vale central acolhedor ao redor de (0, 0) para o início da vila (transição suave para encostas)
        const dOrigin = Math.hypot(x, z);
        if (dOrigin < 20.0) {
            const t = 1 - dOrigin / 20.0;
            const smooth = t * t * (3 - 2 * t);
            h = h * (1 - smooth * 0.86) + MO.PLATEAU_Y * (smooth * 0.86);
        }

        // Camada 2: Hidrografia — Rio sinuoso escavado até o leito + margens suaves + lagos naturais
        if (distRiver < riverHalfW) {
            const t = 1 - distRiver / riverHalfW;
            const carve = t * t * (3 - 2 * t);
            const bedTarget = (MO.WATER_LEVEL || -0.36) - 0.62;
            h = h * (1 - carve) + bedTarget * carve;
        } else if (distRiver < riverHalfW + 1.8) {
            const bankT = (distRiver - riverHalfW) / 1.8;
            const bankTarget = Math.min(h, 0.28 + bankT * 0.24);
            h = h * bankT + bankTarget * (1 - bankT);
        } else if (dOrigin > 30.0 && macro < 0.16 && mountainMask < 0.08) {
            // Lago natural em depressão baixa longe do centro
            const lakeDepth = (0.16 - macro) / 0.16;
            h = Math.min(h, 0.15 - lakeDepth * 0.85);
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
                roughness: 0.88,
                metalness: 0.03,
                flatShading: true
            });
            if (MO.resources) MO.resources.protect(sharedTerrainMat);
        }
        return sharedTerrainMat;
    }

    function getIronOreMat() {
        if (!sharedIronMat) {
            sharedIronMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.7, roughness: 0.35 });
            if (MO.resources) MO.resources.protect(sharedIronMat);
        }
        return sharedIronMat;
    }

    function getTreeMat(biomeId, hex) {
        const key = `${biomeId}|${hex}`;
        if (sharedTreeMats.has(key)) return sharedTreeMats.get(key);
        const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, flatShading: true });
        if (MO.resources) MO.resources.protect(mat);
        sharedTreeMats.set(key, mat);
        return mat;
    }

    function ensureInfiniteWater() {
        if (infiniteWaterMesh || !MO.groups || !MO.groups.diorama) return;
        let tex = MO.waterTex;
        if (!tex && typeof document !== 'undefined') {
            const wc = document.createElement('canvas');
            wc.width = wc.height = 128;
            const wctx = wc.getContext('2d');
            wctx.fillStyle = '#102d3a';
            wctx.fillRect(0, 0, 128, 128);
            tex = new THREE.CanvasTexture(wc);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(22, 22);
            MO.waterTex = tex;
        }
        const geo = new THREE.PlaneGeometry(220, 220, 1, 1);
        const mat = new THREE.MeshStandardMaterial({
            map: tex || null,
            color: 0x164252,
            roughness: 0.16,
            metalness: 0.32,
            transparent: true,
            opacity: 0.86,
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

    const cGrassDark = new THREE.Color('#3b6e2c');
    const cGrassLight = new THREE.Color('#65a33e');
    const cEarthPad = new THREE.Color('#a17c52');
    const cSandShore = new THREE.Color('#d6c391');
    const cRoadDirt = new THREE.Color('#8c6844');
    const cRoadPaved = new THREE.Color('#475569');
    const cPondBed = new THREE.Color('#164e63');
    const cRockSlope = new THREE.Color('#78716c');
    const cSnowPeak = new THREE.Color('#f1f5f9');
    const tmpCol = new THREE.Color();

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

        for (let i = 0; i < pos.count; i++) {
            const wx = ox + pos.getX(i);
            const wz = oz + pos.getZ(i);
            const h = getProceduralHeight(wx, wz);
            pos.setY(i, h);

            const key = `${Math.floor(wx)},${Math.floor(wz)}`;
            const road = roadCells.get(key);
            const lvl = levelCells.get(key);

            if (h < MO.WATER_LEVEL + 0.04) {
                const t = Math.max(0, Math.min(1, (MO.WATER_LEVEL + 0.04 - h) / 0.55));
                tmpCol.copy(cSandShore).lerp(cPondBed, t);
            } else if (h < MO.WATER_LEVEL + 0.30) {
                const bankT = (h - (MO.WATER_LEVEL + 0.04)) / 0.26;
                tmpCol.copy(cSandShore).lerp(cGrassDark, bankT * 0.85);
            } else {
                const hx = getProceduralHeight(wx + 0.9, wz);
                const hz = getProceduralHeight(wx, wz + 0.9);
                const slope = Math.abs(hx - h) + Math.abs(hz - h);
                const n = valueNoise2D(wx * 0.22, wz * 0.22, seed + 77);
                const moisture = valueNoise2D(wx * 0.04, wz * 0.04, seed + 701);

                tmpCol.copy(cGrassDark).lerp(cGrassLight, Math.min(1, n * 0.72 + moisture * 0.28));
                // Trilhas orgânicas esparsas e solo seco em clareiras
                if (moisture < 0.34 && h < 1.1) {
                    tmpCol.lerp(cEarthPad, (0.34 - moisture) * 0.75);
                }
                // Encostas íngremes e montanhas expõem rocha facetada
                if (slope > 0.36 || h > 1.85) {
                    const rockBlend = Math.min(0.92, Math.max((slope - 0.36) * 1.4, (h - 1.85) * 0.42));
                    tmpCol.lerp(cRockSlope, rockBlend);
                }
                // Picos nevados nas montanhas mais altas
                if (h > 4.2) {
                    const snowBlend = Math.min(0.95, (h - 4.2) / 1.4);
                    tmpCol.lerp(cSnowPeak, snowBlend);
                }
                if (lvl && lvl.weight > 0.05) tmpCol.lerp(cEarthPad, Math.min(0.85, lvl.weight * 0.75));
                if (road && road.built) {
                    tmpCol.lerp(road.kind === 'paved' ? cRoadPaved : cRoadDirt, 0.85);
                }
            }
            col.setXYZ(i, tmpCol.r, tmpCol.g, tmpCol.b);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        chunk.mesh.geometry.computeVertexNormals();
    }

    let sharedFloraAssets = null;
    function getSharedFloraAssets() {
        if (sharedFloraAssets) return sharedFloraAssets;
        sharedFloraAssets = {
            grassGeo: new THREE.ConeGeometry(0.11, 0.28, 4),
            grassMat: new THREE.MeshStandardMaterial({ color: 0x65a33e, roughness: 0.9, flatShading: true }),
            flowerGeo: new THREE.DodecahedronGeometry(0.08, 0),
            flowerMats: [
                new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.7 }),
                new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.7 }),
                new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.7 }),
                new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 })
            ],
            bushGeo: new THREE.IcosahedronGeometry(0.32, 0),
            bushMat: new THREE.MeshStandardMaterial({ color: 0x3f7d2b, roughness: 0.92, flatShading: true }),
            mushCapGeo: new THREE.ConeGeometry(0.20, 0.16, 6),
            mushCapMat: new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.75, flatShading: true }),
            mushStemGeo: new THREE.CylinderGeometry(0.05, 0.07, 0.14, 5),
            mushStemMat: new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 }),
            pebbleGeo: new THREE.DodecahedronGeometry(0.18, 0),
            pebbleMat: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9, flatShading: true })
        };
        if (MO.resources) {
            MO.resources.protect(
                sharedFloraAssets.grassGeo, sharedFloraAssets.grassMat,
                sharedFloraAssets.flowerGeo, ...sharedFloraAssets.flowerMats,
                sharedFloraAssets.bushGeo, sharedFloraAssets.bushMat,
                sharedFloraAssets.mushCapGeo, sharedFloraAssets.mushCapMat,
                sharedFloraAssets.mushStemGeo, sharedFloraAssets.mushStemMat,
                sharedFloraAssets.pebbleGeo, sharedFloraAssets.pebbleMat
            );
        }
        return sharedFloraAssets;
    }

    function populateChunkResourceNodes(chunk) {
        const seed = MO.state ? MO.state.seed : 1234;
        const biomeId = (MO.state && MO.state.biome) || 'forest';
        const ox = chunk.cx * CHUNK_SIZE;
        const oz = chunk.cz * CHUNK_SIZE;
        const flora = getSharedFloraAssets();
        const greens = biomeId === 'cerrado'
            ? ['#5a6328', '#6e7330', '#7f7835', '#91602a']
            : ['#265322', '#35732c', '#4b8f35', '#2d6338'];
        const accentAutumn = '#c96f3b';

        // 1. Camada Ecológica Decorativa (capim, flores, arbustos, cogumelos, pedras ribeirinhas)
        const isNearCenter = Math.max(Math.abs(chunk.cx), Math.abs(chunk.cz)) <= 2;
        const decorCount = isNearCenter ? 8 : 3;
        for (let d = 0; d < decorCount; d++) {
            const dx = ox + (hash2D(chunk.cx * 41 + d, chunk.cz * 23 + 7, seed + 13) - 0.5) * (CHUNK_SIZE - 2.4);
            const dz = oz + (hash2D(chunk.cx * 27 + 9, chunk.cz * 43 + d, seed + 17) - 0.5) * (CHUNK_SIZE - 2.4);
            if (Math.hypot(dx, dz) < 7.0) continue;
            const dy = getProceduralHeight(dx, dz);
            if (dy < MO.WATER_LEVEL + 0.08 || dy > 2.8) continue;

            const { forestMask, moisture } = getTerrainMasks(dx, dz, seed);
            const distRiv = Math.abs(dx - getInfiniteRiverX(dz, seed));

            if (distRiv < getRiverHalfWidth(dz, seed) + 2.2) {
                const peb = new THREE.Mesh(flora.pebbleGeo, flora.pebbleMat);
                const ps = 0.7 + hash2D(d, chunk.cx, seed + 2) * 1.4;
                peb.position.set(dx, dy + 0.05, dz);
                peb.scale.set(ps * 1.3, ps * 0.65, ps);
                peb.rotation.y = d * 1.2;
                chunk.nodesGroup.add(peb);
            } else if (forestMask > 0.54 && d % 4 === 0) {
                const mGrp = new THREE.Group();
                mGrp.position.set(dx, dy, dz);
                const stem = new THREE.Mesh(flora.mushStemGeo, flora.mushStemMat);
                stem.position.y = 0.07;
                const cap = new THREE.Mesh(flora.mushCapGeo, flora.mushCapMat);
                cap.position.y = 0.17;
                mGrp.add(stem, cap);
                chunk.nodesGroup.add(mGrp);
            } else if (moisture > 0.48 && d % 3 === 0) {
                const bush = new THREE.Mesh(flora.bushGeo, flora.bushMat);
                const bs = 0.75 + hash2D(chunk.cx + d, chunk.cz, seed + 9) * 0.65;
                bush.position.set(dx, dy + 0.12, dz);
                bush.scale.set(bs * 1.2, bs * 0.78, bs);
                bush.castShadow = true;
                chunk.nodesGroup.add(bush);
            } else {
                const tuft = new THREE.Mesh(flora.grassGeo, flora.grassMat);
                tuft.position.set(dx, dy + 0.10, dz);
                chunk.nodesGroup.add(tuft);
                if (d % 2 === 0 && forestMask < 0.56) {
                    const fl = new THREE.Mesh(flora.flowerGeo, flora.flowerMats[d % flora.flowerMats.length]);
                    fl.position.set(dx + 0.12, dy + 0.14, dz + 0.08);
                    chunk.nodesGroup.add(fl);
                }
            }
        }

        // 2. Bosques densos e Minas/Pedreiras guiados por altitude, florestaMask e encosta
        const groveX = ox + (hash2D(chunk.cx * 13, chunk.cz * 7, seed + 19) - 0.5) * (CHUNK_SIZE * 0.42);
        const groveZ = oz + (hash2D(chunk.cx * 7, chunk.cz * 13, seed + 23) - 0.5) * (CHUNK_SIZE * 0.42);
        const chunkMasks = getTerrainMasks(ox, oz, seed);
        const isDenseForest = chunkMasks.forestMask > 0.45;
        const treeSlots = isDenseForest ? 7 : 3;
        const totalSlots = treeSlots + 2;

        for (let i = 0; i < totalSlots; i++) {
            const isTree = i < treeSlots;
            const spread = isTree ? (isDenseForest ? 11.0 : 6.0) : (CHUNK_SIZE - 4.0);
            const baseCx = isTree ? groveX : ox;
            const baseCz = isTree ? groveZ : oz;
            const rx = baseCx + (hash2D(chunk.cx * 31 + i, chunk.cz * 17 + 3, seed) - 0.5) * spread;
            const rz = baseCz + (hash2D(chunk.cx * 19 + 5, chunk.cz * 29 + i, seed) - 0.5) * spread;
            if (Math.hypot(rx, rz) < 10.5) continue;
            const ry = getProceduralHeight(rx, rz);
            if (ry < MO.WATER_LEVEL + 0.22 || ry > 4.2) continue;

            const slope = Math.abs(getProceduralHeight(rx + 0.8, rz) - ry) + Math.abs(getProceduralHeight(rx, rz + 0.8) - ry);
            if (isTree && slope > 0.85) continue;

            const rollMine = !isTree && i === totalSlots - 1 && (ry > 0.85 || hash2D(chunk.cx + 9, chunk.cz + 11, seed + 91) < 0.48);
            const kind = isTree ? 'wood' : (rollMine ? 'mine' : (hash2D(i, chunk.cx + chunk.cz, seed + 55) < 0.62 ? 'stone' : 'iron'));
            const nodeId = `node-${chunk.cx},${chunk.cz}-${i}`;
            const existing = resourceNodes.get(nodeId);
            if (existing && existing.amount <= 0) continue;

            const grp = new THREE.Group();
            grp.position.set(rx, ry - 0.04, rz);

            if (kind === 'wood') {
                const sc = 0.85 + hash2D(i * 3, chunk.cx + chunk.cz, seed + 41) * 0.68;
                const trunkH = 1.35 * sc;
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * sc, 0.15 * sc, trunkH, 6), MO.mats.trunkWood);
                trunk.position.y = trunkH * 0.5;
                trunk.castShadow = true;
                grp.add(trunk);
                const useAutumn = biomeId === 'forest' && hash2D(i, chunk.cx * 5, seed + 88) < 0.14;
                const leafHex = useAutumn ? accentAutumn : greens[i % greens.length];
                if (i % 2 === 0) {
                    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.76 * sc, 1.15 * sc, 6), getTreeMat(biomeId, leafHex));
                    c1.position.y = trunkH * 0.82;
                    c1.castShadow = true;
                    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.54 * sc, 0.95 * sc, 6), getTreeMat(biomeId, leafHex));
                    c2.position.y = trunkH * 1.35;
                    c2.castShadow = true;
                    grp.add(c1, c2);
                } else {
                    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.68 * sc, 0), getTreeMat(biomeId, leafHex));
                    canopy.position.y = trunkH + 0.25 * sc;
                    canopy.scale.set(1.18, 0.88, 1.18);
                    canopy.castShadow = true;
                    grp.add(canopy);
                }
            } else if (kind === 'mine') {
                const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 0), MO.mats.stone);
                hill.position.set(0, 0.48, -0.25);
                hill.scale.set(1.5, 0.95, 1.2);
                hill.castShadow = true;
                const caveHole = new THREE.Mesh(
                    new THREE.BoxGeometry(0.72, 0.72, 0.36),
                    MO.mats.hole || new THREE.MeshBasicMaterial({ color: 0x090d16 })
                );
                caveHole.position.set(0, 0.36, 0.42);
                const postL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.82, 0.10), MO.mats.wood);
                postL.position.set(-0.36, 0.41, 0.60);
                const postR = postL.clone();
                postR.position.x = 0.36;
                const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.10, 0.12), MO.mats.wood);
                lintel.position.set(0, 0.82, 0.60);
                const veinA = new THREE.Mesh(new THREE.DodecahedronGeometry(0.20, 0), getIronOreMat());
                veinA.position.set(-0.58, 0.56, 0.34);
                const veinB = veinA.clone();
                veinB.position.set(0.58, 0.42, 0.26);
                const cart = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.25, 0.36), MO.mats.steel);
                cart.position.set(0.08, 0.16, 0.92);
                grp.rotation.y = hash2D(chunk.cx, chunk.cz, seed + 17) * Math.PI * 2;
                grp.add(hill, caveHole, postL, postR, lintel, veinA, veinB, cart);
            } else {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), MO.mats.stone);
                rock.position.y = 0.24;
                rock.scale.set(1.3, 0.75, 1.18);
                rock.castShadow = true;
                grp.add(rock);
                if (kind === 'iron') {
                    const vein = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), getIronOreMat());
                    vein.position.set(0.15, 0.38, 0.11);
                    grp.add(vein);
                }
            }

            chunk.nodesGroup.add(grp);
            const maxAmt = kind === 'mine' ? 14 : (kind === 'wood' ? 5 : 6);
            const node = existing || {
                id: nodeId,
                chunkKey: `${chunk.cx},${chunk.cz}`,
                kind,
                x: rx,
                z: rz,
                amount: maxAmt,
                maxAmount: maxAmt,
                res: false,
                mesh: grp
            };
            node.mesh = grp;
            node.chunkKey = `${chunk.cx},${chunk.cz}`;
            resourceNodes.set(nodeId, node);
            chunk.resourceNodes.push(node);
        }
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
        chunk.resourceNodes.forEach(n => {
            if (n.amount > 0 && !n.res) resourceNodes.delete(n.id);
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

    function init() {
        reset();
        const tx = MO.camOrbit && MO.camOrbit.target ? MO.camOrbit.target.x : 0;
        const tz = MO.camOrbit && MO.camOrbit.target ? MO.camOrbit.target.z : 0;
        updateAround(tx, tz);
    }

    function reset() {
        if (MO.groups && MO.groups.terrainChunks && MO.resources) {
            MO.resources.clearGroup(MO.groups.terrainChunks);
        }
        chunks.clear();
        resourceNodes.clear();
        levelCells.clear();
        roadCells.clear();
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

    function harvestNode(node, qty = 1) {
        if (!node || node.amount <= 0) return 0;
        const taken = Math.min(node.amount, qty);
        node.amount -= taken;
        node.res = false;
        if (node.amount <= 0 && node.mesh) {
            node.mesh.scale.set(0.55, 0.22, 0.55);
        }
        return taken;
    }

    MO.chunkManager = {
        CHUNK_SIZE,
        init,
        reset,
        updateAround,
        getHeightAt: getProceduralHeight,
        getRiverCenterX: getInfiniteRiverX,
        getChunkMeshes,
        getLoadedChunkCount: () => chunks.size,
        paintRoadCell,
        paintLevelArea,
        getRoadCell: (wx, wz) => roadCells.get(`${Math.floor(wx)},${Math.floor(wz)}`) || null,
        getLevelCell: (wx, wz) => levelCells.get(`${Math.floor(wx)},${Math.floor(wz)}`) || null,
        getLoadedResourceNodes,
        harvestNode,
        refreshAllLoadedChunks: () => chunks.forEach(c => updateChunkMeshGeometry(c))
    };
})(window.MO = window.MO || {});

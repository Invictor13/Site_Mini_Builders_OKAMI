// =========================================================================
// WORLD: GERADOR PROCEDURAL MULTI-MODO DE TERRENO, NATUREZA & FASE 0
// =========================================================================
(function(MO) {
    MO.terrainMesh = null;
    MO.terrainSkirtMesh = null;
    MO.waterSurfaceMesh = null;
    MO.waterTex = null;
    MO.terrainGridLines = null;

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

    function fbmNoise(x, z, seed) {
        let val = 0;
        let amp = 0.55;
        let freq = 0.16;
        for (let o = 0; o < 4; o++) {
            val += (valueNoise2D(x * freq, z * freq, seed + o * 101) - 0.5) * 2 * amp;
            freq *= 2.05;
            amp *= 0.48;
        }
        return val;
    }

    function sampleMapWeight(mapArr, x, z) {
        if (!mapArr) return 0;
        const u = ((x / (MO.DIORAMA_R * 2)) + 0.5) * (MO.LEVEL_RES - 1);
        const v = ((z / (MO.DIORAMA_R * 2)) + 0.5) * (MO.LEVEL_RES - 1);
        if (u < 0 || u >= MO.LEVEL_RES - 1 || v < 0 || v >= MO.LEVEL_RES - 1) return 0;
        const ix = Math.floor(u), iz = Math.floor(v);
        const fx = u - ix, fz = v - iz;
        const w00 = mapArr[iz * MO.LEVEL_RES + ix];
        const w10 = mapArr[iz * MO.LEVEL_RES + ix + 1];
        const w01 = mapArr[(iz + 1) * MO.LEVEL_RES + ix];
        const w11 = mapArr[(iz + 1) * MO.LEVEL_RES + ix + 1];
        return (w00 * (1 - fx) + w10 * fx) * (1 - fz) + (w01 * (1 - fx) + w11 * fx) * fz;
    }

    function paintMapWeight(mapArr, wx, wz, radius, strength) {
        if (!mapArr) return;
        for (let iz = 0; iz < MO.LEVEL_RES; iz++) {
            const z = ((iz / (MO.LEVEL_RES - 1)) - 0.5) * (MO.DIORAMA_R * 2);
            if (Math.abs(z - wz) > radius) continue;
            for (let ix = 0; ix < MO.LEVEL_RES; ix++) {
                const x = ((ix / (MO.LEVEL_RES - 1)) - 0.5) * (MO.DIORAMA_R * 2);
                const dist = Math.hypot(x - wx, z - wz);
                if (dist < radius) {
                    const falloff = 1 - (dist / radius);
                    const smooth = falloff * falloff * (3 - 2 * falloff);
                    const idx = iz * MO.LEVEL_RES + ix;
                    mapArr[idx] = Math.min(1, mapArr[idx] + smooth * strength);
                }
            }
        }
    }

    function sampleLevelWeight(x, z) {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            const c = MO.chunkManager.getLevelCell(x, z);
            if (c) return c.weight;
        }
        return sampleMapWeight(MO.levelMap, x, z);
    }

    function paintLevelWeight(wx, wz, radius, strength) {
        paintMapWeight(MO.levelMap, wx, wz, radius, strength);
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            MO.chunkManager.paintLevelArea(wx, wz, radius, strength, MO.PLATEAU_Y);
        }
    }

    function sampleRoadWeight(x, z) {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            const r = MO.chunkManager.getRoadCell(x, z);
            if (r) return r.built ? 1.0 : 0.45;
        }
        return sampleMapWeight(MO.roadMap, x, z);
    }

    function paintRoadWeight(wx, wz, radius, strength, kind = 'dirt', built = true) {
        paintMapWeight(MO.roadMap, wx, wz, radius, strength);
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            MO.chunkManager.paintRoadCell(wx, wz, kind, built, Math.max(1, Math.round(radius)));
        }
    }

    function getRiverCenterX(z, seed) {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            return MO.chunkManager.getRiverCenterX(z, seed);
        }
        const s = seed !== undefined ? seed : MO.state.seed;
        const baseShift = ((s % 5) - 2) * 0.35;
        return 1.6 + baseShift + Math.sin(z * 0.28 + (s % 11)) * 0.55;
    }

    function getTowerHillCenter(seed) {
        const s = seed !== undefined ? seed : MO.state.seed;
        return {
            x: 8.6 + (hash2D(19, 23, s) - 0.5) * 1.4,
            z: -5.2 + (hash2D(29, 31, s) - 0.5) * 1.4
        };
    }

    // FONTE ÚNICA DA VERDADE DE ELEVAÇÃO PARA O TERRENO (CHUNKS INFINITOS OU DIORAMA)
    function getTerrainHeight(x, z) {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            return MO.chunkManager.getHeightAt(x, z);
        }
        const s = MO.state.seed;
        const mode = MO.state.mode;
        let h = 0.24 + fbmNoise(x, z, s) * 0.58;

        if (MO.state.unifiedVillage) {
            // 1. Rio cortando de norte a sul, separando Margem Oeste e Margem Leste
            const riverX = getRiverCenterX(z, s);
            const riverDist = Math.abs(x - riverX);
            if (riverDist < 2.55) {
                const t = 1 - riverDist / 2.55;
                h -= t * t * (3 - 2 * t) * 1.42;
            } else if (riverDist < 3.8) {
                // Margens ligeiramente firmes para apoiar cabeceiras da ponte
                h = Math.max(0.28, h * 0.6 + 0.22);
            }

            // 2. Colina natural na Margem Leste para a Torre / Mirante
            const hill = getTowerHillCenter(s);
            const distHill = Math.hypot(x - hill.x, z - hill.z);
            if (distHill < 4.4) {
                const t = 1 - distHill / 4.4;
                h += t * t * 0.72;
            }

            // 3. Aclive suave na borda norte
            if (z < -7.5) {
                h += Math.min(3.5, -7.5 - z) * 0.14;
            }
        } else if (mode === 'house') {
            const slopeDirX = (hash2D(1, 2, s) - 0.5) * 0.14;
            const slopeDirZ = -0.09 + (hash2D(3, 4, s) - 0.5) * 0.08;
            h += x * slopeDirX + z * slopeDirZ;
            if (z < -4.2) h += Math.min(4.5, -4.2 - z) * 0.24;
            const pondCenterX = 2.6 + (hash2D(7, 8, s) - 0.5) * 1.6;
            const pondCenterZ = 7.4;
            const pondDist = Math.hypot((x - pondCenterX) * 0.72, (z - pondCenterZ) * 1.15);
            if (pondDist < 3.4) {
                const t = 1 - pondDist / 3.4;
                h -= t * t * (3 - 2 * t) * 1.35;
            }
        } else if (mode === 'bridge') {
            const meander = Math.sin(z * 0.35 + (s % 10)) * 0.45;
            const riverDist = Math.abs(x - meander);
            if (riverDist < 3.25) {
                const t = 1 - riverDist / 3.25;
                h -= t * t * (3 - 2 * t) * 1.55;
            } else {
                h = 0.42 + fbmNoise(x, z, s) * 0.45;
            }
            if (z < -4.8) h += Math.min(3.5, -4.8 - z) * 0.20;
        } else if (mode === 'building') {
            h = 0.26 + fbmNoise(x, z, s) * 0.55 - z * 0.04;
            if (z < -4.6) h += Math.min(3.2, -4.6 - z) * 0.18;
        } else if (mode === 'tower') {
            const distC = Math.hypot(x, z);
            if (distC < 4.5) {
                const t = 1 - distC / 4.5;
                h += t * t * 0.55;
            }
            const pd = Math.hypot(x - 4.8, z - 4.6);
            if (pd < 2.6) {
                const t = 1 - pd / 2.6;
                h -= t * t * 1.1;
            }
        }

        // Suavização leve nos pontos de apoio (Caixa de Ferramentas, Masseira, Bancada, Descarga)
        [MO.STATION_TOOLBOX, MO.STATION_UNLOAD, MO.STATION_MIXER, MO.STATION_WORKBENCH, MO.STATION_BRICK].forEach(st => {
            if (!st) return;
            const d = Math.hypot(x - st.x, z - st.z);
            if (d < 2.0) {
                const t = 1 - d / 2.0;
                h = h * (1 - t * 0.65) + Math.max(0.24, h) * (t * 0.65);
            }
        });

        const rw = sampleRoadWeight(x, z);
        if (rw > 0.001) {
            h = h * (1 - rw * 0.8) + (MO.PLATEAU_Y + 0.03) * (rw * 0.8);
        }

        const lw = sampleLevelWeight(x, z);
        if (lw > 0.001) {
            const targetY = mode === 'bridge' ? 0.50 : MO.PLATEAU_Y;
            h = h * (1 - lw) + targetY * lw;
        }

        return Math.max(-1.05, Math.min(2.2, h));
    }

    MO.hash2D = hash2D;
    MO.sampleLevelWeight = sampleLevelWeight;
    MO.paintLevelWeight = paintLevelWeight;
    MO.sampleRoadWeight = sampleRoadWeight;
    MO.paintRoadWeight = paintRoadWeight;
    MO.getRiverCenterX = getRiverCenterX;
    MO.getTowerHillCenter = getTowerHillCenter;
    MO.getTerrainHeight = getTerrainHeight;

    MO.createDioramaBase = function() {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            MO.chunkManager.updateAround(0, 0);
            return;
        }
        const dioramaGroup = MO.groups.diorama;
        const woodBase = new THREE.Mesh(
            new THREE.CylinderGeometry(MO.DIORAMA_R + 0.16, MO.DIORAMA_R + 0.28, 1.35, 72),
            MO.mats.baseWood
        );
        woodBase.position.y = -1.68;
        woodBase.receiveShadow = true;
        woodBase.castShadow = true;
        dioramaGroup.add(woodBase);

        const slateRing = new THREE.Mesh(
            new THREE.CylinderGeometry(MO.DIORAMA_R + 0.20, MO.DIORAMA_R + 0.20, 0.14, 72),
            MO.mats.baseSlate
        );
        slateRing.position.y = -1.0;
        slateRing.receiveShadow = true;
        dioramaGroup.add(slateRing);

        const wc = document.createElement('canvas');
        wc.width = wc.height = 256;
        const wctx = wc.getContext('2d');
        wctx.fillStyle = '#102d3a';
        wctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 380; i++) {
            wctx.fillStyle = Math.random() > 0.5 ? 'rgba(186,230,253,0.05)' : 'rgba(0,0,0,0.07)';
            wctx.fillRect(Math.random() * 256, Math.random() * 256, 14 + Math.random() * 22, 1.5);
        }
        MO.waterTex = new THREE.CanvasTexture(wc);
        MO.waterTex.wrapS = MO.waterTex.wrapT = THREE.RepeatWrapping;
        MO.waterTex.repeat.set(3, 3);

        const WSEG = 36;
        const wGeo = new THREE.BufferGeometry();
        const wPos = new Float32Array((WSEG + 1) * (WSEG + 1) * 3);
        const wUvs = new Float32Array((WSEG + 1) * (WSEG + 1) * 2);
        const wIdx = [];
        const waterR = MO.DIORAMA_R - 0.04;
        for (let iz = 0; iz <= WSEG; iz++) {
            const v = (iz / WSEG) * 2 - 1;
            for (let ix = 0; ix <= WSEG; ix++) {
                const u = (ix / WSEG) * 2 - 1;
                const dx = u * Math.sqrt(Math.max(0, 1 - (v * v) * 0.5));
                const dz = v * Math.sqrt(Math.max(0, 1 - (u * u) * 0.5));
                const pIdx = iz * (WSEG + 1) + ix;
                wPos[pIdx * 3] = dx * waterR;
                wPos[pIdx * 3 + 1] = 0;
                wPos[pIdx * 3 + 2] = dz * waterR;
                wUvs[pIdx * 2] = (dx + 1) * 0.5;
                wUvs[pIdx * 2 + 1] = (dz + 1) * 0.5;
            }
        }
        for (let iz = 0; iz < WSEG; iz++) {
            for (let ix = 0; ix < WSEG; ix++) {
                const a = iz * (WSEG + 1) + ix;
                const b = a + 1;
                const c = a + (WSEG + 1);
                const d = c + 1;
                wIdx.push(a, c, b, b, c, d);
            }
        }
        wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
        wGeo.setAttribute('uv', new THREE.BufferAttribute(wUvs, 2));
        wGeo.setIndex(wIdx);
        wGeo.computeVertexNormals();

        MO.waterSurfaceMesh = new THREE.Mesh(
            wGeo,
            new THREE.MeshStandardMaterial({
                map: MO.waterTex,
                color: 0x164252,
                roughness: 0.14,
                metalness: 0.34,
                transparent: true,
                opacity: 0.88,
                side: THREE.DoubleSide
            })
        );
        MO.waterSurfaceMesh.position.y = MO.WATER_LEVEL + 0.02;
        MO.waterSurfaceMesh.receiveShadow = true;
        dioramaGroup.add(MO.waterSurfaceMesh);

        if (MO.resources) {
            MO.resources.protect(
                woodBase.geometry,
                slateRing.geometry,
                MO.waterTex,
                MO.waterSurfaceMesh.geometry,
                MO.waterSurfaceMesh.material
            );
        }
    };

    MO.createProceduralTerrainMesh = function() {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            if (MO.terrainSkirtMesh && MO.groups && MO.groups.diorama) {
                MO.resources.removeAndDispose(MO.groups.diorama, MO.terrainSkirtMesh);
                MO.terrainSkirtMesh = null;
            }
            MO.chunkManager.init();
            MO.updateTerrainGridLines();
            MO.updatePhase0StatusPills();
            return;
        }
        const dioramaGroup = MO.groups.diorama;
        if (MO.terrainMesh) {
            MO.resources.removeAndDispose(dioramaGroup, MO.terrainMesh);
            MO.terrainMesh = null;
        }
        if (MO.terrainSkirtMesh) {
            MO.resources.removeAndDispose(dioramaGroup, MO.terrainSkirtMesh);
            MO.terrainSkirtMesh = null;
        }

        const SEG = 60;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array((SEG + 1) * (SEG + 1) * 3);
        const colors = new Float32Array((SEG + 1) * (SEG + 1) * 3);
        const indices = [];

        for (let iz = 0; iz <= SEG; iz++) {
            const v = (iz / SEG) * 2 - 1;
            for (let ix = 0; ix <= SEG; ix++) {
                const u = (ix / SEG) * 2 - 1;
                const dx = u * Math.sqrt(Math.max(0, 1 - (v * v) * 0.5));
                const dz = v * Math.sqrt(Math.max(0, 1 - (u * u) * 0.5));
                const wx = dx * MO.DIORAMA_R;
                const wz = dz * MO.DIORAMA_R;
                const idx = (iz * (SEG + 1) + ix) * 3;
                positions[idx] = wx;
                positions[idx + 1] = 0;
                positions[idx + 2] = wz;
            }
        }

        for (let iz = 0; iz < SEG; iz++) {
            for (let ix = 0; ix < SEG; ix++) {
                const a = iz * (SEG + 1) + ix;
                const b = a + 1;
                const c = a + (SEG + 1);
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setIndex(indices);

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.94,
            metalness: 0.02,
            flatShading: false
        });

        MO.terrainMesh = new THREE.Mesh(geo, mat);
        MO.terrainMesh.receiveShadow = true;
        MO.terrainMesh.castShadow = true;
        dioramaGroup.add(MO.terrainMesh);

        const rimCount = 96;
        const skirtGeo = new THREE.BufferGeometry();
        const sPos = new Float32Array((rimCount + 1) * 2 * 3);
        const sIdx = [];
        for (let i = 0; i <= rimCount; i++) {
            const ang = (i / rimCount) * Math.PI * 2;
            const rx = Math.cos(ang) * MO.DIORAMA_R;
            const rz = Math.sin(ang) * MO.DIORAMA_R;
            const topIdx = i * 6;
            sPos[topIdx] = rx; sPos[topIdx + 1] = 0; sPos[topIdx + 2] = rz;
            sPos[topIdx + 3] = rx; sPos[topIdx + 4] = -1.0; sPos[topIdx + 5] = rz;
            if (i < rimCount) {
                const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
                sIdx.push(a, b, c, b, d, c);
            }
        }
        skirtGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
        skirtGeo.setIndex(sIdx);
        MO.terrainSkirtMesh = new THREE.Mesh(
            skirtGeo,
            new THREE.MeshStandardMaterial({ color: 0x3f3327, roughness: 0.96, side: THREE.DoubleSide })
        );
        MO.terrainSkirtMesh.receiveShadow = true;
        dioramaGroup.add(MO.terrainSkirtMesh);

        MO.updateTerrainGeometry();
    };

    const cGrassDark = new THREE.Color('#344528');
    const cGrassLight = new THREE.Color('#465934');
    const cEarthPad = new THREE.Color('#7a654d');
    const cRoadDirt = new THREE.Color('#6b533b');
    const cPondBed = new THREE.Color('#1d2a2d');
    const cRockSlope = new THREE.Color('#52544f');
    const tmpColor = new THREE.Color();

    MO.updateTerrainGeometry = function() {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            MO.chunkManager.refreshAllLoadedChunks();
            if (MO.state.weeds && MO.state.weeds.length > 0) {
                MO.state.weeds.forEach(w => {
                    if (!w.cleared && w.mesh) w.mesh.position.y = getTerrainHeight(w.x, w.z);
                });
            }
            MO.updateTerrainGridLines();
            MO.updatePhase0StatusPills();
            return;
        }
        if (!MO.terrainMesh) return;
        const state = MO.state;
        const biome = (MO.BIOMES && MO.BIOMES[state.biome]) || (MO.BIOMES && MO.BIOMES.forest);
        if (biome) {
            cGrassDark.set(biome.grassDark);
            cGrassLight.set(biome.grassLight);
            cEarthPad.set(biome.earthPad);
            cPondBed.set(biome.pondBed);
            cRockSlope.set(biome.rockSlope);
        }

        const pos = MO.terrainMesh.geometry.attributes.position;
        const col = MO.terrainMesh.geometry.attributes.color;

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const h = getTerrainHeight(x, z);
            pos.setY(i, h);

            const lw = sampleLevelWeight(x, z);
            const rw = sampleRoadWeight(x, z);
            if (h < MO.WATER_LEVEL + 0.08) {
                const t = Math.max(0, Math.min(1, (MO.WATER_LEVEL + 0.08 - h) / 0.45));
                tmpColor.copy(cEarthPad).lerp(cPondBed, t);
            } else {
                const n = valueNoise2D(x * 0.6, z * 0.6, state.seed + 77);
                tmpColor.copy(cGrassDark).lerp(cGrassLight, n);
                if (h > 1.05 || state.mode === 'tower') tmpColor.lerp(cRockSlope, Math.min(0.45, Math.max(0, (h - 0.75) * 0.7)));
                if (lw > 0.05) tmpColor.lerp(cEarthPad, Math.min(0.92, lw * 1.15));
                if (rw > 0.04) tmpColor.lerp(cRoadDirt, Math.min(0.94, rw * 1.2));
            }
            col.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        MO.terrainMesh.geometry.computeVertexNormals();

        const sPos = MO.terrainSkirtMesh.geometry.attributes.position;
        for (let i = 0; i < sPos.count; i += 2) {
            const rx = sPos.getX(i);
            const rz = sPos.getZ(i);
            sPos.setY(i, Math.max(-0.98, getTerrainHeight(rx, rz)));
        }
        sPos.needsUpdate = true;
        MO.terrainSkirtMesh.geometry.computeVertexNormals();

        if (state.weeds && state.weeds.length > 0) {
            state.weeds.forEach(w => {
                if (!w.cleared && w.mesh) {
                    w.mesh.position.y = getTerrainHeight(w.x, w.z);
                }
            });
        }

        MO.updateTerrainGridLines();
        MO.updatePhase0StatusPills();
    };

    MO.updateTerrainGridLines = function() {
        if (MO.terrainGridLines) {
            MO.resources.removeAndDispose(MO.scene, MO.terrainGridLines);
            MO.terrainGridLines = null;
        }
        if (MO.state.cityMode || MO.state.mode !== 'house' || MO.state.phase > 1) return;

        const pts = [];
        const half = MO.GRID_SIZE / 2;
        const activeLot = (MO.regionManager && MO.worldManager && MO.worldManager.meta.persistentGrowth)
            ? MO.regionManager.getActiveLot()
            : null;
        const minX = activeLot ? (activeLot.originX - activeLot.halfW) : -half;
        const maxX = activeLot ? (activeLot.originX + activeLot.halfW) : half;
        const minZ = activeLot ? (activeLot.originZ - activeLot.halfD) : (-half + MO.GRID_OFFSET_Z);
        const maxZ = activeLot ? (activeLot.originZ + activeLot.halfD) : (half + MO.GRID_OFFSET_Z);
        const spanX = maxX - minX;
        const spanZ = maxZ - minZ;
        const step = 0.25;

        for (let wx = minX; wx <= maxX + 1e-4; wx += 1) {
            for (let s = 0; s < spanZ / step; s++) {
                const z1 = minZ + s * step;
                const z2 = z1 + step;
                pts.push(wx, getTerrainHeight(wx, z1) + 0.03, z1);
                pts.push(wx, getTerrainHeight(wx, z2) + 0.03, z2);
            }
        }
        for (let wz = minZ; wz <= maxZ + 1e-4; wz += 1) {
            for (let s = 0; s < spanX / step; s++) {
                const x1 = minX + s * step;
                const x2 = x1 + step;
                pts.push(x1, getTerrainHeight(x1, wz) + 0.03, wz);
                pts.push(x2, getTerrainHeight(x2, wz) + 0.03, wz);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        MO.terrainGridLines = new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.28 })
        );
        MO.scene.add(MO.terrainGridLines);
    };

    MO.hideTerrainGridLines = function() {
        if (MO.terrainGridLines) MO.terrainGridLines.visible = false;
    };

    const cachedTreeMats = new Map();
    function getTreeFoliageMat(biomeId, hex) {
        const key = `${biomeId}|${hex}`;
        if (cachedTreeMats.has(key)) return cachedTreeMats.get(key);
        const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, flatShading: true });
        if (MO.resources && MO.resources.protectMaterials) {
            MO.resources.protectMaterials([mat]);
        }
        cachedTreeMats.set(key, mat);
        return mat;
    }

    function createRealisticTree(x, z, scale, isConifer) {
        const y = getTerrainHeight(x, z);
        if (y < MO.WATER_LEVEL + 0.14) return;

        const tree = new THREE.Group();
        tree.position.set(x, y - 0.05, z);
        const biomeId = MO.state.biome;

        if (biomeId === 'coast') {
            const trunkH = 2.1 * scale;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.11 * scale, trunkH, 7), MO.mats.trunkWood);
            trunk.position.y = trunkH / 2;
            trunk.rotation.z = 0.12;
            trunk.castShadow = true;
            tree.add(trunk);
            const frondMat = getTreeFoliageMat(biomeId, 0x3f6212);
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI * 2;
                const frond = new THREE.Mesh(new THREE.BoxGeometry(0.95 * scale, 0.05, 0.24 * scale), frondMat);
                frond.position.set(Math.cos(ang) * 0.42 * scale - 0.12, trunkH - 0.05, Math.sin(ang) * 0.42 * scale);
                frond.rotation.y = -ang;
                frond.rotation.z = -0.35;
                frond.castShadow = true;
                tree.add(frond);
            }
            MO.groups.nature.add(tree);
            MO.state.site.swayingTrees.push(tree);
            return;
        }

        const trunkH = (isConifer ? 1.85 : 1.55) * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07 * scale, 0.14 * scale, trunkH, 7),
            MO.mats.trunkWood
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        const greens = biomeId === 'cerrado'
            ? ['#5a6328', '#6e7330', '#7f7835', '#4b5222']
            : ['#263820', '#314628', '#3c522f', '#1f2e1a'];

        if (isConifer && biomeId !== 'cerrado') {
            for (let i = 0; i < 4; i++) {
                const mat = getTreeFoliageMat(biomeId, greens[i % greens.length]);
                const cone = new THREE.Mesh(new THREE.ConeGeometry((0.92 - i * 0.18) * scale, (1.12 - i * 0.1) * scale, 7), mat);
                cone.position.y = trunkH * 0.55 + i * 0.5 * scale;
                cone.rotation.y = i * 0.8;
                cone.castShadow = true;
                cone.receiveShadow = true;
                tree.add(cone);
            }
        } else {
            for (let i = 0; i < 14; i++) {
                const ang = (i / 14) * Math.PI * 2 + (i * 0.37);
                const rad = (i < 3 ? 0.14 : 0.34 + (i % 3) * 0.16) * scale;
                const py = trunkH + (0.15 + (i % 4) * 0.22) * scale;
                const mat = getTreeFoliageMat(biomeId, greens[i % greens.length]);
                const clump = new THREE.Mesh(new THREE.IcosahedronGeometry((0.26 + (i % 3) * 0.07) * scale, 0), mat);
                clump.position.set(Math.cos(ang) * rad, py, Math.sin(ang) * rad);
                clump.scale.set(1.25, 0.72, 1.15);
                clump.castShadow = true;
                clump.receiveShadow = true;
                tree.add(clump);
            }
        }
        MO.groups.nature.add(tree);
        MO.state.site.swayingTrees.push(tree);
    }

    MO.populateNatureAndSplats = function() {
        const natureGroup = MO.groups.nature;
        const splatGroup = MO.groups.splat;
        MO.state.site.swayingTrees = [];
        MO.resources.clearGroup(natureGroup);
        MO.resources.clearGroup(splatGroup);

        const s = MO.state.seed;
        if (!MO.state.infiniteWorld) {
            for (let i = 0; i < 22; i++) {
                const ang = (i / 22) * Math.PI * 2 + hash2D(i, 11, s) * 0.35;
                const dist = (MO.DIORAMA_R - 2.6) + hash2D(i, 22, s) * 1.9;
                const tx = Math.cos(ang) * dist;
                const tz = Math.sin(ang) * dist;
                if (MO.STATION_ROAD_ENTRY && Math.hypot(tx - MO.STATION_ROAD_ENTRY.x, tz - MO.STATION_ROAD_ENTRY.z) < 2.5) continue;
                if (Math.hypot(tx - MO.STATION_MIXER.x, tz - MO.STATION_MIXER.z) < 2.2) continue;
                if (Math.hypot(tx - MO.STATION_BRICK.x, tz - MO.STATION_BRICK.z) < 2.0) continue;
                if (Math.hypot(tx - MO.STATION_REBAR.x, tz - MO.STATION_REBAR.z) < 1.9) continue;
                if (MO.state.mode === 'bridge' && Math.abs(tz) < 2.2) continue;
                const scale = 0.85 + hash2D(i, 33, s) * 0.55;
                createRealisticTree(tx, tz, scale, hash2D(i, 44, s) > 0.45);
            }
        }

        for (let i = 0; i < 22; i++) {
            const ang = hash2D(i, 55, s) * Math.PI * 2;
            const dist = 9.5 + hash2D(i, 66, s) * 4.2;
            const rx = Math.cos(ang) * dist;
            const rz = Math.sin(ang) * dist;
            const ry = getTerrainHeight(rx, rz);
            if (ry < MO.WATER_LEVEL + 0.14) continue;
            if (Math.abs(rx) < 8.5 && rz > -7.5 && rz < 5.5) continue;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + hash2D(i, 77, s) * 0.25, 0), MO.mats.stone);
            rock.position.set(rx, ry + 0.03, rz);
            rock.scale.set(1.3, 0.65, 1.1);
            rock.rotation.set(i, i * 0.7, 0);
            rock.castShadow = true;
            rock.receiveShadow = true;
            natureGroup.add(rock);
        }

        // Partículas vivas em movimento suave pelo vento (substituindo os antigos pontos estáticos!)
        MO.state.site.ambientMotes = [];
        const moteGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const motePalette = [0xfef08a, 0x86efac, 0xd9f99d];
        for (let i = 0; i < 24; i++) {
            const mMat = new THREE.MeshBasicMaterial({
                color: motePalette[i % motePalette.length],
                transparent: true,
                opacity: 0.45
            });
            const mote = new THREE.Mesh(moteGeo, mMat);
            const ang = hash2D(i, 81, s) * Math.PI * 2;
            const dist = 2.0 + hash2D(i, 82, s) * 6.0;
            const px = Math.cos(ang) * dist;
            const pz = Math.sin(ang) * dist;
            const py = Math.max(0.25, getTerrainHeight(px, pz) + 0.35 + hash2D(i, 83, s) * 1.4);
            mote.position.set(px, py, pz);
            splatGroup.add(mote);
            MO.state.site.ambientMotes.push({
                mesh: mote,
                baseX: px,
                baseY: py,
                baseZ: pz,
                phase: hash2D(i, 84, s) * Math.PI * 2,
                speed: 0.45 + hash2D(i, 85, s) * 0.65
            });
        }
    };

    const trackGeo = new THREE.PlaneGeometry(0.14, 0.22);
    const tireTrackGeo = new THREE.PlaneGeometry(0.22, 0.36);
    const rippleRingGeo = new THREE.RingGeometry(0.10, 0.17, 18);
    if (MO.resources) MO.resources.protect(trackGeo, tireTrackGeo, rippleRingGeo);

    MO.spawnGroundTrack = function(x, z, kind = 'boot', yaw = 0) {
        const state = MO.state;
        const h = getTerrainHeight(x, z);

        // Na água ou beira d'água rasa: cria ondulação e respingos responsivos
        if (h <= MO.WATER_LEVEL + 0.10) {
            MO.spawnWaterRipple(x, z, kind === 'tire' ? 1.15 : 0.72, false);
            return;
        }

        const lw = sampleLevelWeight(x, z);
        const isWet = state.weather === 'rain' || h < MO.WATER_LEVEL + 0.28;
        let colorHex = 0x2c3e1f; // Grama amassada padrão
        if (state.mode === 'bridge' && Math.abs(x) < 3.6 && h > 0.85) {
            colorHex = 0x64748b; // Pó cinza na pista da ponte
        } else if (isWet) {
            colorHex = 0x3b2f24; // Lama escura
        } else if (state.biome === 'coast') {
            colorHex = 0x9c8959; // Areia afundada
        } else if (lw > 0.22) {
            colorHex = 0x5c4733; // Terra compactada do platô
        }

        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: isWet ? 0.68 : 0.50,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const m = new THREE.Mesh(kind === 'tire' ? tireTrackGeo : trackGeo, mat);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -yaw;
        m.position.set(x, h + 0.022, z);
        MO.groups.fx.add(m);

        const maxLife = isWet ? 7.5 : 5.5;
        state.site.tracks.push({ mesh: m, mat, life: maxLife, maxLife, startOp: mat.opacity });
        if (state.site.tracks.length > 90) {
            const old = state.site.tracks.shift();
            MO.resources.removeAndDispose(MO.groups.fx, old.mesh);
        }
    };

    MO.spawnWaterRipple = function(x, z, strength = 1.0, withSound = false) {
        const state = MO.state;
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(rippleRingGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, MO.WATER_LEVEL + 0.048, z);
        MO.groups.fx.add(ring);

        state.site.ripples.push({
            x, z,
            age: 0,
            maxAge: 1.45,
            amp: 0.055 * strength,
            ring,
            ringMat,
            strength
        });
        if (state.site.ripples.length > 18) {
            const old = state.site.ripples.shift();
            if (old.ring) MO.resources.removeAndDispose(MO.groups.fx, old.ring);
        }

        if (strength >= 0.65) {
            MO.spawnBurst(x, MO.WATER_LEVEL + 0.06, z, 0xbae6fd, Math.min(6, Math.round(strength * 4)), 0.045);
        }
        if (withSound && MO.SoundFX && MO.SoundFX.playWaterRipple) {
            MO.SoundFX.playWaterRipple();
        }
    };

    MO.updateWaterAndGroundFX = function(dt, t) {
        const state = MO.state;
        const tracks = state.site.tracks;
        for (let i = tracks.length - 1; i >= 0; i--) {
            const tr = tracks[i];
            tr.life -= dt;
            if (tr.life <= 0) {
                MO.resources.removeAndDispose(MO.groups.fx, tr.mesh);
                tracks.splice(i, 1);
            } else {
                tr.mat.opacity = tr.startOp * (tr.life / tr.maxLife);
            }
        }

        // Atualiza anéis e ondas físicas nos vértices da água
        const ripples = state.site.ripples;
        for (let i = ripples.length - 1; i >= 0; i--) {
            const rp = ripples[i];
            rp.age += dt;
            const prog = rp.age / rp.maxAge;
            if (prog >= 1) {
                if (rp.ring) MO.resources.removeAndDispose(MO.groups.fx, rp.ring);
                ripples.splice(i, 1);
            } else if (rp.ring) {
                const sc = 1 + prog * 7.5 * rp.strength;
                rp.ring.scale.setScalar(sc);
                rp.ringMat.opacity = 0.65 * (1 - prog);
            }
        }

        if (MO.waterSurfaceMesh && MO.waterSurfaceMesh.geometry && MO.waterSurfaceMesh.geometry.attributes.position) {
            const pos = MO.waterSurfaceMesh.geometry.attributes.position;
            const windGain = state.weather === 'wind' ? 1.8 : (state.weather === 'rain' ? 1.4 : 1.0);
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vz = pos.getZ(i);
                let wy = Math.sin(vx * 0.9 + t * 1.9) * 0.012 * windGain + Math.cos(vz * 1.1 + t * 1.5) * 0.010 * windGain;
                for (let r = 0; r < ripples.length; r++) {
                    const rp = ripples[r];
                    const d = Math.hypot(vx - rp.x, vz - rp.z);
                    const waveR = rp.age * 2.4;
                    if (Math.abs(d - waveR) < 0.85) {
                        const env = (1 - rp.age / rp.maxAge) * Math.exp(-Math.pow((d - waveR) * 2.2, 2));
                        wy += Math.sin((d - waveR) * 7.0) * rp.amp * env;
                    }
                }
                pos.setY(i, wy);
            }
            pos.needsUpdate = true;
            MO.waterSurfaceMesh.geometry.computeVertexNormals();
        }

        // Atualiza partículas vivas ao vento pelo terreno
        const windSpeed = state.weather === 'wind' ? 2.4 : 1.0;
        const raining = state.weather === 'rain';
        state.site.ambientMotes.forEach((mt, idx) => {
            mt.mesh.visible = !raining && !state.isNight;
            if (!mt.mesh.visible) return;
            const drift = t * mt.speed * windSpeed + mt.phase;
            mt.mesh.position.x = mt.baseX + Math.sin(drift) * 0.9;
            mt.mesh.position.y = mt.baseY + Math.sin(drift * 1.4 + idx) * 0.22;
            mt.mesh.position.z = mt.baseZ + Math.cos(drift * 0.8) * 0.9;
            mt.mesh.rotation.y += dt * 1.5;
        });
    };

    MO.populateBuildableLotWeeds = function() {
        const weedsGroup = MO.groups.weeds;
        const state = MO.state;
        MO.resources.clearGroup(weedsGroup);
        state.weeds = [];
        state.levelTargets = [];

        const s = state.seed;
        const mode = state.mode;
        const weedMats = [
            new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.9, flatShading: true }),
            new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.9, flatShading: true }),
            new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.92, flatShading: true })
        ];

        const activeLot = (mode === 'house' && MO.regionManager && MO.worldManager && MO.worldManager.meta.persistentGrowth)
            ? MO.regionManager.getActiveLot()
            : null;
        const maxWeeds = mode === 'bridge' ? 16 : (activeLot ? 12 : 22);
        for (let i = 0; i < maxWeeds; i++) {
            let wx, wz;
            if (mode === 'bridge') {
                const side = i % 2 === 0 ? -1 : 1;
                wx = side * (3.6 + hash2D(i, 301, s) * 2.0);
                wz = -2.2 + hash2D(i, 302, s) * 4.4;
            } else if (mode === 'tower') {
                wx = (hash2D(i, 301, s) - 0.5) * 5.2;
                wz = (hash2D(i, 302, s) - 0.5) * 5.2;
            } else if (activeLot) {
                wx = activeLot.originX + (hash2D(i, 301, s + activeLot.id.length) - 0.5) * (activeLot.halfW * 1.8);
                wz = activeLot.originZ + (hash2D(i, 302, s + activeLot.id.length) - 0.5) * (activeLot.halfD * 1.8);
            } else {
                wx = (hash2D(i, 301, s) - 0.5) * 6.8;
                wz = -3.6 + hash2D(i, 302, s) * 5.4;
            }

            const wy = getTerrainHeight(wx, wz);
            if (wy < MO.WATER_LEVEL + 0.16) continue;

            const rKind = hash2D(i, 303, s);
            const kind = rKind < 0.55 ? 'weed' : (rKind < 0.82 ? 'bush' : 'rock');
            const g = new THREE.Group();
            g.position.set(wx, wy, wz);

            if (kind === 'weed') {
                for (let b = 0; b < 5; b++) {
                    const ang = (b / 5) * Math.PI * 2 + i;
                    const h = 0.28 + (b % 3) * 0.08;
                    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, h, 4), weedMats[(i + b) % 3]);
                    blade.position.set(Math.cos(ang) * 0.08, h / 2 - 0.02, Math.sin(ang) * 0.08);
                    blade.rotation.z = Math.cos(ang) * 0.28;
                    blade.rotation.x = Math.sin(ang) * 0.28;
                    blade.castShadow = true;
                    g.add(blade);
                }
            } else if (kind === 'bush') {
                for (let c = 0; c < 3; c++) {
                    const cl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (c % 2) * 0.06, 0), weedMats[(i + c) % 3]);
                    cl.position.set((c - 1) * 0.11, 0.14 + (c % 2) * 0.05, ((c * 2) % 3 - 1) * 0.08);
                    cl.scale.set(1.2, 0.85, 1.1);
                    cl.castShadow = true;
                    g.add(cl);
                }
            } else {
                const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.19, 0), MO.mats.stone);
                rk.position.y = 0.09;
                rk.scale.set(1.25, 0.72, 1.1);
                rk.rotation.set(i, i * 1.3, 0);
                rk.castShadow = true;
                g.add(rk);
            }

            const hit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.75), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.y = 0.25;
            g.add(hit);

            const wObj = { id: state.weeds.length, kind, x: wx, z: wz, cleared: false, res: false, mesh: g };
            g.traverse(child => { child.userData.weedObj = wObj; });
            weedsGroup.add(g);
            state.weeds.push(wObj);
        }

        if (mode === 'bridge') {
            [-4.2, -3.5, 3.5, 4.2].forEach(bx => {
                [-0.8, 0.8].forEach(bz => state.levelTargets.push({ x: bx, z: bz, done: false, res: false }));
            });
        } else if (mode === 'tower') {
            [-1.6, 0, 1.6].forEach(tx => {
                [-1.6, 0, 1.6].forEach(tz => state.levelTargets.push({ x: tx, z: tz, done: false, res: false }));
            });
        } else if (activeLot) {
            for (let ox = -1.2; ox <= 1.2; ox += 1.2) {
                for (let oz = -1.2; oz <= 1.2; oz += 1.2) {
                    state.levelTargets.push({
                        x: activeLot.originX + ox,
                        z: activeLot.originZ + oz,
                        done: false,
                        res: false
                    });
                }
            }
        } else {
            for (let x = -2.4; x <= 2.4; x += 1.6) {
                for (let z = -3.0; z <= 1.5; z += 1.5) {
                    state.levelTargets.push({ x, z, done: false, res: false });
                }
            }
        }

        MO.updatePhase0StatusPills();
    };

    MO.clearWeedItem = function(wObj) {
        if (!wObj || wObj.cleared) return;
        wObj.cleared = true;
        wObj.res = false;
        if (wObj.mesh) wObj.mesh.visible = false;
        const wy = getTerrainHeight(wObj.x, wObj.z);
        const pColor = wObj.kind === 'rock' ? 0x64748b : 0x4d7c0f;
        MO.spawnBurst(wObj.x, wy + 0.14, wObj.z, pColor, 9, 0.08);
        MO.SoundFX.playDirtShovel();
        MO.updatePhase0StatusPills();

        const rem = MO.state.weeds.filter(w => !w.cleared).length;
        if (rem === 0 && MO.state.phase === 0 && MO.state.tool === 'clear-weeds') {
            MO.selectTool('level');
            MO.showToast('Terreno 100% capinado! Agora passe Terraplanar para nivelar a área.', '🚜');
        }
    };

    MO.computeLotLevelProgress = function() {
        const state = MO.state;
        if (!state.levelTargets || state.levelTargets.length === 0) return 0;
        let sum = 0;
        state.levelTargets.forEach(lt => {
            const w = sampleLevelWeight(lt.x, lt.z);
            if (w > 0.82) lt.done = true;
            sum += Math.min(1, w / 0.85);
        });
        state.levelProgress = Math.round((sum / state.levelTargets.length) * 100);
        return state.levelProgress;
    };

    MO.updatePhase0StatusPills = function() {
        const mode = MO.state.mode;
        document.querySelectorAll(`[data-weeds-pill="${mode}"]`).forEach(wp => {
            if (MO.state.weeds) {
                const rem = MO.state.weeds.filter(w => !w.cleared).length;
                wp.textContent = rem === 0 ? '🌿 Mato: Limpo ✓' : `🌿 Mato: ${rem} rest.`;
            }
        });
        document.querySelectorAll(`[data-level-pill="${mode}"]`).forEach(lp => {
            const pct = MO.computeLotLevelProgress();
            lp.textContent = pct >= 95 ? '📐 Platô: 100% ✓' : `📐 Platô: ${pct}%`;
        });
    };

    MO.advanceToPhase1 = function() {
        const state = MO.state;
        const remWeeds = state.weeds.filter(w => !w.cleared).length;
        if (remWeeds > 4 && !state.screensaver) {
            MO.showToast(`Capine mais o terreno (${remWeeds} matos restantes) ou chame um Ajudante!`, '🌿');
            return;
        }
        state.weeds.forEach(w => { if (!w.cleared) { w.cleared = true; if (w.mesh) w.mesh.visible = false; } });

        if (MO.modes[state.mode] && MO.modes[state.mode].onStartPhase1) {
            MO.modes[state.mode].onStartPhase1();
            return;
        }

        state.phase = 1;
        MO.syncPhaseUI();
        MO.updateTerrainGridLines();
        MO.selectTool('room');
        MO.showToast('Fase 1: Desenhe os cômodos na grade ou clique em ✨ Modelo!', '📐');
    };
})(window.MO = window.MO || {});

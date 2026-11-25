// =========================================================================
// WORLD: TRAFFIC MANAGER (CARROS NA RODOVIA REGIONAL & VISITANTES QUE VÊM
// DA RODOVIA, PERCORREM AS ESTRADAS CONECTADAS E RETORNAM À RODOVIA)
// =========================================================================
(function(MO) {
    let trafficGroup = null;
    let sharedCarGeos = null;
    let sharedHeadlightMat = null;
    let sharedTaillightMat = null;
    const highwayVehicles = [];
    const cityVehicles = [];

    const CAR_COLORS = [0xef4444, 0x3b82f6, 0xf8fafc, 0x10b981, 0xf59e0b, 0x6366f1, 0x0ea5e9, 0x64748b];

    function getSharedCarGeos() {
        if (sharedCarGeos) return sharedCarGeos;
        sharedCarGeos = {
            bodyGeo: new THREE.BoxGeometry(0.68, 0.24, 1.32),
            cabinGeo: new THREE.BoxGeometry(0.58, 0.22, 0.66),
            truckBedGeo: new THREE.BoxGeometry(0.66, 0.20, 0.68),
            wheelGeo: new THREE.CylinderGeometry(0.11, 0.11, 0.08, 8),
            lightGeo: new THREE.BoxGeometry(0.12, 0.07, 0.04),
            glassMat: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.4 }),
            wheelMat: new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 })
        };
        sharedHeadlightMat = new THREE.MeshStandardMaterial({
            color: 0xfef9c3,
            emissive: 0xfef08a,
            emissiveIntensity: 0.45,
            roughness: 0.2
        });
        sharedTaillightMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xdc2626,
            emissiveIntensity: 0.55,
            roughness: 0.3
        });
        if (MO.resources) {
            MO.resources.protect(
                ...Object.values(sharedCarGeos),
                sharedHeadlightMat,
                sharedTaillightMat
            );
        }
        return sharedCarGeos;
    }

    function buildVehicleMesh(colorHex, isPickup = false) {
        const G = getSharedCarGeos();
        const grp = new THREE.Group();
        const paintMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.42, metalness: 0.18 });
        if (MO.resources) MO.resources.protect(paintMat);

        const body = new THREE.Mesh(G.bodyGeo, paintMat);
        body.position.y = 0.22;
        body.castShadow = true;
        grp.add(body);

        const cabin = new THREE.Mesh(G.cabinGeo, isPickup ? paintMat : G.glassMat);
        cabin.position.set(0, 0.42, isPickup ? 0.18 : -0.04);
        cabin.scale.set(1, 1, isPickup ? 0.68 : 1.0);
        cabin.castShadow = true;
        grp.add(cabin);

        if (isPickup) {
            const bed = new THREE.Mesh(G.truckBedGeo, MO.mats.steel || G.wheelMat);
            bed.position.set(0, 0.30, -0.34);
            grp.add(bed);
        }

        [[-0.33, 0.42], [0.33, 0.42], [-0.33, -0.42], [0.33, -0.42]].forEach(([wx, wz]) => {
            const wh = new THREE.Mesh(G.wheelGeo, G.wheelMat);
            wh.rotation.z = Math.PI / 2;
            wh.position.set(wx, 0.11, wz);
            grp.add(wh);
        });

        [-0.21, 0.21].forEach(lx => {
            const hl = new THREE.Mesh(G.lightGeo, sharedHeadlightMat);
            hl.position.set(lx, 0.24, 0.66);
            const tl = new THREE.Mesh(G.lightGeo, sharedTaillightMat);
            tl.position.set(lx, 0.24, -0.66);
            grp.add(hl, tl);
        });

        return grp;
    }

    function lerpAngle(a, b, alpha) {
        const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
        return a + diff * alpha;
    }

    function ensureInitialized() {
        if (!MO.scene) return;
        if (!trafficGroup) {
            trafficGroup = new THREE.Group();
            trafficGroup.name = 'traffic';
            MO.scene.add(trafficGroup);
        }
        if (highwayVehicles.length === 0) {
            for (let i = 0; i < 6; i++) {
                const dir = i % 2 === 0 ? 1 : -1;
                const mesh = buildVehicleMesh(CAR_COLORS[i % CAR_COLORS.length], i % 3 === 1);
                trafficGroup.add(mesh);
                highwayVehicles.push({
                    id: `hw-car-${i}`,
                    mesh,
                    dir,
                    laneOffset: dir > 0 ? 1.05 : -1.05,
                    z: -60 + i * 22,
                    speed: 6.4 + (i % 3) * 1.35,
                    x: 0
                });
            }
        }
        if (cityVehicles.length === 0) {
            for (let i = 0; i < 4; i++) {
                const mesh = buildVehicleMesh(CAR_COLORS[(i + 3) % CAR_COLORS.length], i % 2 === 0);
                mesh.visible = false;
                trafficGroup.add(mesh);
                cityVehicles.push({
                    id: `city-car-${i}`,
                    mesh,
                    route: null,        // [{ x, z, isHighway, tileKey, kind, phase }]
                    wpIndex: 0,
                    segProgress: 0,
                    cooldown: i * 3.2,  // escalona saídas para não empilhar carros no entroncamento
                    tripCount: 0,
                    speed: 3.4 + (i % 2) * 0.6,
                    phase: 'idle',      // 'idle' | 'highway-in' | 'city-in' | 'city-out' | 'highway-out'
                    currentKey: null,
                    onHighway: false,
                    yaw: 0,
                    x: 0,
                    z: 0
                });
            }
        }
    }

    // BFS estritamente a partir dos entroncamentos ligados à Rodovia Regional:
    // garante que NENHUM carro jamais apareça em ruas isoladas/desconectadas!
    function getHighwayConnectedRoadGraph() {
        const state = MO.state;
        const city = state && state.city;
        const cm = MO.chunkManager;
        const builtMap = new Map();
        const connectedMap = new Map();
        const parentMap = new Map();
        const distMap = new Map();
        const entryKeys = [];

        if (!city || !city.roadTiles || !cm || !cm.isNearHighway) {
            return { builtMap, connectedMap, parentMap, distMap, entryKeys };
        }

        city.roadTiles.forEach((tile, key) => {
            if (tile && tile.built) builtMap.set(key, tile);
        });

        const queue = [];
        builtMap.forEach((tile, key) => {
            if (cm.isNearHighway(tile.x, tile.z, 2.6, state.seed)) {
                entryKeys.push(key);
                connectedMap.set(key, tile);
                parentMap.set(key, null);
                distMap.set(key, 0);
                queue.push(key);
            }
        });

        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        while (queue.length > 0) {
            const curKey = queue.shift();
            const curTile = connectedMap.get(curKey);
            const curDist = distMap.get(curKey) || 0;
            for (let i = 0; i < dirs.length; i++) {
                const nk = `${curTile.gx + dirs[i][0]},${curTile.gz + dirs[i][1]}`;
                if (!connectedMap.has(nk) && builtMap.has(nk)) {
                    connectedMap.set(nk, builtMap.get(nk));
                    parentMap.set(nk, curKey);
                    distMap.set(nk, curDist + 1);
                    queue.push(nk);
                }
            }
        }

        return { builtMap, connectedMap, parentMap, distMap, entryKeys };
    }

    // Monta viagem completa: RODOVIA (norte/sul) -> ENTRONCAMENTO -> RUAS CONECTADAS -> RETORNO -> RODOVIA
    function buildHighwayRoundTripRoute(graph, carIndex, tripCount) {
        const cm = MO.chunkManager;
        const seed = MO.state ? MO.state.seed : 1234;
        const { connectedMap, parentMap, distMap } = graph;

        if (connectedMap.size < 3) return null;

        // Seleciona destinos conectados (preferindo pontos mais internos da cidade, dist >= 2)
        const candidates = [];
        connectedMap.forEach((tile, key) => {
            const d = distMap.get(key) || 0;
            if (d >= 2) candidates.push({ key, tile, dist: d });
        });
        if (candidates.length === 0) return null;

        // Ordena por profundidade decrescente para priorizar passeios completos pelas ruas da cidade
        candidates.sort((a, b) => b.dist - a.dist);
        const topSlice = candidates.slice(0, Math.min(candidates.length, 8));
        const pick = topSlice[Math.abs(carIndex * 3 + tripCount) % topSlice.length];

        // Reconstrói caminho do entroncamento (entryTile) até o destino (destTile)
        const tilePath = [];
        let trace = pick.key;
        let guard = 0;
        while (trace && guard++ < 250) {
            const t = connectedMap.get(trace);
            if (t) tilePath.push({ key: trace, tile: t });
            trace = parentMap.get(trace);
        }
        tilePath.reverse(); // agora vai de [entryTile ... destTile]
        if (tilePath.length < 3) return null;

        const entryTile = tilePath[0].tile;
        const travelDir = ((carIndex + tripCount) % 2 === 0) ? 1 : -1;
        const laneOff = travelDir > 0 ? 1.05 : -1.05;
        const route = [];

        // 1. APROXIMAÇÃO PELA RODOVIA REGIONAL (carro NASCE na rodovia, 36m antes do entroncamento!)
        for (let step = 6; step >= 1; step--) {
            const wz = entryTile.z - travelDir * (step * 6);
            route.push({
                x: cm.getHighwayCenterX(wz, seed) + laneOff,
                z: wz,
                isHighway: true,
                tileKey: null,
                kind: 'paved',
                phase: 'highway-in'
            });
        }
        // Ponto de saída da faixa da Rodovia alinhado ao entroncamento
        route.push({
            x: cm.getHighwayCenterX(entryTile.z, seed) + 1.15,
            z: entryTile.z,
            isHighway: true,
            tileKey: null,
            kind: 'paved',
            phase: 'highway-in'
        });

        // 2. IDA PELAS ESTRADAS CONSTRUÍDAS DA CIDADE (entryTile -> destTile)
        for (let i = 0; i < tilePath.length; i++) {
            const item = tilePath[i];
            route.push({
                x: item.tile.x,
                z: item.tile.z,
                isHighway: false,
                tileKey: item.key,
                kind: item.tile.kind || 'dirt',
                phase: 'city-in'
            });
        }

        // 3. VOLTA PELAS ESTRADAS CONSTRUÍDAS ATÉ O ENTRONCAMENTO (destTile -> entryTile)
        for (let i = tilePath.length - 2; i >= 0; i--) {
            const item = tilePath[i];
            route.push({
                x: item.tile.x,
                z: item.tile.z,
                isHighway: false,
                tileKey: item.key,
                kind: item.tile.kind || 'dirt',
                phase: 'city-out'
            });
        }

        // 4. RETORNO E SAÍDA PELA RODOVIA REGIONAL (reingressa na pista e segue embora!)
        route.push({
            x: cm.getHighwayCenterX(entryTile.z, seed) + 1.15,
            z: entryTile.z,
            isHighway: true,
            tileKey: null,
            kind: 'paved',
            phase: 'highway-out'
        });
        for (let step = 1; step <= 7; step++) {
            const wz = entryTile.z + travelDir * (step * 6);
            route.push({
                x: cm.getHighwayCenterX(wz, seed) + laneOff,
                z: wz,
                isHighway: true,
                tileKey: null,
                kind: 'paved',
                phase: 'highway-out'
            });
        }

        return route;
    }

    function updateHighwayTraffic(dt) {
        const state = MO.state;
        const cm = MO.chunkManager;
        const showHw = Boolean(state && state.infiniteWorld && state.cityMode && cm && cm.getHighwayCenterX);
        const camZ = (MO.camOrbit && MO.camOrbit.target) ? MO.camOrbit.target.z : 0;
        const span = 78;

        for (let i = 0; i < highwayVehicles.length; i++) {
            const v = highwayVehicles[i];
            v.mesh.visible = showHw;
            if (!showHw) continue;

            v.z += v.dir * v.speed * dt;
            if (v.z > camZ + span) v.z = camZ - span;
            if (v.z < camZ - span) v.z = camZ + span;

            const zAhead = v.z + v.dir * 1.2;
            const cx = cm.getHighwayCenterX(v.z, state.seed);
            const cxAhead = cm.getHighwayCenterX(zAhead, state.seed);
            const yaw = Math.atan2(cxAhead - cx, zAhead - v.z);
            const perpX = Math.cos(yaw);
            const perpZ = -Math.sin(yaw);
            const wx = cx + perpX * v.laneOffset;
            const wz = v.z + perpZ * v.laneOffset;
            const wy = cm.getHighwayHeight(v.z, state.seed) + 0.065;

            v.x = wx;
            v.mesh.position.set(wx, wy, wz);
            v.mesh.rotation.y = yaw;
        }
    }

    function clearCityCar(car, nextCooldown = 2.0) {
        car.mesh.visible = false;
        car.route = null;
        car.wpIndex = 0;
        car.segProgress = 0;
        car.phase = 'idle';
        car.currentKey = null;
        car.onHighway = false;
        car.cooldown = nextCooldown;
    }

    function updateCityRoadTraffic(dt) {
        const state = MO.state;
        const cm = MO.chunkManager;
        if (!state || !state.cityMode || !cm || !cm.getHighwayCenterX) {
            cityVehicles.forEach(c => clearCityCar(c, 0));
            return;
        }

        const graph = getHighwayConnectedRoadGraph();
        const canDrive = graph.connectedMap.size >= 3 && graph.entryKeys.length > 0;
        const desiredActive = canDrive
            ? Math.min(cityVehicles.length, Math.max(1, Math.floor(graph.connectedMap.size / 6)))
            : 0;

        for (let i = 0; i < cityVehicles.length; i++) {
            const car = cityVehicles[i];

            // Se não tem rota ativa, só inicia nova viagem NA RODOVIA se houver vagas e cooldown zerado
            if (!car.route) {
                if (i >= desiredActive) {
                    car.mesh.visible = false;
                    car.phase = 'idle';
                    car.currentKey = null;
                    car.onHighway = false;
                    continue;
                }
                if (car.cooldown > 0) {
                    car.cooldown = Math.max(0, car.cooldown - dt);
                    car.mesh.visible = false;
                    continue;
                }
                const newRoute = buildHighwayRoundTripRoute(graph, i, car.tripCount);
                if (!newRoute || newRoute.length < 4) {
                    car.mesh.visible = false;
                    continue;
                }
                car.route = newRoute;
                car.wpIndex = 0;
                car.segProgress = 0;
                car.tripCount++;
                car.x = newRoute[0].x;
                car.z = newRoute[0].z;
                car.yaw = Math.atan2(newRoute[1].x - newRoute[0].x, newRoute[1].z - newRoute[0].z);
            }

            const a = car.route[car.wpIndex];
            const b = car.route[car.wpIndex + 1];
            if (!a || !b) {
                clearCityCar(car, 2.0 + i * 1.4);
                continue;
            }

            // Se o próximo tile urbano foi removido/demolido no meio da viagem, retorna imediatamente para a rodovia
            if (!b.isHighway && b.tileKey && !graph.builtMap.has(b.tileKey)) {
                const backIdx = car.route.findIndex((wp, idx) => idx > car.wpIndex && wp.phase === 'city-out' && wp.tileKey === a.tileKey);
                if (backIdx !== -1) {
                    car.wpIndex = backIdx;
                    car.segProgress = 0;
                } else {
                    clearCityCar(car, 2.5);
                    continue;
                }
            }

            const curA = car.route[car.wpIndex];
            const curB = car.route[car.wpIndex + 1];
            const segLen = Math.max(0.25, Math.hypot(curB.x - curA.x, curB.z - curA.z));
            const isHwSeg = curA.isHighway && curB.isHighway;
            const speed = isHwSeg
                ? (car.speed * 1.85)
                : (curA.kind === 'paved' ? car.speed * 1.20 : car.speed * 0.88);

            car.segProgress += (speed * dt) / segLen;
            while (car.segProgress >= 1.0 && car.route && car.wpIndex < car.route.length - 2) {
                car.segProgress -= 1.0;
                car.wpIndex++;
            }

            if (car.wpIndex >= car.route.length - 1 || (car.wpIndex === car.route.length - 2 && car.segProgress >= 1.0)) {
                // Concluiu o retorno completo à Rodovia Regional! Desaparece longe na pista e agenda nova visita.
                clearCityCar(car, 1.8 + (i % 3) * 1.6);
                continue;
            }

            const wpA = car.route[car.wpIndex];
            const wpB = car.route[car.wpIndex + 1];
            const t = Math.max(0, Math.min(1, car.segProgress));
            const wx = wpA.x + (wpB.x - wpA.x) * t;
            const wz = wpA.z + (wpB.z - wpA.z) * t;

            const yA = wpA.isHighway
                ? (cm.getHighwayHeight(wpA.z, state.seed) + 0.065)
                : (Math.max((MO.WATER_LEVEL || -0.36) + 0.16, cm.getHeightAt(wpA.x, wpA.z)) + 0.06);
            const yB = wpB.isHighway
                ? (cm.getHighwayHeight(wpB.z, state.seed) + 0.065)
                : (Math.max((MO.WATER_LEVEL || -0.36) + 0.16, cm.getHeightAt(wpB.x, wpB.z)) + 0.06);
            const wy = yA + (yB - yA) * t;

            const targetYaw = Math.hypot(wpB.x - wpA.x, wpB.z - wpA.z) > 0.01
                ? Math.atan2(wpB.x - wpA.x, wpB.z - wpA.z)
                : car.yaw;
            car.yaw = lerpAngle(car.yaw, targetYaw, Math.min(1, dt * 10));

            car.x = wx;
            car.z = wz;
            car.phase = wpB.phase || wpA.phase;
            car.onHighway = Boolean(wpA.isHighway && wpB.isHighway);
            car.currentKey = wpB.tileKey || wpA.tileKey || null;
            car.mesh.visible = true;
            car.mesh.position.set(wx, wy, wz);
            car.mesh.rotation.y = car.yaw;
        }
    }

    function update(dt) {
        ensureInitialized();
        const isNight = Boolean(MO.state && MO.state.isNight);
        if (sharedHeadlightMat) sharedHeadlightMat.emissiveIntensity = isNight ? 2.4 : 0.40;
        if (sharedTaillightMat) sharedTaillightMat.emissiveIntensity = isNight ? 2.0 : 0.50;
        updateHighwayTraffic(dt);
        updateCityRoadTraffic(dt);
    }

    function reset() {
        cityVehicles.forEach((c, idx) => {
            clearCityCar(c, idx * 3.2);
            c.tripCount = 0;
        });
    }

    function getTrafficStats() {
        return {
            highwayActive: highwayVehicles.filter(v => v.mesh && v.mesh.visible).length,
            cityActive: cityVehicles.filter(v => v.mesh && v.mesh.visible).length,
            highwayVehicles: highwayVehicles.map(v => ({ id: v.id, x: v.x, z: v.z, visible: v.mesh.visible })),
            cityVehicles: cityVehicles.map(v => ({
                id: v.id,
                x: v.x,
                z: v.z,
                key: v.currentKey,
                phase: v.phase,
                onHighway: v.onHighway,
                visible: v.mesh.visible
            }))
        };
    }

    MO.trafficManager = {
        init: ensureInitialized,
        update,
        reset,
        getTrafficStats
    };
})(window.MO = window.MO || {});

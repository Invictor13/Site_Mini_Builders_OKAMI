// =========================================================================
// WORLD: WORLD MANAGER (PLANO DA VILA POR SEED, ESTRADAS, DEMARCAÇÃO & PERSISTÊNCIA)
// =========================================================================
(function(MO) {
    const DEFAULT_STORAGE_KEY = 'okami_living_world_v2';

    function buildPolylineSamples(points, stepDist = 1.45, bank = 'west') {
        const samples = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dist = Math.hypot(b.x - a.x, b.z - a.z);
            const count = Math.max(1, Math.ceil(dist / stepDist));
            for (let s = 0; s <= count; s++) {
                if (i > 0 && s === 0) continue;
                const t = s / count;
                samples.push({
                    id: `${bank}-road-${samples.length}`,
                    x: a.x + (b.x - a.x) * t,
                    z: a.z + (b.z - a.z) * t,
                    bank,
                    built: false,
                    res: false
                });
            }
        }
        return samples;
    }

    function createWorldManager(regionManager, constructionManager) {
        const meta = {
            version: 2,
            worldId: 'okami-village-1',
            persistentGrowth: true
        };

        function resetVillageInfraAndWorkbench() {
            const state = MO.state;
            if (MO.roadMap) MO.roadMap.fill(0);
            const infra = state.villageInfra;
            if (infra) {
                infra.demarcated = false;
                infra.roadSegments = [];
                infra.roadBuilt = false;
                infra.eastRoadDemarcated = false;
                infra.eastRoadBuilt = false;
                infra.unloadingBuilt = false;
                infra.mixerBuilt = false;
                infra.workbenchBuilt = false;
                infra.stockYardsBuilt = false;
                infra.bridgeUnlocked = false;
                infra.bridgeZ = -0.6;
            }
            if (state.workbench) {
                state.workbench.rawWood = 0;
                state.workbench.cutWood = 0;
                state.workbench.cutBreakdown = { formwork: 0, props: 0, scaffolds: 0, roof: 0 };
                state.workbench.busyWorkerId = null;
                state.workbench.sawProgress = 0;
            }
            if (MO.groups && MO.groups.demarcation && MO.resources) {
                MO.resources.clearGroup(MO.groups.demarcation);
            }
        }

        function drawDemarcationRect(grp, cx, cz, halfW, halfD, colorHex) {
            if (typeof THREE === 'undefined' || !grp) return;
            const stakeMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
            const corners = [
                [cx - halfW, cz - halfD], [cx + halfW, cz - halfD],
                [cx + halfW, cz + halfD], [cx - halfW, cz + halfD]
            ];
            corners.forEach(([px, pz]) => {
                const py = MO.getTerrainHeight ? MO.getTerrainHeight(px, pz) : 0.28;
                const st = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.30, 6), stakeMat);
                st.position.set(px, py + 0.14, pz);
                grp.add(st);
            });
            const pts = [];
            for (let i = 0; i < 4; i++) {
                const a = corners[i];
                const b = corners[(i + 1) % 4];
                const ya = (MO.getTerrainHeight ? MO.getTerrainHeight(a[0], a[1]) : 0.28) + 0.05;
                const yb = (MO.getTerrainHeight ? MO.getTerrainHeight(b[0], b[1]) : 0.28) + 0.05;
                pts.push(a[0], ya, a[1], b[0], yb, b[1]);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            grp.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.65 })));
        }

        function renderDemarcationLines() {
            const grp = MO.groups && MO.groups.demarcation;
            if (!grp || !MO.resources || typeof THREE === 'undefined') return;
            MO.resources.clearGroup(grp);
            const infra = MO.state.villageInfra;
            if (!infra) return;
            const playerDriven = Boolean(MO.state.cityMode && MO.state.city && MO.state.city.playerDriven);
            if (!playerDriven && !infra.demarcated) return;

            // Em modo Cidade (playerDriven), só exibe contorno de demarcação para estações colocadas pelo jogador que ainda estão em construção
            if (!playerDriven || (infra.unloadingPlaced && !infra.unloadingBuilt)) {
                drawDemarcationRect(grp, MO.STATION_UNLOAD.x, MO.STATION_UNLOAD.z, 1.3, 1.0, 0x38bdf8);
            }
            if (!playerDriven || (infra.mixerPlaced && !infra.mixerBuilt)) {
                drawDemarcationRect(grp, MO.STATION_MIXER.x, MO.STATION_MIXER.z, 1.1, 0.9, 0xf59e0b);
            }
            if (!playerDriven || (infra.workbenchPlaced && !infra.workbenchBuilt)) {
                drawDemarcationRect(grp, MO.STATION_WORKBENCH.x, MO.STATION_WORKBENCH.z, 1.5, 0.8, 0x10b981);
            }
            if (!playerDriven || (infra.yardsPlaced && !infra.stockYardsBuilt)) {
                drawDemarcationRect(grp, MO.STATION_BRICK.x, MO.STATION_BRICK.z, 1.0, 1.0, 0xf97316);
            }

            // Estacas ao longo dos trechos de estrada demarcados ainda não concluídos
            const roadStakeMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.6 });
            (infra.roadSegments || []).forEach(seg => {
                if (seg.built) return;
                const y = MO.getTerrainHeight ? MO.getTerrainHeight(seg.x, seg.z) : 0.28;
                const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.24, 5), roadStakeMat);
                m.position.set(seg.x, y + 0.12, seg.z);
                grp.add(m);
            });
        }

        function demarcateWestInfrastructure() {
            const infra = MO.state.villageInfra;
            if (!infra || infra.demarcated) return false;
            const riverX = MO.getRiverCenterX ? MO.getRiverCenterX(infra.bridgeZ || -0.6) : 1.6;
            const westRoad = buildPolylineSamples([
                MO.STATION_ROAD_ENTRY,
                MO.STATION_UNLOAD,
                MO.STATION_MIXER,
                MO.STATION_WORKBENCH,
                { x: -5.4, z: -2.2 },
                { x: -4.4, z: -2.2 },
                { x: riverX - 3.8, z: infra.bridgeZ || -0.6 }
            ], 1.5, 'west');
            infra.roadSegments = westRoad;
            infra.demarcated = true;
            renderDemarcationLines();
            return true;
        }

        function demarcateEastRoads() {
            const infra = MO.state.villageInfra;
            if (!infra || infra.eastRoadDemarcated) return false;
            const riverX = MO.getRiverCenterX ? MO.getRiverCenterX(infra.bridgeZ || -0.6) : 1.6;
            const eastLot = regionManager.getLot('lot-east-1');
            const towerLot = regionManager.getLot('lot-tower');
            const eastRoad = buildPolylineSamples([
                { x: riverX + 3.8, z: infra.bridgeZ || -0.6 },
                { x: 6.4, z: 0.0 },
                { x: eastLot ? eastLot.originX : 7.4, z: eastLot ? eastLot.originZ - 2.0 : 0.6 },
                { x: towerLot ? towerLot.originX : 8.6, z: towerLot ? towerLot.originZ + 2.0 : -3.0 }
            ], 1.5, 'east');
            infra.roadSegments = (infra.roadSegments || []).concat(eastRoad);
            infra.eastRoadDemarcated = true;
            renderDemarcationLines();
            return true;
        }

        function renderLotMarkers() {
            if (!MO.groups || !MO.groups.lotMarkers || !MO.resources) return;
            const grp = MO.groups.lotMarkers;
            MO.resources.clearGroup(grp);
            if (!MO.state || typeof THREE === 'undefined') return;

            const lots = regionManager.getLotsForRegion('main-valley');
            lots.forEach(lot => {
                if (!MO.state.unifiedVillage && lot.mode !== MO.state.mode) return;
                const colorHex = lot.status === 'active'
                    ? 0xf59e0b
                    : (lot.status === 'completed' ? 0x10b981 : 0x38bdf8);
                const opacity = lot.status === 'active' ? 0.72 : (lot.status === 'completed' ? 0.42 : 0.32);

                const minX = lot.originX - lot.halfW;
                const maxX = lot.originX + lot.halfW;
                const minZ = lot.originZ - lot.halfD;
                const maxZ = lot.originZ + lot.halfD;

                const stakeMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
                [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]].forEach(([cx, cz]) => {
                    const cy = MO.getTerrainHeight ? MO.getTerrainHeight(cx, cz) : 0.28;
                    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.025, 0.34, 6), stakeMat);
                    stake.position.set(cx, cy + 0.14, cz);
                    stake.castShadow = true;
                    grp.add(stake);
                });

                const pts = [];
                const segs = 6;
                const addEdge = (x1, z1, x2, z2) => {
                    for (let i = 0; i < segs; i++) {
                        const t1 = i / segs;
                        const t2 = (i + 1) / segs;
                        const px1 = x1 + (x2 - x1) * t1;
                        const pz1 = z1 + (z2 - z1) * t1;
                        const px2 = x1 + (x2 - x1) * t2;
                        const pz2 = z1 + (z2 - z1) * t2;
                        const py1 = (MO.getTerrainHeight ? MO.getTerrainHeight(px1, pz1) : 0.28) + 0.045;
                        const py2 = (MO.getTerrainHeight ? MO.getTerrainHeight(px2, pz2) : 0.28) + 0.045;
                        pts.push(px1, py1, pz1, px2, py2, pz2);
                    }
                };
                addEdge(minX, minZ, maxX, minZ);
                addEdge(maxX, minZ, maxX, maxZ);
                addEdge(maxX, maxZ, minX, maxZ);
                addEdge(minX, maxZ, minX, minZ);

                const lineGeo = new THREE.BufferGeometry();
                lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                const lineMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity });
                grp.add(new THREE.LineSegments(lineGeo, lineMat));
            });
        }

        function initDefaultWorld() {
            const state = MO.state;
            regionManager.reset();
            constructionManager.clearAll();
            resetVillageInfraAndWorkbench();

            const s = state.seed;
            const riverX = MO.getRiverCenterX ? MO.getRiverCenterX(-0.6, s) : 1.6;
            const hill = MO.getTowerHillCenter ? MO.getTowerHillCenter(s) : { x: 8.6, z: -5.2 };
            const buildingOnWest = (s % 2 === 0);

            regionManager.registerRegion({
                id: 'main-valley',
                name: 'Vila do Vale',
                biome: state.biome,
                seed: s,
                centerX: 0,
                centerZ: 0,
                radius: MO.DIORAMA_R,
                discovered: true,
                loaded: true
            });

            regionManager.registerRegion({
                id: 'east-highlands',
                name: 'Terras Altas do Leste',
                biome: MO.BIOME_ORDER[(s + 1) % MO.BIOME_ORDER.length],
                seed: s + 101,
                centerX: 28,
                centerZ: 0,
                radius: MO.DIORAMA_R,
                discovered: false,
                loaded: false
            });
            regionManager.connectRegions('main-valley', 'east-highlands', {
                portalLotId: 'lot-bridge',
                label: 'Ponte Leste'
            });

            const lot1 = regionManager.registerLot({
                id: 'lot-house-1',
                regionId: 'main-valley',
                label: 'Casa Oeste',
                originX: -4.4,
                originZ: -4.6,
                halfW: 2.0,
                halfD: 2.0,
                allowedModes: ['house'],
                bank: 'west',
                status: 'active'
            });

            regionManager.registerLot({
                id: 'lot-west-2',
                regionId: 'main-valley',
                label: buildingOnWest ? 'Prédio Oeste' : 'Casa Sul',
                originX: -3.8,
                originZ: 2.8,
                halfW: 2.0,
                halfD: 2.0,
                allowedModes: [buildingOnWest ? 'building' : 'house'],
                bank: 'west',
                status: 'available'
            });

            regionManager.registerLot({
                id: 'lot-bridge',
                regionId: 'main-valley',
                label: 'Ponte do Rio',
                originX: riverX,
                originZ: -0.6,
                halfW: 3.8,
                halfD: 1.4,
                allowedModes: ['bridge'],
                bank: 'river',
                status: 'available'
            });

            regionManager.registerLot({
                id: 'lot-east-1',
                regionId: 'main-valley',
                label: buildingOnWest ? 'Casa Leste' : 'Prédio Leste',
                originX: 7.4,
                originZ: 2.6,
                halfW: 2.0,
                halfD: 2.0,
                allowedModes: [buildingOnWest ? 'house' : 'building'],
                bank: 'east',
                status: 'available'
            });

            regionManager.registerLot({
                id: 'lot-tower',
                regionId: 'main-valley',
                label: 'Torre da Colina',
                originX: hill.x,
                originZ: hill.z,
                halfW: 2.2,
                halfD: 2.2,
                allowedModes: ['tower'],
                bank: 'east',
                status: 'available'
            });

            regionManager.setActiveLot(lot1.id);
            const active = constructionManager.startConstruction({
                lotId: lot1.id,
                regionId: lot1.regionId,
                mode: state.mode || 'house',
                variant: state.variant,
                seed: s,
                phase: state.phase
            });
            lot1.constructionId = active.id;

            if (MO.initToolbox) MO.initToolbox();
            if (MO.initWorkbench) MO.initWorkbench();
            if (MO.placeMixerStationOnTerrain) MO.placeMixerStationOnTerrain();
            if (MO.rebuildSiteProps) MO.rebuildSiteProps();
            renderLotMarkers();

            return {
                region: regionManager.getRegion('main-valley'),
                activeLot: lot1,
                activeConstruction: active
            };
        }

        function onWorldRegenerated() {
            return initDefaultWorld();
        }

        function getNextBuildableVillageLot() {
            const lots = regionManager.getLotsForRegion('main-valley');
            const infra = MO.state.villageInfra;
            const bridgeReady = infra && infra.bridgeUnlocked;
            return lots.find(l => {
                if (l.status !== 'available') return false;
                if (l.bank === 'east' && !bridgeReady) return false;
                return true;
            }) || null;
        }

        function archiveAndAdvanceToNextLot(forcedNextMode = null) {
            const archived = constructionManager.archiveActiveConstruction(regionManager);
            if (((archived && archived.mode === 'bridge') || (MO.state.villageInfra && MO.state.villageInfra.bridgeUnlocked)) && regionManager.discoverRegion) {
                regionManager.discoverRegion('east-highlands', true);
            }
            const nextLot = getNextBuildableVillageLot();
            if (!nextLot) {
                renderLotMarkers();
                return { archived, nextLot: null, nextConstruction: null };
            }

            const nextMode = forcedNextMode || (nextLot.allowedModes && nextLot.allowedModes[0]) || 'house';
            regionManager.setActiveLot(nextLot.id);
            nextLot.status = 'active';
            const nextConstruction = constructionManager.startConstruction({
                lotId: nextLot.id,
                regionId: nextLot.regionId,
                mode: nextMode,
                variant: MO.state.variant,
                seed: MO.state.seed,
                phase: 0
            });
            nextLot.constructionId = nextConstruction.id;
            renderLotMarkers();
            return { archived, nextLot, nextConstruction };
        }

        function getActiveLotOrigin() {
            const lot = regionManager.getActiveLot();
            if (!lot) return { x: 0, z: MO.GRID_OFFSET_Z };
            return { x: lot.originX, z: lot.originZ };
        }

        function getWorldObstacles() {
            const segments = [];
            const circles = [];
            const doorCenters = [];
            const completed = constructionManager.getCompletedConstructions();

            for (let i = 0; i < completed.length; i++) {
                const obs = completed[i].obstacles;
                if (!obs) continue;
                if (Array.isArray(obs.segments)) obs.segments.forEach(s => segments.push(s));
                if (Array.isArray(obs.circles)) obs.circles.forEach(c => circles.push(c));
                if (Array.isArray(obs.doorCenters)) obs.doorCenters.forEach(d => doorCenters.push(d));
            }
            return { segments, circles, doorCenters };
        }

        function getNightLights() {
            const lights = [];
            const completed = constructionManager.getCompletedConstructions();
            for (let i = 0; i < completed.length; i++) {
                const cLights = completed[i].lights;
                if (Array.isArray(cLights)) cLights.forEach(l => lights.push(l));
            }
            return lights;
        }

        function encodeSparseMap(arr) {
            if (!arr) return [];
            const out = [];
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] > 0.02) out.push([i, Math.round(arr[i] * 100) / 100]);
            }
            return out;
        }

        function decodeSparseMap(arr, target) {
            if (!Array.isArray(arr) || !target) return;
            target.fill(0);
            for (let i = 0; i < arr.length; i++) {
                const pair = arr[i];
                if (Array.isArray(pair) && pair[0] >= 0 && pair[0] < target.length) {
                    target[pair[0]] = pair[1];
                }
            }
        }

        function serialize() {
            const state = MO.state;
            return {
                version: meta.version,
                worldId: meta.worldId,
                persistentGrowth: meta.persistentGrowth,
                seed: state.seed,
                biome: state.biome,
                mode: state.mode,
                activePhase: state.phase,
                variant: state.variant,
                timeOfDay: state.timeOfDay,
                simTime: MO.simClock ? MO.simClock.simTime : 0,
                villageInfra: { ...state.villageInfra },
                workbench: { ...state.workbench },
                levelMapSparse: encodeSparseMap(MO.levelMap),
                roadMapSparse: encodeSparseMap(MO.roadMap),
                campBuilt: state.camp ? {
                    tents: (state.camp.tents || []).map(t => Boolean(t.built)),
                    messHall: Boolean(state.camp.messHall && state.camp.messHall.built),
                    floodlights: (state.camp.floodlights || []).map(f => Boolean(f.built))
                } : null,
                workers: (state.workers || []).map(w => ({
                    kind: w.role === 'supervisor' ? 'supervisor' : 'helper',
                    role: w.role,
                    name: w.name,
                    specialty: w.specialty,
                    x: w.rig && w.rig.group ? Math.round(w.rig.group.position.x * 100) / 100 : MO.STATION_TOOLBOX.x,
                    z: w.rig && w.rig.group ? Math.round(w.rig.group.position.z * 100) / 100 : MO.STATION_TOOLBOX.z,
                    energy: Math.round((w.energy !== undefined ? w.energy : 100) * 10) / 10,
                    hydration: Math.round((w.hydration !== undefined ? w.hydration : 100) * 10) / 10,
                    hunger: Math.round((w.hunger !== undefined ? w.hunger : 100) * 10) / 10,
                    statusText: w.statusText || ''
                })),
                regions: regionManager.serialize(),
                constructions: constructionManager.serialize()
            };
        }

        function restore(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') return false;
            if (typeof snapshot.persistentGrowth === 'boolean') meta.persistentGrowth = snapshot.persistentGrowth;
            if (snapshot.worldId) meta.worldId = snapshot.worldId;
            if (snapshot.regions) regionManager.restore(snapshot.regions);
            if (snapshot.constructions) constructionManager.restore(snapshot.constructions);
            if (snapshot.villageInfra && MO.state.villageInfra) {
                Object.assign(MO.state.villageInfra, snapshot.villageInfra);
            }
            if (snapshot.workbench && MO.state.workbench) {
                Object.assign(MO.state.workbench, snapshot.workbench);
            }
            if (snapshot.levelMapSparse && MO.levelMap) {
                decodeSparseMap(snapshot.levelMapSparse, MO.levelMap);
            }
            if (snapshot.roadMapSparse && MO.roadMap) {
                decodeSparseMap(snapshot.roadMapSparse, MO.roadMap);
            }
            return true;
        }

        function saveToStorage(key = DEFAULT_STORAGE_KEY) {
            try {
                if (typeof window === 'undefined' || !window.localStorage) return false;
                window.localStorage.setItem(key, JSON.stringify(serialize()));
                return true;
            } catch (_) {
                return false;
            }
        }

        function loadFromStorage(key = DEFAULT_STORAGE_KEY) {
            try {
                if (typeof window === 'undefined' || !window.localStorage) return null;
                const raw = window.localStorage.getItem(key);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                restore(parsed);
                return parsed;
            } catch (_) {
                return null;
            }
        }

        function restoreSavedWorld(storageKey = DEFAULT_STORAGE_KEY) {
            try {
                if (typeof window === 'undefined' || !window.localStorage) return false;
                const raw = window.localStorage.getItem(storageKey);
                if (!raw) return false;
                const parsed = JSON.parse(raw);
                if (!parsed || !parsed.constructions || !Array.isArray(parsed.constructions.constructions)) return false;
                const hasCompleted = parsed.constructions.constructions.some(c => c.status === 'completed');
                const hasInfraOrWorkers = Boolean(
                    (parsed.villageInfra && (parsed.villageInfra.demarcated || parsed.villageInfra.roadBuilt))
                    || (Array.isArray(parsed.workers) && parsed.workers.length > 0)
                    || (parsed.activePhase > 0)
                );
                if (!hasCompleted && !hasInfraOrWorkers) return false;

                const state = MO.state;
                if (typeof parsed.seed === 'number') state.seed = parsed.seed;
                if (parsed.biome && MO.BIOMES && MO.BIOMES[parsed.biome]) state.biome = parsed.biome;
                if (typeof parsed.timeOfDay === 'number') state.timeOfDay = parsed.timeOfDay;
                state.mode = parsed.mode || 'house';
                state.workers = [];
                if (MO.groups && MO.groups.workers && MO.resources) {
                    MO.resources.clearGroup(MO.groups.workers);
                }

                MO.applyBiomeStyle(state.biome);
                MO.levelMap.fill(0);
                if (MO.roadMap) MO.roadMap.fill(0);
                MO.createProceduralTerrainMesh();
                MO.populateNatureAndSplats();
                MO.placeMixerStationOnTerrain();
                if (MO.rebuildSiteProps) MO.rebuildSiteProps();
                if (MO.rebuildCamp) MO.rebuildCamp();

                restore(parsed);
                MO.updateTerrainGeometry();

                constructionManager.getCompletedConstructions().forEach(c => {
                    if (constructionManager.rebuildArchivedFromSnapshot) {
                        constructionManager.rebuildArchivedFromSnapshot(c, regionManager);
                    } else if (c.mode === 'house' && constructionManager.rebuildArchivedHouseFromSnapshot) {
                        constructionManager.rebuildArchivedHouseFromSnapshot(c);
                    }
                });

                const activeLot = regionManager.getActiveLot();
                const allDone = !activeLot || activeLot.status === 'completed';
                state.villageCompleted = allDone;
                state.mode = (activeLot && activeLot.allowedModes && activeLot.allowedModes[0]) || (parsed.mode || 'house');

                if (MO.modes[state.mode] && MO.modes[state.mode].onInit) MO.modes[state.mode].onInit();
                if (typeof parsed.activePhase === 'number' && !allDone && parsed.activePhase > 0) {
                    state.phase = parsed.activePhase;
                }
                MO.populateBuildableLotWeeds();
                if (allDone || state.phase > 0) {
                    state.weeds.forEach(w => { w.cleared = true; if (w.mesh) w.mesh.visible = false; });
                }

                if (parsed.campBuilt && state.camp) {
                    (parsed.campBuilt.tents || []).forEach((built, i) => {
                        const tn = state.camp.tents && state.camp.tents[i];
                        if (tn && built) { tn.built = true; if (tn.builtMesh) tn.builtMesh.visible = true; if (tn.guideMesh) tn.guideMesh.visible = false; }
                    });
                    if (parsed.campBuilt.messHall && state.camp.messHall) {
                        state.camp.messHall.built = true;
                        if (state.camp.messHall.builtMesh) state.camp.messHall.builtMesh.visible = true;
                        if (state.camp.messHall.guideMesh) state.camp.messHall.guideMesh.visible = false;
                    }
                    (parsed.campBuilt.floodlights || []).forEach((built, i) => {
                        const fl = state.camp.floodlights && state.camp.floodlights[i];
                        if (fl && built) { fl.built = true; if (fl.builtMesh) fl.builtMesh.visible = true; if (fl.guideMesh) fl.guideMesh.visible = false; }
                    });
                }

                if (MO.initToolbox) MO.initToolbox();
                if (MO.initWorkbench) MO.initWorkbench();
                if (MO.setMixerBuilt && state.villageInfra) MO.setMixerBuilt(Boolean(state.villageInfra.mixerBuilt));
                if (MO.setUnloadingBuilt && state.villageInfra) MO.setUnloadingBuilt(Boolean(state.villageInfra.unloadingBuilt));
                if (MO.setStockYardsBuilt && state.villageInfra) MO.setStockYardsBuilt(Boolean(state.villageInfra.yardsBuilt));
                if (MO.setWorkbenchBuilt && state.villageInfra) MO.setWorkbenchBuilt(Boolean(state.villageInfra.workbenchBuilt));

                if (Array.isArray(parsed.workers) && MO.workerFactory && MO.workerFactory.hireWorker) {
                    parsed.workers.forEach(ws => {
                        const w = MO.workerFactory.hireWorker({
                            kind: ws.kind,
                            silent: true,
                            profile: { name: ws.name, role: ws.role, specialty: ws.specialty }
                        });
                        if (w) {
                            const ty = MO.getTerrainHeight ? MO.getTerrainHeight(ws.x, ws.z) : 0.28;
                            if (w.rig && w.rig.group) w.rig.group.position.set(ws.x, ty, ws.z);
                            if (typeof ws.energy === 'number') w.energy = ws.energy;
                            if (typeof ws.hydration === 'number') w.hydration = ws.hydration;
                            if (typeof ws.hunger === 'number') w.hunger = ws.hunger;
                            if (ws.statusText) w.statusText = ws.statusText;
                        }
                    });
                }

                renderDemarcationLines();
                renderLotMarkers();
                if (MO.invalidateNavigationCache) MO.invalidateNavigationCache();
                if (MO.syncPhaseUI) MO.syncPhaseUI();
                if (MO.updateVillageUI) MO.updateVillageUI();
                return true;
            } catch (err) {
                if (typeof console !== 'undefined' && console.warn) console.warn('restoreSavedWorld:', err);
                return false;
            }
        }

        function clearSavedWorld(storageKey = DEFAULT_STORAGE_KEY) {
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.removeItem(storageKey);
                }
            } catch (_) {}
        }

        return {
            meta,
            initDefaultWorld,
            onWorldRegenerated,
            demarcateWestInfrastructure,
            demarcateEastRoads,
            renderDemarcationLines,
            getNextBuildableVillageLot,
            archiveAndAdvanceToNextLot,
            getActiveLotOrigin,
            renderLotMarkers,
            getWorldObstacles,
            getNightLights,
            serialize,
            restore,
            saveToStorage,
            loadFromStorage,
            restoreSavedWorld,
            clearSavedWorld,
            getRegionManager: () => regionManager,
            getConstructionManager: () => constructionManager
        };
    }

    MO.createWorldManager = createWorldManager;
    MO.worldManager = createWorldManager(MO.regionManager, MO.constructionManager);
})(window.MO = window.MO || {});

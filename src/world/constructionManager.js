// =========================================================================
// WORLD: CONSTRUCTION MANAGER (PROJETOS, ARQUIVAMENTO 3D & OBSTÁCULOS)
// =========================================================================
(function(MO) {
    function createConstructionManager() {
        const constructions = new Map();
        let activeConstructionId = null;
        let nextSeq = 1;

        function extractObstaclesFromState(state) {
            const segments = [];
            const circles = [];
            const doorCenters = [];

            if (state.mode === 'house' && Array.isArray(state.walls)) {
                state.walls.forEach(wl => {
                    const hasBricks = (wl.slots && wl.slots.some(s => s.placed)) || wl.isPlastered;
                    if (!hasBricks) return;
                    if (wl.opening === 'door') {
                        const dx = wl.x2 - wl.x1;
                        const dz = wl.z2 - wl.z1;
                        doorCenters.push({ x: (wl.x1 + wl.x2) * 0.5, z: (wl.z1 + wl.z2) * 0.5 });
                        segments.push({ x1: wl.x1, z1: wl.z1, x2: wl.x1 + dx * 0.16, z2: wl.z1 + dz * 0.16, r: 0.14 });
                        segments.push({ x1: wl.x1 + dx * 0.84, z1: wl.z1 + dz * 0.84, x2: wl.x2, z2: wl.z2, r: 0.14 });
                    } else {
                        segments.push({ x1: wl.x1, z1: wl.z1, x2: wl.x2, z2: wl.z2, r: 0.24 });
                    }
                });

                if (Array.isArray(state.muros)) {
                    state.muros.forEach(mu => {
                        if (!mu.built) return;
                        if (mu.ori === 'H') {
                            segments.push({ x1: mu.x - 0.5, z1: mu.z, x2: mu.x + 0.5, z2: mu.z, r: 0.22 });
                        } else {
                            segments.push({ x1: mu.x, z1: mu.z - 0.5, x2: mu.x, z2: mu.z + 0.5, r: 0.22 });
                        }
                    });
                }

                if (Array.isArray(state.columns)) {
                    state.columns.forEach(col => {
                        if (col.hasFormwork || col.concreted) {
                            circles.push({ x: col.x, z: col.z, r: 0.20 });
                        }
                    });
                }
            } else if (state.mode === 'building' && state.building && Array.isArray(state.building.floors) && state.building.floors[0]) {
                const f0 = state.building.floors[0];
                if (f0.wallDone || f0.structDone) {
                    const bx = state.building.originX || 0;
                    const bz = state.building.originZ !== undefined ? state.building.originZ : -0.6;
                    doorCenters.push({ x: bx, z: bz + 1.6 });
                    segments.push({ x1: bx - 1.8, z1: bz - 1.6, x2: bx + 1.8, z2: bz - 1.6, r: 0.24 });
                    segments.push({ x1: bx - 1.8, z1: bz - 1.6, x2: bx - 1.8, z2: bz + 1.6, r: 0.24 });
                    segments.push({ x1: bx + 1.8, z1: bz - 1.6, x2: bx + 1.8, z2: bz + 1.6, r: 0.24 });
                    segments.push({ x1: bx - 1.8, z1: bz + 1.6, x2: bx - 0.5, z2: bz + 1.6, r: 0.24 });
                    segments.push({ x1: bx + 0.5, z1: bz + 1.6, x2: bx + 1.8, z2: bz + 1.6, r: 0.24 });
                }
            } else if (state.mode === 'tower' && state.tower && state.tower.towerPivot) {
                const tx = state.tower.originX || 0;
                const tz = state.tower.originZ !== undefined ? state.tower.originZ : -0.3;
                circles.push({ x: tx, z: tz, r: 1.35 });
            }

            return { segments, circles, doorCenters };
        }

        function captureBlueprintSnapshot(state) {
            if (state.mode !== 'house') {
                return { mode: state.mode, variant: state.variant, seed: state.seed };
            }
            return {
                mode: 'house',
                variant: state.variant,
                seed: state.seed,
                brickType: state.brickType,
                paintColorHex: state.paintColorHex,
                houseBaseY: state.houseBaseY,
                occupiedCells: Array.from(state.occupiedCells || []),
                openings: (state.walls || [])
                    .filter(w => w.opening)
                    .map(w => ({ x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, opening: w.opening })),
                muros: (state.muros || []).filter(m => m.built).map(m => ({ x: m.x, z: m.z, ori: m.ori })),
                stairs: (state.stairs || []).filter(s => s.built).map(s => ({ x: s.x, z: s.z }))
            };
        }

        function reparentHouseBuiltMeshes(archiveGroup) {
            const state = MO.state;
            const groups = MO.groups;
            if (!groups) return;

            // 1. Fundações concretadas (preserva apenas pilares e limpa guias/hitboxes/caixaria)
            if (Array.isArray(state.columns)) {
                state.columns.forEach(col => {
                    if (!col.meshGroup) return;
                    if (col.ringMesh) { MO.resources.removeAndDispose(col.meshGroup, col.ringMesh); col.ringMesh = null; }
                    if (col.hitbox) { MO.resources.removeAndDispose(col.meshGroup, col.hitbox); col.hitbox = null; }
                    if (col.formworkMesh) { MO.resources.removeAndDispose(col.meshGroup, col.formworkMesh); col.formworkMesh = null; }
                    if (col.holeMesh) { MO.resources.removeAndDispose(col.meshGroup, col.holeMesh); col.holeMesh = null; }
                    if (col.concreted && col.pillarMesh) {
                        archiveGroup.add(col.meshGroup);
                    }
                });
            }

            // 2. Paredes (baldrames, tijolos assentados, cintas, reboco, portas/janelas)
            if (groups.walls && Array.isArray(groups.walls.children)) {
                const propAndFormwork = new Set();
                const keepSet = new Set();
                (state.walls || []).forEach(w => {
                    if (w.propGroup) propAndFormwork.add(w.propGroup);
                    if (w.beamFormworkGroup) propAndFormwork.add(w.beamFormworkGroup);
                    (w.slots || []).forEach(sl => {
                        if (sl.placed && sl.mesh) keepSet.add(sl.mesh);
                    });
                    if (w.hasTopBeam && w.topBeamMesh) keepSet.add(w.topBeamMesh);
                    if (w.isPlastered && w.plasterGroup) keepSet.add(w.plasterGroup);
                    if (w.fixtureGroup) keepSet.add(w.fixtureGroup);
                });

                groups.walls.children.slice().forEach(child => {
                    if (keepSet.has(child)) {
                        archiveGroup.add(child);
                        return;
                    }
                    const ud = child.userData || {};
                    const isBaldrame = !ud.wallSlot && !ud.voidWall && !ud.finishWall && !propAndFormwork.has(child);
                    if (isBaldrame) {
                        archiveGroup.add(child);
                    }
                });
            }

            // 3. Muros e escadas construídos
            if (groups.muroStair && Array.isArray(groups.muroStair.children)) {
                groups.muroStair.children.slice().forEach(child => {
                    const ud = child.userData || {};
                    if ((ud.muroRef && ud.muroRef.built) || (ud.stairRef && ud.stairRef.built)) {
                        archiveGroup.add(child);
                    }
                });
            }

            // 4. Lajes de contrapiso concretadas e mobília interna
            if (groups.floor && Array.isArray(groups.floor.children)) {
                groups.floor.children.slice().forEach(child => {
                    const ft = child.userData && child.userData.floorTile;
                    if (!ft || ft.concreted) {
                        if (!ft || child === ft.slabMesh) {
                            archiveGroup.add(child);
                        }
                    }
                });
            }

            // 5. Instalações MEP e pontos de luz
            if (groups.mep && Array.isArray(groups.mep.children)) {
                groups.mep.children.slice().forEach(child => {
                    archiveGroup.add(child);
                });
            }

            // 6. Telhado
            if (groups.roof && Array.isArray(groups.roof.children)) {
                groups.roof.children.slice().forEach(child => {
                    archiveGroup.add(child);
                });
            }
        }

        function reparentActiveModeMeshes(mode, archiveGroup) {
            if (mode === 'house') {
                reparentHouseBuiltMeshes(archiveGroup);
                return;
            }
            const groupMap = {
                bridge: MO.groups && MO.groups.bridge,
                building: MO.groups && MO.groups.building,
                tower: MO.groups && MO.groups.tower
            };
            const srcGroup = groupMap[mode];
            if (!srcGroup || !Array.isArray(srcGroup.children)) return;
            srcGroup.children.slice().forEach(child => {
                if (child.visible) {
                    archiveGroup.add(child);
                }
            });
        }

        function clearActiveConstructionGroups() {
            if (!MO.groups || !MO.resources) return;
            [
                MO.groups.blueprint, MO.groups.foundation, MO.groups.walls,
                MO.groups.muroStair, MO.groups.floor, MO.groups.mep,
                MO.groups.roof, MO.groups.bridge, MO.groups.building, MO.groups.tower
            ].forEach(g => {
                if (g) MO.resources.clearGroup(g);
            });
        }

        function startConstruction(spec = {}) {
            const id = spec.id || `const-${nextSeq++}`;
            const record = {
                id,
                lotId: spec.lotId || 'lot-1',
                regionId: spec.regionId || 'main-valley',
                mode: spec.mode || (MO.state ? MO.state.mode : 'house'),
                variant: spec.variant || (MO.state ? MO.state.variant : 'L-shape'),
                seed: spec.seed !== undefined ? spec.seed : (MO.state ? MO.state.seed : 1000),
                phase: spec.phase || 0,
                status: spec.status || 'in_progress',
                group: null,
                obstacles: { segments: [], circles: [], doorCenters: [] },
                lights: [],
                blueprintSnapshot: null,
                createdAt: spec.createdAt || 0,
                completedAt: null
            };
            constructions.set(record.id, record);
            activeConstructionId = record.id;
            return record;
        }

        function archiveActiveConstruction(regionManager) {
            const state = MO.state;
            let active = activeConstructionId ? constructions.get(activeConstructionId) : null;
            if (!active) {
                const activeLot = regionManager ? regionManager.getActiveLot() : null;
                active = startConstruction({
                    lotId: activeLot ? activeLot.id : 'lot-1',
                    regionId: activeLot ? activeLot.regionId : 'main-valley',
                    mode: state.mode,
                    variant: state.variant,
                    seed: state.seed,
                    phase: state.phase
                });
            }

            const archiveGroup = new THREE.Group();
            archiveGroup.name = active.id;
            reparentActiveModeMeshes(state.mode, archiveGroup);

            if (MO.groups && MO.groups.archivedConstructions) {
                MO.groups.archivedConstructions.add(archiveGroup);
            }

            active.group = archiveGroup;
            active.variant = state.variant;
            active.phase = state.phase;
            active.status = 'completed';
            active.completedAt = MO.simClock ? MO.simClock.simTime : 0;
            active.obstacles = extractObstaclesFromState(state);
            active.blueprintSnapshot = captureBlueprintSnapshot(state);

            if (state.mode === 'house') {
                active.lights = (state.elecLights || []).slice();
            } else if (state.mode === 'bridge' && state.bridge) {
                active.lights = (state.bridge.lamps || []).slice();
                if (state.villageInfra) state.villageInfra.bridgeUnlocked = true;
            } else if (state.mode === 'building' && state.building) {
                active.lights = (state.building.floors || []).filter(f => f.light).map(f => ({ light: f.light }));
            } else if (state.mode === 'tower' && state.tower && state.tower.beaconLight) {
                active.lights = [{ light: state.tower.beaconLight, bulb: state.tower.beaconMesh }];
            }

            clearActiveConstructionGroups();

            if (regionManager) {
                const lot = regionManager.getLot(active.lotId);
                if (lot) {
                    lot.status = 'completed';
                    lot.constructionId = active.id;
                }
            }

            activeConstructionId = null;
            return active;
        }

        function getActiveConstruction() {
            return activeConstructionId ? (constructions.get(activeConstructionId) || null) : null;
        }

        function getConstruction(id) {
            return constructions.get(id) || null;
        }

        function getAllConstructions() {
            return Array.from(constructions.values());
        }

        function getCompletedConstructions() {
            return getAllConstructions().filter(c => c.status === 'completed');
        }

        function clearAll() {
            if (MO.groups && MO.groups.archivedConstructions && MO.resources) {
                MO.resources.clearGroup(MO.groups.archivedConstructions);
            }
            constructions.clear();
            activeConstructionId = null;
            nextSeq = 1;
        }

        function serialize() {
            return {
                activeConstructionId,
                nextSeq,
                constructions: getAllConstructions().map(c => ({
                    id: c.id,
                    lotId: c.lotId,
                    regionId: c.regionId,
                    mode: c.mode,
                    variant: c.variant,
                    seed: c.seed,
                    phase: c.phase,
                    status: c.status,
                    obstacles: c.obstacles,
                    blueprintSnapshot: c.blueprintSnapshot,
                    createdAt: c.createdAt,
                    completedAt: c.completedAt
                }))
            };
        }

        function restore(data) {
            clearAll();
            if (!data || !Array.isArray(data.constructions)) return;
            data.constructions.forEach(c => {
                constructions.set(c.id, {
                    ...c,
                    group: null,
                    lights: [],
                    obstacles: c.obstacles || { segments: [], circles: [], doorCenters: [] }
                });
            });
            activeConstructionId = data.activeConstructionId || null;
            nextSeq = data.nextSeq || (constructions.size + 1);
        }

        function rebuildArchivedHouseFromSnapshot(record) {
            const snap = record && record.blueprintSnapshot;
            if (!snap || snap.mode !== 'house' || !Array.isArray(snap.occupiedCells) || snap.occupiedCells.length === 0) {
                return null;
            }
            const state = MO.state;
            const prevMode = state.mode;
            state.mode = 'house';
            if (MO.resetStructuralState) MO.resetStructuralState();
            state.variant = snap.variant || 'compact';
            state.brickType = snap.brickType || 'standard';
            state.paintColorHex = snap.paintColorHex || '#f1f5f9';
            state.occupiedCells = new Set(snap.occupiedCells);
            state.muros = (snap.muros || []).map(m => ({ ...m, built: true }));
            state.stairs = (snap.stairs || []).map(s => ({ ...s, built: true }));

            snap.occupiedCells.forEach(k => {
                const [gx, gz] = k.split(',').map(Number);
                const c = MO.gridToWorldCenter(gx, gz);
                MO.paintLevelWeight(c.x, c.z, 1.75, 1.0);
            });
            MO.updateTerrainGeometry();

            MO.rebuildBlueprintFromCells();
            if (snap.houseBaseY !== undefined) state.houseBaseY = snap.houseBaseY;

            (snap.openings || []).forEach(op => {
                const match = state.walls.find(w =>
                    Math.abs(w.x1 - op.x1) < 0.05 && Math.abs(w.z1 - op.z1) < 0.05 &&
                    Math.abs(w.x2 - op.x2) < 0.05 && Math.abs(w.z2 - op.z2) < 0.05
                );
                if (match) match.opening = op.opening;
            });

            MO.buildFoundation3D();
            state.columns.forEach(c => {
                c.dug = true;
                c.hasRebar = true;
                MO.attachWoodFormworkToColumn(c);
                MO.concreteColumn(c);
            });

            MO.buildInteractiveWalls3D();
            state.walls.forEach(w => {
                w.hasProp = Boolean(w.opening);
                w.slots.forEach(sl => {
                    sl.placed = true;
                    sl.mesh.visible = true;
                });
                w.hasTopBeam = true;
                if (w.topBeamMesh) w.topBeamMesh.visible = true;
                w.isPlastered = true;
                if (w.plasterGroup) w.plasterGroup.visible = true;
                w.isPainted = true;
                if (w.plasterMat) w.plasterMat.color.set(state.paintColorHex);
            });

            MO.buildFloorGrid3D();
            state.floorTiles.forEach(ft => {
                ft.concreted = true;
                if (ft.hitbox) ft.hitbox.visible = false;
                const slab = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.14, 0.98), MO.mats.concrete);
                slab.position.set(ft.x, state.houseBaseY + 0.07, ft.z);
                slab.receiveShadow = true;
                slab.userData = { floorTile: ft };
                ft.slabMesh = slab;
                MO.groups.floor.add(slab);
            });

            state.roofStage = 0;
            MO.buildRealGableRoofStage();
            MO.buildRealGableRoofStage();
            state.furnitureBuilt = false;
            if (MO.buildHouseInteriorFurniture) MO.buildHouseInteriorFurniture();

            const archiveGroup = new THREE.Group();
            archiveGroup.name = record.id;
            reparentActiveModeMeshes('house', archiveGroup);
            if (MO.groups && MO.groups.archivedConstructions) {
                MO.groups.archivedConstructions.add(archiveGroup);
            }
            record.group = archiveGroup;
            record.obstacles = extractObstaclesFromState(state);
            clearActiveConstructionGroups();

            state.occupiedCells.clear();
            state.columns = [];
            state.walls = [];
            state.floorTiles = [];
            state.muros = [];
            state.stairs = [];
            state.furnitureBuilt = false;
            state.roofStage = 0;
            state.mode = prevMode;
            return record;
        }

        return {
            startConstruction,
            archiveActiveConstruction,
            rebuildArchivedHouseFromSnapshot,
            extractObstaclesFromState,
            captureBlueprintSnapshot,
            getActiveConstruction,
            getConstruction,
            getAllConstructions,
            getCompletedConstructions,
            clearAll,
            serialize,
            restore
        };
    }

    MO.createConstructionManager = createConstructionManager;
    MO.constructionManager = createConstructionManager();
})(window.MO = window.MO || {});

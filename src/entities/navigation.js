// =========================================================================
// ENTITIES: FÍSICA DE COLISÃO COM PAREDES, PORTAS E PATHFINDING A*
// =========================================================================
(function(MO) {
    const GRID_N = 72;
    const WORLD_HALF = 14.4;
    const CELL = (WORLD_HALF * 2) / GRID_N; // 0.40m por célula (passa limpo em portas de 0.68m)
    const MAX_PATH_CACHE = 256;

    const navCache = {
        manualVersion: 1,
        lastSig: '',
        baseObstacles: null,
        baseBlocked: null,
        paths: new Map(),
        hits: 0,
        misses: 0
    };

    MO.invalidateNavigationCache = function() {
        navCache.manualVersion += 1;
        navCache.lastSig = '';
        navCache.baseObstacles = null;
        navCache.baseBlocked = null;
        navCache.paths.clear();
    };

    function getNavigationStats() {
        return {
            version: navCache.manualVersion,
            hits: navCache.hits,
            misses: navCache.misses,
            cachedPaths: navCache.paths.size
        };
    }
    MO.getNavigationStats = getNavigationStats;

    function distPointToSegmentSq(px, pz, x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 1e-6) {
            return { dSq: (px - x1) * (px - x1) + (pz - z1) * (pz - z1), cx: x1, cz: z1 };
        }
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
        const cx = x1 + t * dx;
        const cz = z1 + t * dz;
        return { dSq: (px - cx) * (px - cx) + (pz - cz) * (pz - cz), cx, cz };
    }

    function computeObstacleSignature() {
        const state = MO.state;
        if (!state) return '0';
        const wallsPlaced = Array.isArray(state.walls)
            ? state.walls.reduce((acc, wl) => acc + (wl.isPlastered ? 10 : 0) + (wl.slots ? (wl.slots.some(s => s.placed) ? 1 : 0) : 0), 0)
            : 0;
        const murosBuilt = Array.isArray(state.muros) ? state.muros.filter(m => m.built).length : 0;
        const colsDone = Array.isArray(state.columns) ? state.columns.filter(c => c.hasFormwork || c.concreted).length : 0;
        const tentsBuilt = (state.camp && Array.isArray(state.camp.tents)) ? state.camp.tents.filter(t => t.built).length : 0;
        const messBuilt = (state.camp && state.camp.messHall && state.camp.messHall.built) ? 1 : 0;
        const archCount = MO.constructionManager ? MO.constructionManager.getCompletedConstructions().length : 0;
        const bridgeReady = (state.villageInfra && state.villageInfra.bridgeUnlocked) ? 1 : 0;
        const bldDone = (state.building && state.building.floors && state.building.floors[0] && (state.building.floors[0].hasWalls || state.building.floors[0].wallDone || state.building.floors[0].structDone)) ? 1 : 0;
        return `${navCache.manualVersion}|${state.seed}|${state.mode}|${wallsPlaced}|${murosBuilt}|${colsDone}|${tentsBuilt}|${messBuilt}|${archCount}|${bridgeReady}|${bldDone}`;
    }

    function buildBaseObstacles() {
        const state = MO.state;
        const segments = [];
        const circles = [];
        const doorCenters = [];

        if (state.mode === 'house' && state.walls) {
            state.walls.forEach(wl => {
                const hasBricks = (wl.slots && wl.slots.some(s => s.placed)) || wl.isPlastered;
                if (!hasBricks) return;

                if (wl.opening === 'door') {
                    // Ombreiras finas nas pontas (0..0.16 e 0.84..1.0), deixando vão central de 0.68m aberto!
                    const dx = wl.x2 - wl.x1;
                    const dz = wl.z2 - wl.z1;
                    doorCenters.push({ x: (wl.x1 + wl.x2) * 0.5, z: (wl.z1 + wl.z2) * 0.5 });
                    segments.push({
                        x1: wl.x1, z1: wl.z1,
                        x2: wl.x1 + dx * 0.16, z2: wl.z1 + dz * 0.16,
                        r: 0.14
                    });
                    segments.push({
                        x1: wl.x1 + dx * 0.84, z1: wl.z1 + dz * 0.84,
                        x2: wl.x2, z2: wl.z2,
                        r: 0.14
                    });
                } else {
                    segments.push({ x1: wl.x1, z1: wl.z1, x2: wl.x2, z2: wl.z2, r: 0.24 });
                }
            });

            if (state.muros) {
                state.muros.forEach(mu => {
                    if (!mu.built) return;
                    if (mu.ori === 'H') {
                        segments.push({ x1: mu.x - 0.5, z1: mu.z, x2: mu.x + 0.5, z2: mu.z, r: 0.22 });
                    } else {
                        segments.push({ x1: mu.x, z1: mu.z - 0.5, x2: mu.x, z2: mu.z + 0.5, r: 0.22 });
                    }
                });
            }

            if (state.columns) {
                state.columns.forEach(col => {
                    if (col.hasFormwork || col.concreted) {
                        circles.push({ x: col.x, z: col.z, r: 0.20, colRef: col });
                    }
                });
            }
        }

        if (state.mode === 'building' && state.building && state.building.floors && state.building.floors[0]) {
            const f0 = state.building.floors[0];
            if (f0.hasWalls || f0.wallDone || f0.structDone) {
                const bx = state.building.originX !== undefined ? state.building.originX : 0;
                const bz = state.building.originZ !== undefined ? state.building.originZ : -0.6;
                doorCenters.push({ x: bx, z: bz + 1.6 });
                segments.push({ x1: bx - 1.8, z1: bz - 1.6, x2: bx + 1.8, z2: bz - 1.6, r: 0.24 });
                segments.push({ x1: bx - 1.8, z1: bz - 1.6, x2: bx - 1.8, z2: bz + 1.6, r: 0.24 });
                segments.push({ x1: bx + 1.8, z1: bz - 1.6, x2: bx + 1.8, z2: bz + 1.6, r: 0.24 });
                segments.push({ x1: bx - 1.8, z1: bz + 1.6, x2: bx - 0.5, z2: bz + 1.6, r: 0.24 });
                segments.push({ x1: bx + 0.5, z1: bz + 1.6, x2: bx + 1.8, z2: bz + 1.6, r: 0.24 });
            }
        }

        circles.push({ x: MO.STATION_MIXER.x, z: MO.STATION_MIXER.z, r: 0.84 });

        if (state.camp && state.camp.tents) {
            state.camp.tents.forEach(tn => {
                if (tn.built) {
                    circles.push({ x: tn.x, z: tn.z, r: 0.58, tentId: tn.id });
                }
            });
            if (state.camp.messHall && state.camp.messHall.built) {
                circles.push({ x: state.camp.messHall.x, z: state.camp.messHall.z, r: 0.52, isMessHall: true });
            }
        }

        if (MO.worldManager && MO.worldManager.getWorldObstacles) {
            const persisted = MO.worldManager.getWorldObstacles();
            if (persisted.segments) persisted.segments.forEach(s => segments.push(s));
            if (persisted.circles) persisted.circles.forEach(c => circles.push(c));
            if (persisted.doorCenters) persisted.doorCenters.forEach(d => doorCenters.push(d));
        }

        return { segments, circles, doorCenters };
    }

    function ensureNavCacheFresh() {
        const sig = computeObstacleSignature();
        if (sig !== navCache.lastSig || !navCache.baseObstacles) {
            navCache.lastSig = sig;
            navCache.baseObstacles = buildBaseObstacles();
            navCache.baseBlocked = null;
            navCache.paths.clear();
        }
        return navCache.baseObstacles;
    }

    function collectObstacles(w) {
        const base = ensureNavCacheFresh();
        const ignoreTentId = (w && w.task && w.task.type === 'sleep-tent' && w.task.tent) ? w.task.tent.id : -1;
        const ignoreColRef = (w && w.task && w.task.col) ? w.task.col : null;
        const isCampTask = Boolean(w && w.task && (w.task.type === 'eat-meal' || w.task.type === 'camp-hangout' || w.task.type === 'shelter-rain' || w.task.type === 'drink-water'));

        if (ignoreTentId === -1 && !ignoreColRef && !isCampTask) {
            return { ...base, usesCustomFilter: false };
        }
        return {
            segments: base.segments,
            doorCenters: base.doorCenters,
            circles: base.circles.filter(c => {
                if (ignoreTentId !== -1 && c.tentId === ignoreTentId) return false;
                if (ignoreColRef && c.colRef === ignoreColRef) return false;
                if (isCampTask && c.isMessHall) return false;
                return true;
            }),
            usesCustomFilter: true
        };
    }

    function worldToGrid(x, z) {
        const gx = Math.max(0, Math.min(GRID_N - 1, Math.floor((x + WORLD_HALF) / CELL)));
        const gz = Math.max(0, Math.min(GRID_N - 1, Math.floor((z + WORLD_HALF) / CELL)));
        return { gx, gz };
    }

    function gridToWorld(gx, gz) {
        return {
            x: -WORLD_HALF + (gx + 0.5) * CELL,
            z: -WORLD_HALF + (gz + 0.5) * CELL
        };
    }

    function isRiverBlockedAt(wx, wz) {
        if (!MO.state || !MO.state.unifiedVillage || !MO.getRiverCenterX) return false;
        const rx = MO.getRiverCenterX(wz);
        if (Math.abs(wx - rx) >= 1.95) return false;
        const infra = MO.state.villageInfra;
        const bz = (infra && infra.bridgeZ !== undefined) ? infra.bridgeZ : -0.6;
        if (infra && infra.bridgeUnlocked && Math.abs(wz - bz) < 0.92) return false;
        if (MO.state.city && Array.isArray(MO.state.city.structures)) {
            const onBridge = MO.state.city.structures.some(st => st.kind === 'bridge' && st.built && Math.abs(wz - st.z) < 1.35);
            if (onBridge) return false;
        }
        return true;
    }
    MO.isRiverBlockedAt = isRiverBlockedAt;

    function isCellBlocked(wx, wz, segments, circles, doorCenters) {
        if (!MO.state.infiniteWorld && Math.hypot(wx, wz) > MO.DIORAMA_R - 0.60) return true;
        if (isRiverBlockedAt(wx, wz)) return true;
        // Garante corredor livre pelo centro das portas!
        for (let i = 0; i < doorCenters.length; i++) {
            const d = doorCenters[i];
            if (Math.hypot(wx - d.x, wz - d.z) < 0.34) return false;
        }
        for (let i = 0; i < segments.length; i++) {
            const s = segments[i];
            if (distPointToSegmentSq(wx, wz, s.x1, s.z1, s.x2, s.z2).dSq < (s.r + 0.08) * (s.r + 0.08)) {
                return true;
            }
        }
        for (let i = 0; i < circles.length; i++) {
            const c = circles[i];
            if (c.r < 0.35) continue; // Colunas finas resolvem no deslizamento contínuo sem fechar células de porta
            const dx = wx - c.x, dz = wz - c.z;
            if (dx * dx + dz * dz < (c.r + 0.06) * (c.r + 0.06)) return true;
        }
        return false;
    }

    MO.getWorkerApproachPoint = function(fromX, fromZ, rawX, rawZ, wallRef) {
        if (!wallRef) return { x: rawX, z: rawZ };
        const mx = (wallRef.x1 + wallRef.x2) / 2;
        const mz = (wallRef.z1 + wallRef.z2) / 2;
        const standOff = 0.44;
        if (wallRef.ori === 'H') {
            const side = fromZ >= mz ? 1 : -1;
            return { x: rawX, z: mz + side * standOff };
        }
        const side = fromX >= mx ? 1 : -1;
        return { x: mx + side * standOff, z: rawZ };
    };

    MO.computeWorkerPath = function(w, startX, startZ, goalX, goalZ) {
        const { segments, circles, doorCenters, usesCustomFilter } = collectObstacles(w);
        const crossesRiver = MO.state.unifiedVillage && MO.getRiverCenterX
            && ((startX - MO.getRiverCenterX(startZ)) * (goalX - MO.getRiverCenterX(goalZ)) <= 0);
        if (segments.length === 0 && !crossesRiver) return [{ x: goalX, z: goalZ }];

        const useLocalCore = !MO.state.infiniteWorld || Math.max(Math.abs(startX), Math.abs(startZ), Math.abs(goalX), Math.abs(goalZ)) < WORLD_HALF - 1.5;
        const midX = useLocalCore ? 0 : (startX + goalX) * 0.5;
        const midZ = useLocalCore ? 0 : (startZ + goalZ) * 0.5;
        const localHalf = useLocalCore
            ? WORLD_HALF
            : Math.max(WORLD_HALF, Math.ceil(Math.max(Math.abs(goalX - startX), Math.abs(goalZ - startZ)) * 0.65) + 6);
        const localCell = (localHalf * 2) / GRID_N;

        const toGrid = (x, z) => ({
            gx: Math.max(0, Math.min(GRID_N - 1, Math.floor((x - midX + localHalf) / localCell))),
            gz: Math.max(0, Math.min(GRID_N - 1, Math.floor((z - midZ + localHalf) / localCell)))
        });
        const toWorld = (gx, gz) => ({
            x: midX - localHalf + (gx + 0.5) * localCell,
            z: midZ - localHalf + (gz + 0.5) * localCell
        });

        const startC = toGrid(startX, startZ);
        const goalC = toGrid(goalX, goalZ);
        if (startC.gx === goalC.gx && startC.gz === goalC.gz) return [{ x: goalX, z: goalZ }];

        const cacheKey = (useLocalCore && !usesCustomFilter) ? `${startC.gx},${startC.gz}>${goalC.gx},${goalC.gz}` : null;
        if (cacheKey && navCache.paths.has(cacheKey)) {
            navCache.hits += 1;
            const cachedPts = navCache.paths.get(cacheKey);
            const result = cachedPts.map(pt => ({ x: pt.x, z: pt.z }));
            if (result.length > 0) result[result.length - 1] = { x: goalX, z: goalZ };
            return result;
        }
        navCache.misses += 1;

        let blocked;
        if (useLocalCore && !usesCustomFilter) {
            if (!navCache.baseBlocked) {
                const grid = new Uint8Array(GRID_N * GRID_N);
                for (let gz = 0; gz < GRID_N; gz++) {
                    for (let gx = 0; gx < GRID_N; gx++) {
                        const wp = toWorld(gx, gz);
                        if (isCellBlocked(wp.x, wp.z, segments, circles, doorCenters)) {
                            grid[gz * GRID_N + gx] = 1;
                        }
                    }
                }
                navCache.baseBlocked = grid;
            }
            blocked = new Uint8Array(navCache.baseBlocked);
        } else {
            blocked = new Uint8Array(GRID_N * GRID_N);
            for (let gz = 0; gz < GRID_N; gz++) {
                for (let gx = 0; gx < GRID_N; gx++) {
                    const wp = toWorld(gx, gz);
                    if (isCellBlocked(wp.x, wp.z, segments, circles, doorCenters)) {
                        blocked[gz * GRID_N + gx] = 1;
                    }
                }
            }
        }
        blocked[startC.gz * GRID_N + startC.gx] = 0;
        blocked[goalC.gz * GRID_N + goalC.gx] = 0;

        const startIdx = startC.gz * GRID_N + startC.gx;
        const goalIdx = goalC.gz * GRID_N + goalC.gx;
        const gScore = new Float32Array(GRID_N * GRID_N);
        const fScore = new Float32Array(GRID_N * GRID_N);
        const parent = new Int16Array(GRID_N * GRID_N);
        const closed = new Uint8Array(GRID_N * GRID_N);
        gScore.fill(1e9);
        fScore.fill(1e9);
        parent.fill(-1);

        gScore[startIdx] = 0;
        fScore[startIdx] = Math.hypot(goalC.gx - startC.gx, goalC.gz - startC.gz);

        const open = [startIdx];
        const dirs = [
            [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
            [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]
        ];

        let found = false;
        while (open.length > 0) {
            let bestPos = 0;
            for (let i = 1; i < open.length; i++) {
                if (fScore[open[i]] < fScore[open[bestPos]]) bestPos = i;
            }
            const cur = open.splice(bestPos, 1)[0];
            if (cur === goalIdx) {
                found = true;
                break;
            }
            closed[cur] = 1;
            const cx = cur % GRID_N;
            const cz = Math.floor(cur / GRID_N);

            for (let d = 0; d < dirs.length; d++) {
                const nx = cx + dirs[d][0];
                const nz = cz + dirs[d][1];
                if (nx < 0 || nx >= GRID_N || nz < 0 || nz >= GRID_N) continue;
                const nIdx = nz * GRID_N + nx;
                if (closed[nIdx] || blocked[nIdx]) continue;
                if (dirs[d][0] !== 0 && dirs[d][1] !== 0) {
                    if (blocked[cz * GRID_N + nx] || blocked[nz * GRID_N + cx]) continue;
                }
                const tentG = gScore[cur] + dirs[d][2];
                if (tentG < gScore[nIdx]) {
                    parent[nIdx] = cur;
                    gScore[nIdx] = tentG;
                    fScore[nIdx] = tentG + Math.hypot(goalC.gx - nx, goalC.gz - nz);
                    if (!open.includes(nIdx)) open.push(nIdx);
                }
            }
        }

        if (!found) return [{ x: goalX, z: goalZ }];

        const rawPath = [];
        let trace = goalIdx;
        while (trace !== -1 && trace !== startIdx) {
            const gx = trace % GRID_N;
            const gz = Math.floor(trace / GRID_N);
            rawPath.push(gridToWorld ? toWorld(gx, gz) : gridToWorld(gx, gz));
            trace = parent[trace];
        }
        rawPath.reverse();
        if (rawPath.length > 0) rawPath[rawPath.length - 1] = { x: goalX, z: goalZ };
        const finalPath = rawPath.length > 0 ? rawPath : [{ x: goalX, z: goalZ }];
        if (cacheKey) {
            if (navCache.paths.size >= MAX_PATH_CACHE) {
                const firstKey = navCache.paths.keys().next().value;
                navCache.paths.delete(firstKey);
            }
            navCache.paths.set(cacheKey, finalPath.map(pt => ({ x: pt.x, z: pt.z })));
        }
        return finalPath;
    };

    MO.resolveWorkerPhysics = function(w, nextX, nextZ) {
        const { segments, circles } = collectObstacles(w);
        let x = nextX;
        let z = nextZ;

        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < segments.length; i++) {
                const s = segments[i];
                const hit = distPointToSegmentSq(x, z, s.x1, s.z1, s.x2, s.z2);
                const minDist = s.r;
                if (hit.dSq < minDist * minDist) {
                    const d = Math.sqrt(hit.dSq);
                    if (d > 1e-5) {
                        const push = minDist - d;
                        x += ((x - hit.cx) / d) * push;
                        z += ((z - hit.cz) / d) * push;
                    } else {
                        const perpX = -(s.z2 - s.z1);
                        const perpZ = (s.x2 - s.x1);
                        const pl = Math.hypot(perpX, perpZ) || 1;
                        x += (perpX / pl) * minDist;
                        z += (perpZ / pl) * minDist;
                    }
                }
            }

            for (let i = 0; i < circles.length; i++) {
                const c = circles[i];
                const dx = x - c.x;
                const dz = z - c.z;
                const d = Math.hypot(dx, dz);
                if (d < c.r) {
                    if (d > 1e-4) {
                        x = c.x + (dx / d) * c.r;
                        z = c.z + (dz / d) * c.r;
                    } else {
                        z = c.z + c.r;
                    }
                }
            }

            MO.state.workers.forEach(other => {
                if (other === w || other.sleepingInside) return;
                const op = other.rig.group.position;
                const dx = x - op.x;
                const dz = z - op.z;
                const d = Math.hypot(dx, dz);
                if (d > 1e-4 && d < 0.36) {
                    const push = (0.36 - d) * 0.5;
                    x += (dx / d) * push;
                    z += (dz / d) * push;
                }
            });

            if (!MO.state.infiniteWorld) {
                const rMax = MO.DIORAMA_R - 0.55;
                const rCur = Math.hypot(x, z);
                if (rCur > rMax) {
                    x = (x / rCur) * rMax;
                    z = (z / rCur) * rMax;
                }
            }
            if (isRiverBlockedAt(x, z)) {
                const rx = MO.getRiverCenterX(z);
                x = x < rx ? (rx - 1.98) : (rx + 1.98);
            }
        }
        return { x, z };
    };
})(window.MO = window.MO || {});

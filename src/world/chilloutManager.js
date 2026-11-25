// =========================================================================
// WORLD: CHILLOUT MANAGER (CONSTRUÇÃO AUTOMÁTICA PROGRESSIVA DA CIDADE)
// =========================================================================
(function(MO) {
    let stageIndex = 0;
    let stageCooldown = 0;
    let currentLabel = 'Inativo';
    let expansionCount = 0;

    function isDrySpot(x, z) {
        if (!MO.getTerrainHeight) return true;
        const h = MO.getTerrainHeight(x, z);
        return h >= ((MO.WATER_LEVEL || -0.36) + 0.18);
    }

    function findDryPosition(baseX, baseZ, maxRadius = 8) {
        if (isDrySpot(baseX, baseZ)) return { x: baseX, z: baseZ };
        for (let r = 1.5; r <= maxRadius; r += 1.5) {
            for (let a = 0; a < 8; a++) {
                const ang = (a / 8) * Math.PI * 2;
                const tx = baseX + Math.cos(ang) * r;
                const tz = baseZ + Math.sin(ang) * r;
                if (isDrySpot(tx, tz)) return { x: tx, z: tz };
            }
        }
        return { x: baseX, z: baseZ };
    }

    function ensureResourcesForCost(cost) {
        const eco = MO.state && MO.state.economy;
        if (!eco || eco.sandboxMode || !cost) return;
        const delta = {};
        ['wood', 'stone', 'iron', 'food', 'coins'].forEach(k => {
            if (cost[k] && (eco[k] || 0) < cost[k]) {
                delta[k] = (cost[k] - (eco[k] || 0)) + 2;
            }
        });
        if (Object.keys(delta).length > 0 && MO.cityManager && MO.cityManager.addResources) {
            MO.cityManager.addResources(delta);
        }
    }

    function buildStraightRoad(x0, z0, x1, z1, kind = 'dirt') {
        if (!MO.cityManager) return 0;
        const dx = Math.abs(x1 - x0);
        const dz = Math.abs(z1 - z0);
        const sx = x0 < x1 ? 1 : -1;
        const sz = z0 < z1 ? 1 : -1;
        let err = dx - dz;
        let cx = Math.round(x0);
        let cz = Math.round(z0);
        const ex = Math.round(x1);
        const ez = Math.round(z1);
        let placed = 0;
        let guard = 0;
        while (guard++ < 48) {
            if (isDrySpot(cx + 0.5, cz + 0.5)) {
                if (kind === 'paved') ensureResourcesForCost(MO.cityManager.BUILD_COSTS['paved-street']);
                if (MO.cityManager.paintRoadOrStreet({ x: cx + 0.5, z: cz + 0.5 }, kind)) {
                    placed++;
                }
            }
            if (cx === ex && cz === ez) break;
            const e2 = 2 * err;
            if (e2 > -dz) { err -= dz; cx += sx; }
            if (e2 < dx) { err += dx; cz += sz; }
        }
        return placed;
    }

    function hasPendingRoads() {
        const infra = MO.state && MO.state.villageInfra;
        return Boolean(infra && Array.isArray(infra.roadSegments) && infra.roadSegments.some(s => !s.built));
    }

    function hasPendingStructures() {
        const city = MO.state && MO.state.city;
        return Boolean(city && Array.isArray(city.structures) && city.structures.some(s => !s.built));
    }

    function hasPendingSupport() {
        const infra = MO.state && MO.state.villageInfra;
        const camp = MO.state && MO.state.camp;
        if (infra) {
            if (infra.unloadingPlaced && !infra.unloadingBuilt) return true;
            if (infra.mixerPlaced && !infra.mixerBuilt) return true;
            if (infra.workbenchPlaced && !infra.workbenchBuilt) return true;
            if (infra.yardsPlaced && !infra.stockYardsBuilt) return true;
        }
        if (camp) {
            if (camp.messHall && !camp.messHall.built) return true;
            if (Array.isArray(camp.tents) && camp.tents.some(t => !t.built)) return true;
            if (Array.isArray(camp.floodlights) && camp.floodlights.some(f => !f.built)) return true;
        }
        return false;
    }

    function hasActiveBuilding() {
        return Boolean(MO.constructionManager && MO.constructionManager.getActiveConstruction && MO.constructionManager.getActiveConstruction());
    }

    function isBusyWithWork() {
        return hasPendingRoads() || hasPendingStructures() || hasPendingSupport() || hasActiveBuilding();
    }

    function focusSoft(x, z, r = 24.0) {
        if (MO.focusCameraOn && MO.camOrbit && !MO.camOrbit.isDragging) {
            MO.focusCameraOn(x, z, r);
        }
    }

    function setStageLabel(lbl) {
        currentLabel = lbl;
        if (MO.state && MO.state.city) MO.state.city.chilloutStage = lbl;
        if (MO.syncPhaseUI) MO.syncPhaseUI();
    }

    // Sequência progressiva da cidade: Estradas -> Apoio -> Acampamento -> Economia -> Ruas -> Casas -> Prédio/Ponte/Torre
    const STEPS = [
        {
            label: 'Ligando Rodovia Regional ao vale',
            delay: 1.5,
            run: () => {
                if (MO.hireSpecialist) {
                    MO.hireSpecialist('builder', { free: true, silent: true });
                    MO.hireSpecialist('lumberjack', { free: true, silent: true });
                    MO.hireSpecialist('miner', { free: true, silent: true });
                }
                const hwStartX = (MO.chunkManager && MO.chunkManager.getHighwayCenterX)
                    ? Math.round(MO.chunkManager.getHighwayCenterX(2, MO.state.seed) + 2)
                    : -14;
                buildStraightRoad(hwStartX, 2, 4, 2, 'dirt');
                focusSoft((hwStartX + 2) * 0.5, 2, 26.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: peregrinos abrindo estrada da Rodovia Regional até o vale...', '🛣️');
            }
        },
        {
            label: 'Montando base de apoio',
            delay: 1.4,
            run: () => {
                const unloadPos = findDryPosition(-4.5, 4.0);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.unloading);
                MO.cityManager.placeProductiveStructure('unloading', unloadPos);

                const mixerPos = findDryPosition(-1.0, 4.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.mixer);
                MO.cityManager.placeProductiveStructure('mixer', mixerPos);

                const wbPos = findDryPosition(2.4, 4.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.workbench);
                MO.cityManager.placeProductiveStructure('workbench', wbPos);

                const syPos = findDryPosition(-7.6, 4.6);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.stockyard);
                MO.cityManager.placeProductiveStructure('stockyard', syPos);

                focusSoft(-2.5, 3.8, 22.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: montando Baia, Masseira, Bancada e Depósito...', '🏗️');
            }
        },
        {
            label: 'Armando acampamento da equipe',
            delay: 1.4,
            run: () => {
                const messPos = findDryPosition(-6.8, -1.6);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS['mess-hall']);
                MO.cityManager.placeProductiveStructure('mess-hall', messPos);

                const tent1 = findDryPosition(-9.2, -1.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.tent);
                MO.cityManager.placeProductiveStructure('tent', tent1);

                const tent2 = findDryPosition(-9.2, -3.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.tent);
                MO.cityManager.placeProductiveStructure('tent', tent2);

                const lightPos = findDryPosition(-2.0, 0.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.floodlight);
                MO.cityManager.placeProductiveStructure('floodlight', lightPos);

                focusSoft(-6.5, -1.5, 22.5);
                if (MO.showToast) MO.showToast('🎧 Chillout: armando refeitório, barracas e iluminação...', '⛺');
            }
        },
        {
            label: 'Construindo fazenda e serraria',
            delay: 1.5,
            run: () => {
                if (MO.hireSpecialist) {
                    MO.hireSpecialist('farmer', { free: true, silent: true });
                    MO.hireSpecialist('merchant', { free: true, silent: true });
                }
                buildStraightRoad(4, 2, 4, -5, 'dirt');
                const farmPos = findDryPosition(7.8, -1.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.farm);
                MO.cityManager.placeProductiveStructure('farm', farmPos);

                const sawPos = findDryPosition(7.8, 3.8);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.lumberyard);
                MO.cityManager.placeProductiveStructure('lumberyard', sawPos);

                focusSoft(6.0, 0.8, 24.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: erguendo Fazenda e Serraria para abastecer a vila...', '🌾');
            }
        },
        {
            label: 'Abrindo avenida residencial e mercado',
            delay: 1.5,
            run: () => {
                buildStraightRoad(-4, -4, 6, -4, 'paved');
                const mktPos = findDryPosition(1.5, -1.4);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.market);
                MO.cityManager.placeProductiveStructure('market', mktPos);
                if (MO.forestryManager && !MO.forestryManager.state.woodshop.placed) {
                    const wsPos = findDryPosition(-7.2, 0.8);
                    MO.forestryManager.placeWoodshop(wsPos.x, wsPos.z, { silent: true });
                }
                if (MO.miningManager) {
                    if (!MO.miningManager.state.crusher.placed) {
                        const crPos = findDryPosition(6.8, -6.5);
                        MO.miningManager.placeCrusher(crPos.x, crPos.z, { silent: true });
                    }
                    if (!MO.miningManager.state.depot.placed) {
                        const dpPos = findDryPosition(10.5, -4.5);
                        MO.miningManager.placeDepot(dpPos.x, dpPos.z, { silent: true });
                    }
                }
                if (MO.farmingManager && MO.farmingManager.state.plots.length === 0) {
                    const fPos = findDryPosition(9.5, 1.5);
                    for (let k = 0; k < 3; k++) MO.farmingManager.expandContiguousField(fPos, { silent: true });
                    MO.farmingManager.placeWell(fPos.x - 3.0, fPos.z - 2.6, { silent: true });
                    MO.farmingManager.placeBench(fPos.x - 3.0, fPos.z + 1.8, { silent: true });
                    MO.farmingManager.placeBarn(fPos.x + 1.2, fPos.z + 4.4, { silent: true });
                }
                focusSoft(1.0, -3.2, 23.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: pavimentando avenida e abrindo o Mercado local...', '🏙️');
            }
        },
        {
            label: 'Construindo Casa #1',
            delay: 1.6,
            run: () => {
                const pos = findDryPosition(-3.2, -7.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS['house-auto']);
                MO.cityManager.placeDynamicConstruction('house-auto', pos);
                focusSoft(pos.x, pos.z, 19.5);
                if (MO.showToast) MO.showToast('🎧 Chillout: construindo a primeira residência do bairro!', '🏠');
            }
        },
        {
            label: 'Construindo Casa #2',
            delay: 1.8,
            run: () => {
                const pos = findDryPosition(3.2, -7.2);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS['house-auto']);
                MO.cityManager.placeDynamicConstruction('house-auto', pos);
                focusSoft(pos.x, pos.z, 19.5);
                if (MO.showToast) MO.showToast('🎧 Chillout: erguendo a segunda casa na avenida!', '🏡');
            }
        },
        {
            label: 'Construindo Edifício Urbano',
            delay: 2.0,
            run: () => {
                buildStraightRoad(-4, -4, -10, -4, 'paved');
                const pos = findDryPosition(-9.2, -7.8);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.building);
                MO.cityManager.placeDynamicConstruction('building', pos);
                focusSoft(pos.x, pos.z, 22.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: construindo o primeiro edifício multi-andar!', '🏢');
            }
        },
        {
            label: 'Construindo Ponte sobre o Rio',
            delay: 2.0,
            run: () => {
                const rx = MO.getRiverCenterX ? MO.getRiverCenterX(-4) : 20;
                buildStraightRoad(6, -4, Math.round(rx - 4), -4, 'dirt');
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.bridge);
                MO.cityManager.placeDynamicConstruction('bridge', { x: rx, z: -4 });
                focusSoft(rx, -4, 24.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: erguendo ponte sobre o rio para expandir a cidade!', '🌉');
            }
        },
        {
            label: 'Construindo Torre Mirante',
            delay: 2.0,
            run: () => {
                const pos = findDryPosition(9.5, -8.5);
                ensureResourcesForCost(MO.cityManager.BUILD_COSTS.tower);
                MO.cityManager.placeDynamicConstruction('tower', pos);
                focusSoft(pos.x, pos.z, 23.0);
                if (MO.showToast) MO.showToast('🎧 Chillout: construindo a Torre Mirante da cidade!', '🗼');
            }
        }
    ];

    function runInfiniteExpansionStep() {
        expansionCount++;
        const ring = Math.floor((expansionCount - 1) / 4) + 1;
        const slot = (expansionCount - 1) % 4;
        const offsets = [
            { x: -10 - ring * 6.5, z: -13 - ring * 2.0 },
            { x: 0, z: -13 - ring * 6.0 },
            { x: 10 + ring * 5.0, z: -13 - ring * 2.0 },
            { x: -8 - ring * 5.5, z: 9 + ring * 4.5 }
        ];
        const base = offsets[slot];
        const pos = findDryPosition(base.x, base.z, 10);
        const kind = (expansionCount % 4 === 0) ? 'building' : 'house-auto';
        buildStraightRoad(Math.round(pos.x - 4), Math.round(pos.z + 3), Math.round(pos.x + 4), Math.round(pos.z + 3), 'paved');
        ensureResourcesForCost(MO.cityManager.BUILD_COSTS[kind]);
        MO.cityManager.placeDynamicConstruction(kind, pos);
        setStageLabel(kind === 'building' ? `Expandindo · Prédio #${expansionCount}` : `Expandindo · Casa #${expansionCount + 2}`);
        focusSoft(pos.x, pos.z, 22.0);
    }

    function startChilloutGame(opts = {}) {
        stageIndex = 0;
        stageCooldown = 1.2;
        expansionCount = 0;
        const res = MO.cityManager.startCityGame({
            supervisorName: opts.supervisorName || 'Supervisor Beto',
            seed: opts.seed !== undefined ? opts.seed : MO.state.seed,
            biome: opts.biome || 'forest',
            sandboxMode: Boolean(opts.sandboxMode),
            skipSave: Boolean(opts.skipSave)
        });
        if (MO.state && MO.state.city) {
            MO.state.city.chilloutMode = true;
            MO.state.city.chilloutStage = 'Preparando expedição';
        }
        MO.state.cinemaTour = false;
        setStageLabel('Preparando expedição');
        if (MO.showToast) {
            MO.showToast('🎧 Modo Chillout iniciado! Relaxe enquanto a cidade cresce das estradas às casas.', '🎧');
        }
        return res;
    }

    function stopChilloutMode() {
        if (MO.state && MO.state.city) {
            MO.state.city.chilloutMode = false;
            MO.state.city.chilloutStage = '';
        }
        currentLabel = 'Inativo';
        if (MO.syncPhaseUI) MO.syncPhaseUI();
    }

    function toggleChilloutMode(forceVal) {
        const cur = Boolean(MO.state && MO.state.city && MO.state.city.chilloutMode);
        const next = (typeof forceVal === 'boolean') ? forceVal : !cur;
        if (next) {
            if (MO.state && MO.state.city) {
                MO.state.city.chilloutMode = true;
                setStageLabel(STEPS[stageIndex] ? STEPS[stageIndex].label : 'Expandindo cidade');
            }
            stageCooldown = Math.min(stageCooldown, 1.0);
            if (MO.showToast) MO.showToast('🎧 Modo Chillout ATIVO: construção automática progressiva retomada!', '🎧');
        } else {
            stopChilloutMode();
            if (MO.showToast) MO.showToast('🎧 Modo Chillout pausado. Controle manual liberado.', '📐');
        }
        return next;
    }

    function update(dt) {
        const state = MO.state;
        if (!state || !state.cityMode || !state.city || !state.city.chilloutMode) return false;

        // Se ainda há obras/estradas/estruturas em andamento, aguarda a equipe concluir
        if (isBusyWithWork()) {
            stageCooldown = Math.max(stageCooldown, 0.8);
            return false;
        }

        stageCooldown -= dt;
        if (stageCooldown > 0) return false;

        if (stageIndex < STEPS.length) {
            const step = STEPS[stageIndex];
            stageIndex++;
            setStageLabel(step.label);
            step.run();
            stageCooldown = step.delay || 1.5;
            return true;
        }

        runInfiniteExpansionStep();
        stageCooldown = 2.2;
        return true;
    }

    function getState() {
        return {
            active: Boolean(MO.state && MO.state.city && MO.state.city.chilloutMode),
            stageIndex,
            totalPlannedSteps: STEPS.length,
            label: currentLabel,
            expansionCount
        };
    }

    MO.chilloutManager = {
        STEPS,
        startChilloutGame,
        stopChilloutMode,
        toggleChilloutMode,
        update,
        getState
    };
})(window.MO = window.MO || {});

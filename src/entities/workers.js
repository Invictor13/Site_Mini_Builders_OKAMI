// =========================================================================
// ENTITIES: ORQUESTRADOR DOS TRABALHADORES, REGENERAÇÃO & MODO RELAX
// =========================================================================
(function(MO) {
    MO.hireSupervisor = function(options) {
        return MO.workerFactory.hireSupervisor(options);
    };

    MO.hireHelper = function(options) {
        return MO.workerFactory.hireHelper(options);
    };

    MO.hireCrew = function(helperCount, includeSupervisor) {
        return MO.workerFactory.hireCrew(helperCount, includeSupervisor);
    };

    MO.hireSpecialist = function(profId, options) {
        return MO.workerFactory.hireSpecialist(profId, options);
    };

    MO.hireMiniWorker = function(options) {
        const opts = (options && typeof options === 'object' && typeof options.preventDefault !== 'function')
            ? options
            : {};
        return MO.workerFactory.hireHelper(opts);
    };

    MO.cycleSimSpeed = function() {
        const speeds = [1, 2, 4];
        const cur = (MO.simClock && MO.simClock.timeScale) ? MO.simClock.timeScale : 1;
        const next = speeds[(speeds.indexOf(cur) + 1) % speeds.length];
        if (MO.simClock) MO.simClock.timeScale = next;
        const lbl = document.getElementById('speed-btn-label');
        if (lbl) lbl.textContent = `${next}x`;
        if (MO.showToast) MO.showToast(`⏱️ Velocidade da simulação: ${next}x`, '⚡');
        return next;
    };

    MO.focusVillageRegion = function(target) {
        document.querySelectorAll('[data-region-focus]').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-region-focus') === target);
        });
        if (target === 'overview') {
            if (MO.focusCameraOn) MO.focusCameraOn(0, -0.5, 31.0);
            if (MO.showToast) MO.showToast('🗺️ Visão panorâmica da Vila OKAMI', '🧭');
            return;
        }
        const lots = MO.regionManager ? MO.regionManager.getLotsForRegion('main-valley') : [];
        const matchLot = lots.find(l => (l.allowedModes || []).includes(target) && l.status === 'active')
            || lots.find(l => (l.allowedModes || []).includes(target) && l.status === 'completed')
            || lots.find(l => (l.allowedModes || []).includes(target));
        if (matchLot && MO.focusCameraOn) {
            const lx = matchLot.originX !== undefined ? matchLot.originX : (matchLot.x || 0);
            const lz = matchLot.originZ !== undefined ? matchLot.originZ : (matchLot.z || 0);
            MO.focusCameraOn(lx, lz, 17.5);
            if (MO.showToast) MO.showToast(`📍 Foco da câmera: ${matchLot.label}`, '🎥');
        } else if (MO.focusCameraOn) {
            MO.focusCameraOn(0, -0.5, 22.0);
        }
    };

    MO.updateWorkers = function(dt, t) {
        const state = MO.state;
        const isDarkSite = state.isNight && !MO.areFloodlightsReady();
        const isHotBiome = state.biome === 'cerrado' || state.biome === 'coast';
        const context = { state, isDarkSite, isHotBiome };

        state.workers.forEach(w => {
            MO.workerAgent.update(w, dt, t, context);
        });
    };

    MO.advanceToNextVillageLot = function() {
        const state = MO.state;
        if (!MO.worldManager) return false;
        if (!state.unifiedVillage && state.mode !== 'house') return false;
        const prevLot = MO.regionManager ? MO.regionManager.getActiveLot() : null;
        const { archived, nextLot } = MO.worldManager.archiveAndAdvanceToNextLot();

        // Libera tarefas atuais dos trabalhadores sem removê-los do mundo
        state.workers.forEach(w => {
            if (w.task) {
                MO.workerTasks.releaseTaskReservations(w.task);
                w.task = null;
            }
            MO.workerNeeds.releaseCampReservations(w);
            MO.workerFactory.setWorkerTool(w.rig, 'none');
            w.rig.torsoPivot.rotation.x = 0;
            w.rig.setBadge('');
            w.waypoints = [];
            w.timer = 0;
            w.subTimer = 0;
            w.statusText = nextLot ? `Indo para ${nextLot.label}` : 'Vila concluída';
        });

        MO.resources.clearGroup(MO.groups.looseRebars);
        MO.resources.clearGroup(MO.groups.looseBricks);
        state.looseRebars = [];
        state.looseBricks = [];
        state.selectedBrickInHand = null;
        state.animatedBricks = [];
        state.leakPoints = [];
        state.screensaverCompletedTime = 0;

        MO.toggleXRayMode(false);
        if (MO.resetStructuralState) MO.resetStructuralState();

        if (!nextLot) {
            state.villageCompleted = true;
            state.weeds = [];
            state.levelTargets = [];
            MO.resources.clearGroup(MO.groups.weeds);
            MO.worldManager.renderLotMarkers();
            MO.worldManager.saveToStorage();
            if (MO.updateVillageUI) MO.updateVillageUI();
            MO.syncPhaseUI();
            const totalDone = MO.constructionManager ? MO.constructionManager.getCompletedConstructions().length : 5;
            MO.showToast(`🏆 Vila concluída! ${totalDone} construções preservadas no mundo!`, '🏘️');
            return false;
        }

        const nextMode = (nextLot.allowedModes && nextLot.allowedModes[0]) ? nextLot.allowedModes[0] : 'house';
        state.mode = nextMode;
        if (MO.modes[nextMode] && MO.modes[nextMode].onInit) MO.modes[nextMode].onInit();

        state.villageCompleted = false;
        MO.populateBuildableLotWeeds();
        if (state.villageInfra && state.villageInfra.roadBuilt && state.villageInfra.unloadingBuilt) {
            MO.restockSupplies(true);
            if (MO.spawnBeamRack) MO.spawnBeamRack(true);
            if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck(nextMode === 'bridge' ? 'beams' : 'bricks');
        }
        MO.worldManager.renderLotMarkers();
        MO.worldManager.saveToStorage();
        MO.syncPhaseUI();
        if (MO.updateVillageUI) MO.updateVillageUI();
        if (MO.focusCameraOn && state.screensaver) {
            const nx = nextLot.originX !== undefined ? nextLot.originX : (nextLot.x || 0);
            const nz = nextLot.originZ !== undefined ? nextLot.originZ : (nextLot.z || 0);
            MO.focusCameraOn(nx, nz, 19.5);
        }

        const fromLbl = prevLot ? prevLot.label : (archived ? archived.lotId : 'Obra');
        MO.showToast(`🏘️ ${fromLbl} preservada! Equipe iniciando ${nextLot.label}.`, '✨');
        return true;
    };

    MO.togglePersistentVillage = function(forceVal) {
        if (!MO.worldManager) return false;
        const nextVal = (typeof forceVal === 'boolean') ? forceVal : !MO.worldManager.meta.persistentGrowth;
        MO.worldManager.meta.persistentGrowth = nextVal;
        if (MO.updateVillageUI) MO.updateVillageUI();
        MO.worldManager.renderLotMarkers();
        if (MO.state.mode === 'house' && MO.state.phase <= 1) {
            MO.updateTerrainGridLines();
        }
        MO.showToast(
            nextVal ? '🏘️ Vila Contínua ATIVA: casas concluídas permanecem no cenário!' : '🔄 Modo Diorama Único: reinicia terreno ao concluir.',
            nextVal ? '🏘️' : '🔄'
        );
        return nextVal;
    };

    MO.regenerateNewTerrain = function(targetMode, forcedBiome) {
        const state = MO.state;
        if (targetMode && MO.modes[targetMode]) {
            state.mode = targetMode;
        }
        state.seed = Math.floor(1000 + Math.random() * 8999);
        state.villageCompleted = false;
        if (MO.worldManager && MO.worldManager.clearSavedWorld) {
            MO.worldManager.clearSavedWorld();
        }

        const nextBiome = forcedBiome || MO.BIOME_ORDER[state.seed % MO.BIOME_ORDER.length];
        if (MO.applyBiomeStyle) MO.applyBiomeStyle(nextBiome);
        if (MO.setWeather) MO.setWeather('clear');
        if (MO.resetStructuralState) MO.resetStructuralState();

        if (MO.levelMap) MO.levelMap.fill(0);
        if (MO.roadMap) MO.roadMap.fill(0);
        state.phase = 0;
        state.sand = 0; state.cement = 0; state.water = 0; state.mortarCharges = 0; state.bucketCharges = 0;
        state.looseRebars = []; state.looseBeams = []; state.looseBricks = []; state.workers = [];
        state.site.tracks = []; state.site.ripples = [];
        state.site.truckActive = false;
        state.site.truckQueue = [];
        state.screensaverCompletedTime = 0;
        if (state.villageInfra) {
            state.villageInfra.demarcated = false;
            state.villageInfra.roadBuilt = false;
            state.villageInfra.unloadingBuilt = false;
            state.villageInfra.mixerBuilt = false;
            state.villageInfra.workbenchBuilt = false;
            state.villageInfra.yardsBuilt = false;
            state.villageInfra.unloadingRes = false;
            state.villageInfra.mixerRes = false;
            state.villageInfra.workbenchRes = false;
            state.villageInfra.yardsRes = false;
            state.villageInfra.bridgeUnlocked = false;
            state.villageInfra.eastRoadDemarcated = false;
            state.villageInfra.eastRoadBuilt = false;
            state.villageInfra.roadSegments = [];
        }
        if (state.workbench) {
            state.workbench.rawWood = 0;
            state.workbench.cutWood = 0;
            state.workbench.busyWorkerId = null;
        }
        if (state.city) {
            if (state.city.roadTiles && state.city.roadTiles.clear) state.city.roadTiles.clear();
            state.city.structures = [];
            state.city.activeBuildTool = null;
        }
        MO.resetBucketRef();

        [
            MO.groups.blueprint, MO.groups.foundation, MO.groups.looseRebars, MO.groups.walls,
            MO.groups.muroStair, MO.groups.looseBricks, MO.groups.floor, MO.groups.mep,
            MO.groups.roof, MO.groups.bridge, MO.groups.building, MO.groups.tower,
            MO.groups.camp, MO.groups.workers, MO.groups.fx, MO.groups.physicsSupplies, MO.groups.weeds,
            MO.groups.demarcation, MO.groups.cityInfra, MO.groups.cityNodes
        ].forEach(g => { if (g) MO.resources.clearGroup(g); });
        state.draggableSupplies = [];

        MO.toggleXRayMode(false);
        MO.createProceduralTerrainMesh();
        MO.populateNatureAndSplats();
        if (MO.worldManager && MO.worldManager.onWorldRegenerated) {
            MO.worldManager.onWorldRegenerated();
            if (targetMode && MO.regionManager && MO.regionManager.getLotsForRegion) {
                const lots = MO.regionManager.getLotsForRegion('main-valley');
                const matchLot = lots.find(l => (l.allowedModes || []).includes(targetMode));
                if (matchLot) MO.regionManager.setActiveLot(matchLot.id);
                MO.worldManager.renderLotMarkers();
            }
        }
        MO.populateBuildableLotWeeds();
        if (MO.initToolbox) MO.initToolbox();
        MO.placeMixerStationOnTerrain();
        if (MO.setMixerBuilt) MO.setMixerBuilt(false);
        if (MO.initWorkbench) MO.initWorkbench();
        MO.restockSupplies(true);
        if (MO.rebuildSiteProps) MO.rebuildSiteProps();
        if (MO.rebuildCamp) MO.rebuildCamp();

        const modePlugin = MO.modes[state.mode];
        if (modePlugin && modePlugin.onInit) modePlugin.onInit();
        if (MO.regionManager) MO.regionManager.refreshActiveLotMask && MO.regionManager.refreshActiveLotMask();
        if (state.mode === 'house') {
            MO.updateTerrainGridLines();
        }
        if (MO.updateVillageUI) MO.updateVillageUI();
        if (MO.workerFactory && MO.workerFactory.syncNpcUI) MO.workerFactory.syncNpcUI();
        if (MO.renderNpcRosterUI) MO.renderNpcRosterUI();
        MO.syncPhaseUI();

        if (state.screensaver && MO.workerFactory) {
            MO.workerFactory.hireCrew(4, true);
        }

        const modeNames = {
            house: 'Vila Viva · Residencial',
            bridge: 'Ponte sobre o Rio',
            building: 'Edifício Multi-Andar',
            tower: 'Torre Treliçada'
        };
        const biomeLabel = (MO.BIOMES && MO.BIOMES[state.biome]) ? MO.BIOMES[state.biome].label : state.biome;
        if (MO.focusCameraOn) MO.focusCameraOn(0, -0.5, 29.0);
        MO.showToast(`Nova Semente de Vila #${state.seed} · Bioma ${biomeLabel} · Início Zero (Caixa de Ferramentas)`, '🧰');
    };

    MO.cycleBiomeManual = function() {
        const next = MO.BIOME_ORDER[(MO.BIOME_ORDER.indexOf(MO.state.biome) + 1) % MO.BIOME_ORDER.length];
        MO.regenerateNewTerrain(MO.state.mode, next);
    };

    MO.switchMode = function(modeId) {
        if (!MO.modes[modeId]) return;
        MO.regenerateNewTerrain(modeId);
    };

    MO.toggleScreensaverMode = function(forceVal) {
        const state = MO.state;
        state.screensaver = (typeof forceVal === 'boolean') ? forceVal : !state.screensaver;
        const btn = document.getElementById('btn-screensaver');
        const lbl = document.getElementById('screensaver-btn-label');
        if (btn) btn.classList.toggle('active', state.screensaver);
        if (lbl) lbl.textContent = state.screensaver ? 'Relax: ON ✨' : 'Modo Relax';

        if (state.screensaver) {
            if (MO.workerFactory) {
                const counts = MO.workerFactory.getNpcCounts();
                if (counts.supervisors < 1) MO.hireSupervisor();
                while (MO.workerFactory.getNpcCounts().helpers < 4) MO.hireHelper();
            }
            MO.showToast('🌙 Modo Relax Ativo! Supervisor demarcando o mapa e equipe construindo a vila.', '✨');
        } else {
            MO.showToast('Modo Relax pausado. Controle manual ativo.', '📐');
        }
    };

    MO.toggleCinemaTour = function(forceVal) {
        const state = MO.state;
        state.cinemaTour = (typeof forceVal === 'boolean') ? forceVal : !state.cinemaTour;
        state.cinemaTimer = 0;
        const btn = document.getElementById('btn-cinema-tour');
        if (btn) btn.classList.toggle('active', state.cinemaTour);
        if (MO.showToast) {
            MO.showToast(
                state.cinemaTour
                    ? '🎥 Tour Contemplativo ativo: câmera passeando suavemente pela vila!'
                    : '🎥 Tour pausado. Câmera livre ativa.',
                '🎥'
            );
        }
        return state.cinemaTour;
    };

    MO.updateScreensaverCamera = function(dt, t) {
        const state = MO.state;
        if ((!state.screensaver && !state.cinemaTour) || MO.camOrbit.isDragging) return;
        MO.camOrbit.theta += dt * (state.cinemaTour ? 0.11 : 0.14);
        MO.camOrbit.phi = 0.84 + Math.sin(t * 0.22) * 0.08;

        if (state.cinemaTour && MO.regionManager && MO.focusCameraOn) {
            state.cinemaTimer = (state.cinemaTimer || 0) + dt;
            if (state.cinemaTimer >= 10.0) {
                state.cinemaTimer = 0;
                const lots = MO.regionManager.getLotsForRegion('main-valley').filter(l => l.status !== 'available' || l.status === 'active');
                const spots = [{ originX: 0, originZ: -0.5, radius: 30.0 }].concat(lots);
                state.cinemaIdx = ((state.cinemaIdx || 0) + 1) % spots.length;
                const pick = spots[state.cinemaIdx];
                MO.focusCameraOn(pick.originX || 0, pick.originZ || 0, pick.radius || 18.0);
            }
        }
    };

    MO.updateCityConstructionAutomation = function(dt, t) {
        const state = MO.state;
        if (!state.cityMode || state.screensaver) return;
        const activeConstr = MO.constructionManager && MO.constructionManager.getActiveConstruction
            ? MO.constructionManager.getActiveConstruction()
            : null;
        if (!activeConstr) {
            state.cityCompletedTime = 0;
            return;
        }
        const modePlugin = MO.modes[state.mode];
        const finished = modePlugin && modePlugin.updateAutopilot ? modePlugin.updateAutopilot(dt, t) : false;
        if (finished) {
            if (!state.cityCompletedTime) {
                state.cityCompletedTime = t;
            } else if (t - state.cityCompletedTime > 1.6) {
                state.cityCompletedTime = 0;
                if (MO.worldManager && MO.worldManager.archiveAndAdvanceToNextLot) {
                    MO.worldManager.archiveAndAdvanceToNextLot(state.mode);
                }
                if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
                if (MO.syncPhaseUI) MO.syncPhaseUI();
            }
        }
    };

    MO.updateScreensaverAutopilot = function(dt, t) {
        const state = MO.state;
        if (!state.screensaver) return;

        if (MO.workerFactory) {
            const counts = MO.workerFactory.getNpcCounts();
            if (counts.supervisors < 1) MO.hireSupervisor();
            while (MO.workerFactory.getNpcCounts().helpers < 4) MO.hireHelper();
        }

        if (state.villageCompleted) {
            return;
        }

        const modePlugin = MO.modes[state.mode];
        const finished = modePlugin && modePlugin.updateAutopilot ? modePlugin.updateAutopilot(dt, t) : false;

        if (finished) {
            const persistentVillage = (state.unifiedVillage || state.mode === 'house') && MO.worldManager && MO.worldManager.meta.persistentGrowth;
            const waitSecs = persistentVillage ? 3.5 : 7.5;
            if (state.screensaverCompletedTime === 0) {
                state.screensaverCompletedTime = t;
                MO.showToast(
                    persistentVillage
                        ? '🏡 Obra concluída e preservada na vila! Preparando próximo lote...'
                        : '🏆 Obra concluída pela equipe! Apreciando o resultado antes do próximo contrato...',
                    '🌟'
                );
            } else if (t - state.screensaverCompletedTime > waitSecs) {
                state.screensaverCompletedTime = 0;
                if (persistentVillage) {
                    MO.advanceToNextVillageLot();
                    return;
                }
                let nextMode = state.mode;
                if (state.playlist) {
                    const idx = MO.MODE_ORDER.indexOf(state.mode);
                    nextMode = MO.MODE_ORDER[(idx + 1) % MO.MODE_ORDER.length];
                }
                MO.regenerateNewTerrain(nextMode);
            }
        }
    };
})(window.MO = window.MO || {});

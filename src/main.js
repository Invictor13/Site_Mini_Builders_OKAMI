// =========================================================================
// MAIN ENTRY POINT: ORQUESTRADOR MULTI-MODOS, ATMOSFERA E FÍSICA
// =========================================================================
(function(MO) {
    // Expõe callbacks globais para os botões da UI HTML (funciona direto via file://)
    Object.assign(window, {
        selectTool: MO.selectTool,
        switchMode: MO.switchMode,
        toggleZenMode: MO.toggleZenMode,
        togglePlaylistMode: MO.togglePlaylistMode,
        toggleAudioMute: MO.toggleAudioMute,
        toggleAmbientMute: MO.toggleAmbientMute,
        toggleDayNightStep: MO.toggleDayNightStep,
        toggleRiskProfile: MO.toggleRiskProfile,
        toggleCampNightMode: MO.toggleCampNightMode,
        cycleWeatherManual: MO.cycleWeatherManual,
        cycleBiomeManual: MO.cycleBiomeManual,
        advanceToPhase1: MO.advanceToPhase1,
        advanceToPhase2: MO.advanceToPhase2,
        advanceToPhase3: MO.advanceToPhase3,
        advanceToPhase4: MO.advanceToPhase4,
        advanceToPhase5: MO.advanceToPhase5,
        loadPresetHouse: MO.loadPresetHouse,
        spawnFallingRebars: MO.spawnFallingRebars,
        restockSupplies: MO.restockSupplies,
        setBrickType: MO.setBrickType,
        spawnBrickPallet: MO.spawnBrickPallet,
        toggleXRayMode: MO.toggleXRayMode,
        testElectricalSystem: MO.testElectricalSystem,
        testPlumbingSystem: MO.testPlumbingSystem,
        setPaintColor: MO.setPaintColor,
        hireMiniWorker: MO.hireMiniWorker,
        hireSupervisor: MO.hireSupervisor,
        hireHelper: MO.hireHelper,
        hireSpecialist: MO.hireSpecialist,
        hireCrew: MO.hireCrew,
        setCityBuildTool: MO.setCityBuildTool,
        toggleSandboxMode: MO.toggleSandboxMode,
        toggleCityPalette: MO.toggleCityPalette,
        toggleCityCategory: MO.toggleCityCategory,
        clearCitySelection: MO.clearCitySelection,
        toggleOptionsPanel: MO.toggleOptionsPanel,
        togglePhonePanel: MO.togglePhonePanel,
        callTruckFromPhone: MO.callTruckFromPhone,
        sellSurplusViaPhone: MO.sellSurplusViaPhone,
        openCitySetupModal: MO.openCitySetupModal,
        showTitleView: MO.showTitleView,
        selectSetupGameMode: MO.selectSetupGameMode,
        continueCityFromMenu: MO.continueCityFromMenu,
        startCityFromMenu: MO.startCityFromMenu,
        toggleNpcPanel: MO.toggleNpcPanel,
        renderNpcRosterUI: MO.renderNpcRosterUI,
        focusVillageRegion: MO.focusVillageRegion,
        cycleSimSpeed: MO.cycleSimSpeed,
        toggleCinemaTour: MO.toggleCinemaTour,
        regenerateNewTerrain: MO.regenerateNewTerrain,
        toggleScreensaverMode: MO.toggleScreensaverMode,
        togglePersistentVillage: MO.togglePersistentVillage,
        advanceToNextVillageLot: MO.advanceToNextVillageLot,
        toggleDiagnostics: () => MO.diagnostics && MO.diagnostics.toggle(),
        // Ponte
        advanceBridgePhase2: MO.advanceBridgePhase2,
        advanceBridgePhase3: MO.advanceBridgePhase3,
        runBridgeLoadTest: MO.runBridgeLoadTest,
        // Prédio
        setBuildingFloorCut: MO.setBuildingFloorCut,
        advanceBuildingPhase2: MO.advanceBuildingPhase2,
        advanceBuildingPhase3: MO.advanceBuildingPhase3,
        finishBuildingRoof: MO.finishBuildingRoof,
        // Torre
        advanceTowerPhase2: MO.advanceTowerPhase2,
        advanceTowerPhase3: MO.advanceTowerPhase3,
        runTowerWindTest: MO.runTowerWindTest,
        installTowerTop: MO.installTowerTop
    });

    function updatePhysics() {
        const state = MO.state;
        const draggingRef = state.draggedItem ? state.draggedItem.ref : null;

        state.looseRebars.forEach(r => {
            if (r.installed || r === draggingRef) return;
            if (!r.grounded) {
                r.vy -= 0.014;
                r.mesh.position.y += r.vy;
                const floorY = MO.getTerrainHeight(r.mesh.position.x, r.mesh.position.z) + 0.14;
                if (r.mesh.position.y <= floorY) {
                    r.mesh.position.y = floorY;
                    if (Math.abs(r.vy) > 0.05) r.vy = -r.vy * 0.28;
                    else { r.vy = 0; r.grounded = true; }
                }
            }
        });

        state.draggableSupplies.forEach(s => {
            if (s.consumed || s === draggingRef) return;
            if (!s.grounded) {
                s.vy -= 0.015;
                s.mesh.position.y += s.vy;
                const floorY = MO.getTerrainHeight(s.mesh.position.x, s.mesh.position.z) + 0.02;
                if (s.mesh.position.y <= floorY) {
                    s.mesh.position.y = floorY;
                    if (Math.abs(s.vy) > 0.04) s.vy = -s.vy * 0.22;
                    else { s.vy = 0; s.grounded = true; }
                }
            }
        });

        state.looseBricks.forEach(b => {
            if (b.placed || b === draggingRef) return;
            if (!b.grounded) {
                b.vy -= 0.015;
                b.mesh.position.y += b.vy;
                const floorY = MO.getTerrainHeight(b.mesh.position.x, b.mesh.position.z) + 0.16;
                if (b.mesh.position.y <= floorY) {
                    b.mesh.position.y = floorY;
                    if (Math.abs(b.vy) > 0.04) b.vy = -b.vy * 0.18;
                    else { b.vy = 0; b.grounded = true; }
                }
            }
        });

        for (let i = state.animatedBricks.length - 1; i >= 0; i--) {
            const ab = state.animatedBricks[i];
            ab.progress += 0.13;
            if (ab.progress >= 1) {
                ab.mesh.position.y = ab.targetY;
                state.animatedBricks.splice(i, 1);
            } else {
                const ease = 1 - Math.pow(1 - ab.progress, 3);
                ab.mesh.position.y = ab.targetY + (1 - ease) * 0.5;
            }
        }

        if (state.leakPoints.length > 0 && Math.random() < 0.45) {
            state.leakPoints.forEach(lp => MO.spawnBurst(lp.x, lp.y, lp.z, 0x38bdf8, 2, 0.05));
        }

        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life -= 0.042;
            p.vy -= 0.0038;
            p.mesh.position.x += p.vx;
            p.mesh.position.y += p.vy;
            p.mesh.position.z += p.vz;
            p.mesh.scale.setScalar(Math.max(0.01, p.life));
            if (p.life <= 0) {
                MO.resources.removeAndDispose(MO.groups.fx, p.mesh);
                state.particles.splice(i, 1);
            }
        }
    }

    function lerpAngle(a, b, alpha) {
        const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
        return a + diff * alpha;
    }

    function restoreWorkerLogicalTransforms() {
        const workers = MO.state.workers;
        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            if (!w || !w._visApplied || !w.rig || !w.rig.group) continue;
            w.rig.group.position.set(w._currX, w._currY, w._currZ);
            w.rig.group.rotation.y = w._currYaw;
            w._visApplied = false;
        }
    }

    function captureWorkerPrevTransforms() {
        const workers = MO.state.workers;
        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            if (!w || !w.rig || !w.rig.group) continue;
            const pos = w.rig.group.position;
            w._prevX = pos.x;
            w._prevY = pos.y;
            w._prevZ = pos.z;
            w._prevYaw = w.rig.group.rotation.y;
        }
    }

    function captureWorkerCurrTransforms() {
        const workers = MO.state.workers;
        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            if (!w || !w.rig || !w.rig.group) continue;
            const pos = w.rig.group.position;
            w._currX = pos.x;
            w._currY = pos.y;
            w._currZ = pos.z;
            w._currYaw = w.rig.group.rotation.y;
            if (w._prevX === undefined) {
                w._prevX = w._currX;
                w._prevY = w._currY;
                w._prevZ = w._currZ;
                w._prevYaw = w._currYaw;
            }
        }
    }

    function applyWorkerVisualInterpolation(alpha) {
        const workers = MO.state.workers;
        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            if (!w || !w.rig || !w.rig.group || w._currX === undefined || w._prevX === undefined) continue;
            if (Math.hypot(w._currX - w._prevX, w._currZ - w._prevZ) >= 1.5) continue;
            w.rig.group.position.set(
                w._prevX + (w._currX - w._prevX) * alpha,
                w._prevY + (w._currY - w._prevY) * alpha,
                w._prevZ + (w._currZ - w._prevZ) * alpha
            );
            w.rig.group.rotation.y = lerpAngle(w._prevYaw, w._currYaw, alpha);
            w._visApplied = true;
        }
    }

    function stepSimulation(fixedDt, simTime) {
        updatePhysics();
        MO.updateWorkers(fixedDt, simTime);
        MO.updateAtmosphere(fixedDt, simTime);
        MO.updateSkyAndWeather(fixedDt, simTime);
        MO.updateRandomEvents(fixedDt);
        if (MO.updateMicroEvents) MO.updateMicroEvents(fixedDt, simTime);
        MO.updateCollapseDebris(fixedDt);
        MO.updateSiteLogistics(fixedDt);
        if (MO.updateCamp) MO.updateCamp(fixedDt, simTime);
        if (MO.updateWaterAndGroundFX) MO.updateWaterAndGroundFX(fixedDt, simTime);
        MO.updateAmbientSoundscape(fixedDt);

        const activeMode = MO.modes[MO.state.mode];
        if (activeMode && activeMode.updateSimulation) {
            activeMode.updateSimulation(fixedDt, simTime);
        }
        if (MO.updateCityConstructionAutomation) {
            MO.updateCityConstructionAutomation(fixedDt, simTime);
        }
        MO.updateScreensaverAutopilot(fixedDt, simTime);
    }

    function renderVisuals(frameDt, visualTime, alpha) {
        applyWorkerVisualInterpolation(alpha);

        const camDt = Math.min(MO.simClock.maxFrameDt, Math.max(0, frameDt));
        if (MO.updateCameraPan) {
            MO.updateCameraPan(camDt);
        }
        if (MO.updateScreensaverCamera) {
            MO.updateScreensaverCamera(camDt, visualTime);
        }
        if (MO.state.infiniteWorld && MO.chunkManager && MO.camOrbit && MO.camOrbit.target) {
            MO.chunkManager.updateAround(MO.camOrbit.target.x, MO.camOrbit.target.z);
        }

        if (MO.waterTex) {
            MO.waterTex.offset.x = Math.sin(visualTime * 0.25) * 0.06;
            MO.waterTex.offset.y = visualTime * 0.025;
        }
        if (MO.mixer && MO.mixer.mixerBarGroup && MO.mixer.mixerBarGroup.visible) {
            MO.mixer.mixerBarGroup.lookAt(MO.camera.position);
        }

        const camOrbit = MO.camOrbit;
        if (MO.state.cityMode && MO.state.city && !MO.state.city.setupConfirmed && !camOrbit.isDragging) {
            camOrbit.theta += camDt * 0.065;
        }
        if (camOrbit.targetGoal && !camOrbit.isDragging) {
            const lerpF = Math.min(1, camDt * 4.5);
            camOrbit.target.x += (camOrbit.targetGoal.x - camOrbit.target.x) * lerpF;
            camOrbit.target.y += (camOrbit.targetGoal.y - camOrbit.target.y) * lerpF;
            camOrbit.target.z += (camOrbit.targetGoal.z - camOrbit.target.z) * lerpF;
            if (camOrbit.targetRadius !== undefined) {
                camOrbit.radius += (camOrbit.targetRadius - camOrbit.radius) * lerpF;
            }
        }
        MO.camera.position.x = camOrbit.target.x + camOrbit.radius * Math.sin(camOrbit.phi) * Math.sin(camOrbit.theta);
        MO.camera.position.y = camOrbit.target.y + camOrbit.radius * Math.cos(camOrbit.phi);
        MO.camera.position.z = camOrbit.target.z + camOrbit.radius * Math.sin(camOrbit.phi) * Math.cos(camOrbit.theta);
        MO.camera.lookAt(camOrbit.target);

        if (MO.renderer) MO.renderer.render(MO.scene, MO.camera);
    }

    MO.stepFrame = function(frameDtSeconds) {
        const validDt = (typeof frameDtSeconds === 'number' && Number.isFinite(frameDtSeconds) && frameDtSeconds > 0)
            ? frameDtSeconds
            : 0;

        restoreWorkerLogicalTransforms();
        const steps = MO.simClock.advance(validDt, (fixedDt, simTime) => {
            captureWorkerPrevTransforms();
            stepSimulation(fixedDt, simTime);
            captureWorkerCurrTransforms();
        });
        renderVisuals(validDt, MO.simClock.visualTime, MO.simClock.alpha);
        if (MO.diagnostics) MO.diagnostics.recordFrame(validDt, steps);
        return steps;
    };

    let lastTime = performance.now();
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) lastTime = performance.now();
        });
    }

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const frameDt = Math.max(0, (now - lastTime) / 1000);
        lastTime = now;
        MO.stepFrame(frameDt);
    }

    function initApp() {
        const container = document.getElementById('canvas-container');
        MO.initRenderer(container);
        MO.initInputControls();
        MO.initSkyAndWeather();
        MO.initEventsAndCollapse();
        MO.initSiteLogistics();

        MO.applyBiomeStyle(MO.state.biome);
        MO.createDioramaBase();
        MO.createProceduralTerrainMesh();
        MO.populateNatureAndSplats();
        if (MO.state.cityMode && MO.state.city && MO.state.city.playerDriven) {
            MO.STATION_TOOLBOX = { x: -2.2, z: 2.0 };
            if (MO.chunkManager) MO.chunkManager.init();
            if (MO.regionManager) MO.regionManager.reset();
            if (MO.constructionManager) MO.constructionManager.clearAll();
            if (MO.initToolbox) MO.initToolbox();
            MO.rebuildSiteProps(true);
            if (MO.rebuildCamp) MO.rebuildCamp(true);
            if (MO.setMixerBuilt) MO.setMixerBuilt(false);
            if (MO.setWorkbenchBuilt) MO.setWorkbenchBuilt(false);
            if (MO.setUnloadingBuilt) MO.setUnloadingBuilt(false);
            if (MO.setStockYardsBuilt) MO.setStockYardsBuilt(false);
            MO.state.phase = 0;
            if (MO.workerFactory) {
                MO.workerFactory.hireSupervisor({
                    silent: true,
                    profile: { name: MO.state.supervisorName || 'Supervisor Beto', role: 'supervisor', specialty: 'supervisor', helmet: 0xf8fafc, vest: 0xf59e0b, speed: 3.35 }
                });
                MO.workerFactory.hireWorker({ kind: 'helper', silent: true, maxHelpers: 50 });
                MO.workerFactory.syncNpcUI();
            }
        } else {
            if (MO.worldManager) {
                MO.worldManager.initDefaultWorld();
            }
            MO.populateBuildableLotWeeds();
            MO.placeMixerStationOnTerrain();
            if (MO.initToolbox) MO.initToolbox();
            if (MO.initWorkbench) MO.initWorkbench();
            MO.restockSupplies();
            MO.rebuildSiteProps();
            if (MO.rebuildCamp) MO.rebuildCamp();

            if (MO.modes.house && MO.modes.house.onInit) {
                MO.modes.house.onInit();
            }
        }
        let restored = false;
        if (!MO.state.cityMode && MO.worldManager) {
            restored = MO.worldManager.restoreSavedWorld ? MO.worldManager.restoreSavedWorld() : false;
            if (!restored && MO.worldManager.meta.persistentGrowth) {
                MO.populateBuildableLotWeeds();
                MO.updateTerrainGridLines();
            }
        }
        if (MO.updateVillageUI) MO.updateVillageUI();
        if (MO.cityManager && MO.cityManager.syncEconomyUI) MO.cityManager.syncEconomyUI();
        if (MO.refreshTitleMenuUI) MO.refreshTitleMenuUI();
        const seedInput = document.getElementById('setup-seed');
        if (seedInput) seedInput.value = String(MO.state.seed);
        if (MO.workerFactory && MO.workerFactory.syncNpcUI) MO.workerFactory.syncNpcUI();
        if (MO.renderNpcRosterUI) MO.renderNpcRosterUI();
        MO.syncPhaseUI();
        MO.selectTool('clear-weeds');
        if (restored) {
            const doneCount = MO.constructionManager ? MO.constructionManager.getCompletedConstructions().length : 0;
            const npcCount = MO.state.workers ? MO.state.workers.length : 0;
            MO.showToast(`🏘️ Vila restaurada: ${doneCount} obra(s) e ${npcCount} NPC(s)!`, '🏡');
        }
        lastTime = performance.now();
        animate();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})(window.MO = window.MO || {});

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
        regenerateNewTerrain: MO.regenerateNewTerrain,
        toggleScreensaverMode: MO.toggleScreensaverMode,
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
                MO.groups.fx.remove(p.mesh);
                state.particles.splice(i, 1);
            }
        }
    }

    let lastTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        const t = now * 0.001;

        updatePhysics();
        MO.updateWorkers(dt, t);
        MO.updateAtmosphere(dt, t);
        MO.updateSkyAndWeather(dt, t);
        MO.updateRandomEvents(dt);
        MO.updateCollapseDebris(dt);
        MO.updateSiteLogistics(dt);
        if (MO.updateCamp) MO.updateCamp(dt, t);
        if (MO.updateWaterAndGroundFX) MO.updateWaterAndGroundFX(dt, t);
        MO.updateAmbientSoundscape(dt);

        const activeMode = MO.modes[MO.state.mode];
        if (activeMode && activeMode.updateSimulation) {
            activeMode.updateSimulation(dt, t);
        }
        MO.updateScreensaverAutopilot(dt, t);

        if (MO.waterTex) {
            MO.waterTex.offset.x = Math.sin(t * 0.25) * 0.06;
            MO.waterTex.offset.y = t * 0.025;
        }
        if (MO.mixer.mixerBarGroup.visible) {
            MO.mixer.mixerBarGroup.lookAt(MO.camera.position);
        }

        const camOrbit = MO.camOrbit;
        MO.camera.position.x = camOrbit.target.x + camOrbit.radius * Math.sin(camOrbit.phi) * Math.sin(camOrbit.theta);
        MO.camera.position.y = camOrbit.target.y + camOrbit.radius * Math.cos(camOrbit.phi);
        MO.camera.position.z = camOrbit.target.z + camOrbit.radius * Math.sin(camOrbit.phi) * Math.cos(camOrbit.theta);
        MO.camera.lookAt(camOrbit.target);

        if (MO.renderer) MO.renderer.render(MO.scene, MO.camera);
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
        MO.populateBuildableLotWeeds();
        MO.placeMixerStationOnTerrain();
        MO.restockSupplies();
        MO.rebuildSiteProps();
        if (MO.rebuildCamp) MO.rebuildCamp();

        if (MO.modes.house && MO.modes.house.onInit) {
            MO.modes.house.onInit();
        }
        MO.syncPhaseUI();
        MO.selectTool('clear-weeds');
        animate();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})(window.MO = window.MO || {});

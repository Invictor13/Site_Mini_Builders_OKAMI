// =========================================================================
// MODO CASA: REGISTRO DE CONTRATO, TAREFAS DE AJUDANTES & AUTOPILOT
// =========================================================================
(function(MO) {
    MO.modes.house = {
        id: 'house',
        label: 'Casa no Campo',

        onInit() {
            const state = MO.state;
            state.phase = 0;
            state.occupiedCells.clear();
            state.columns = []; state.walls = []; state.muros = []; state.stairs = []; state.floorTiles = [];
            state.elecNodes = []; state.elecConduits = []; state.elecLights = []; state.elecPowerOn = false;
            state.plumbNodes = []; state.plumbPipes = []; state.leakPoints = []; state.waterFlowActive = false;
            state.roofStage = 0;
            state.furnitureBuilt = false;
            state.mixerWorkerBusy = false; state.roofWorkerBusy = false;
            state.tankBusy = false; state.fixBusy = false; state.sewageBusy = false;
            MO.groups.blueprint.visible = true;
            MO.selectTool('clear-weeds');
        },

        onStartPhase1() {
            MO.state.phase = 1;
            MO.syncPhaseUI();
            MO.updateTerrainGridLines();
            MO.selectTool('room');
            MO.showToast('Fase 1: Desenhe os cômodos na grade ou clique em ✨ Modelo!', '📐');
        },

        assignWorkerTask(w, setWorkerTool) {
            const state = MO.state;
            const needsConcreteWork =
                (state.phase === 2 && state.columns.some(c => c.hasFormwork && !c.concreted)) ||
                (state.phase === 3 && (state.walls.some(wl => wl.slots.some(s => !s.placed)) || state.floorTiles.some(f => !f.concreted))) ||
                (state.phase === 5 && state.walls.some(wl => wl.hasBeamFormwork && !wl.hasTopBeam));

            if (needsConcreteWork && state.mortarCharges <= 0 && !state.mixerWorkerBusy) {
                state.mixerWorkerBusy = true;
                w.task = { type: 'mix-mortar', duration: 1.35 };
                w.tx = MO.STATION_MIXER.x;
                w.tz = MO.STATION_MIXER.z + 1.02;
                setWorkerTool(w.rig, 'hoe');
                return true;
            }

            if (state.phase === 2) {
                const cDig = state.columns.find(c => !c.dug && !c.res);
                if (cDig) { cDig.res = true; w.task = { type: 'dig', col: cDig, duration: 0.55 }; w.tx = cDig.x; w.tz = cDig.z; setWorkerTool(w.rig, 'hoe'); return true; }
                const cReb = state.columns.find(c => c.dug && !c.hasRebar && !c.res);
                if (cReb) { cReb.res = true; w.task = { type: 'rebar', col: cReb, duration: 0.50 }; w.tx = cReb.x; w.tz = cReb.z; return true; }
                const cFw = state.columns.find(c => c.hasRebar && !c.hasFormwork && !c.res);
                if (cFw) { cFw.res = true; w.task = { type: 'fw', col: cFw, duration: 0.65 }; w.tx = cFw.x; w.tz = cFw.z; setWorkerTool(w.rig, 'plank'); return true; }
                const cPour = state.columns.find(c => c.hasFormwork && !c.concreted && !c.res);
                if (cPour) { cPour.res = true; w.task = { type: 'pour', col: cPour, duration: 0.55 }; w.tx = cPour.x; w.tz = cPour.z; setWorkerTool(w.rig, 'trowel'); return true; }
            }

            if (state.phase === 3) {
                for (let wall of state.walls) {
                    const unp = wall.slots.filter(s => !s.placed && !s.res);
                    if (!unp.length) continue;
                    const low = Math.min(...wall.slots.filter(s => !s.placed).map(s => s.row));
                    const sl = unp.find(s => s.row === low);
                    if (!sl) continue;
                    if (sl.isLintel && !wall.hasProp) { wall.hasProp = true; wall.propGroup.visible = true; }
                    sl.res = true;
                    w.task = { type: 'brick', slot: sl, duration: 0.36 };
                    w.tx = sl.x; w.tz = sl.z;
                    setWorkerTool(w.rig, 'brick');
                    return true;
                }
                const mu = state.muros.find(m => !m.built && !m.res);
                if (mu) { mu.res = true; w.task = { type: 'muro', muro: mu, duration: 0.45 }; w.tx = mu.x; w.tz = mu.z; setWorkerTool(w.rig, 'brick'); return true; }
                const st = state.stairs.find(s => !s.built && !s.res);
                if (st) { st.res = true; w.task = { type: 'stair', stair: st, duration: 0.55 }; w.tx = st.x; w.tz = st.z; setWorkerTool(w.rig, 'trowel'); return true; }
                const ft = state.floorTiles.find(f => !f.concreted && !f.res);
                if (ft) { ft.res = true; w.task = { type: 'floor', ft, duration: 0.42 }; w.tx = ft.x; w.tz = ft.z; setWorkerTool(w.rig, 'trowel'); return true; }
            }

            if (state.phase === 4) {
                if (state.elecNodes.length < Math.min(5, state.walls.length)) {
                    const candidateWall = state.walls[(state.elecNodes.length * 2) % state.walls.length];
                    if (candidateWall && !candidateWall.mepBusy) {
                        candidateWall.mepBusy = true;
                        const mx = (candidateWall.x1 + candidateWall.x2) / 2;
                        const mz = (candidateWall.z1 + candidateWall.z2) / 2;
                        w.task = { type: 'mep-elec', wall: candidateWall, x: mx, z: mz, duration: 0.60 };
                        w.tx = mx; w.tz = mz;
                        setWorkerTool(w.rig, 'hammer');
                        return true;
                    }
                }
                const hasTank = state.plumbNodes.some(n => n.type === 'tank');
                if (!hasTank && !state.tankBusy && state.floorTiles.length > 0) {
                    state.tankBusy = true;
                    const ft = state.floorTiles[0];
                    w.task = { type: 'mep-plumb', kind: 'tank', x: ft.x, z: ft.z, duration: 0.65 };
                    w.tx = ft.x; w.tz = ft.z;
                    setWorkerTool(w.rig, 'hammer');
                    return true;
                }
                const fixCount = state.plumbNodes.filter(n => n.type === 'fixture').length;
                if (hasTank && fixCount < 2 && state.walls.length > 0 && !state.fixBusy) {
                    state.fixBusy = true;
                    const wl = state.walls[(fixCount * 3 + 1) % state.walls.length];
                    const mx = (wl.x1 + wl.x2) / 2, mz = (wl.z1 + wl.z2) / 2;
                    w.task = { type: 'mep-plumb', kind: 'fixture', x: mx, z: mz, duration: 0.60 };
                    w.tx = mx; w.tz = mz;
                    setWorkerTool(w.rig, 'hammer');
                    return true;
                }
                const hasSewage = state.plumbNodes.some(n => n.type === 'sewage');
                if (hasTank && fixCount >= 2 && !hasSewage && !state.sewageBusy) {
                    state.sewageBusy = true;
                    const activeLot = (MO.regionManager && MO.regionManager.getActiveLot) ? MO.regionManager.getActiveLot() : null;
                    const sx = activeLot ? (activeLot.originX + activeLot.halfW + 0.55) : 3.6;
                    const sz = activeLot ? activeLot.originZ : -2.2;
                    w.task = { type: 'mep-plumb', kind: 'sewage', x: sx, z: sz, duration: 0.65 };
                    w.tx = sx; w.tz = sz;
                    setWorkerTool(w.rig, 'hoe');
                    return true;
                }
            }

            if (state.phase === 5) {
                const bfw = state.walls.find(wl => !wl.hasBeamFormwork && !wl.res);
                if (bfw) {
                    bfw.res = true;
                    w.task = { type: 'beam-fw', wall: bfw, duration: 0.62 };
                    w.tx = (bfw.x1 + bfw.x2) / 2; w.tz = (bfw.z1 + bfw.z2) / 2;
                    setWorkerTool(w.rig, 'plank');
                    return true;
                }
                const bw = state.walls.find(wl => wl.hasBeamFormwork && !wl.hasTopBeam && !wl.res);
                if (bw) {
                    bw.res = true;
                    w.task = { type: 'beam', wall: bw, duration: 0.48 };
                    w.tx = (bw.x1 + bw.x2) / 2; w.tz = (bw.z1 + bw.z2) / 2;
                    setWorkerTool(w.rig, 'trowel');
                    return true;
                }
                if (state.walls.every(wl => wl.hasTopBeam) && state.roofStage < 2 && !state.roofWorkerBusy) {
                    state.roofWorkerBusy = true;
                    w.task = { type: 'roof-stage', duration: 0.85 };
                    w.tx = 0; w.tz = -0.5;
                    setWorkerTool(w.rig, 'hammer');
                    return true;
                }
                const pw = state.walls.find(wl => !wl.isPlastered && !wl.res);
                if (pw && state.roofStage >= 2) {
                    pw.res = true;
                    w.task = { type: 'plaster', wall: pw, duration: 0.45 };
                    w.tx = (pw.x1 + pw.x2) / 2; w.tz = (pw.z1 + pw.z2) / 2;
                    setWorkerTool(w.rig, 'trowel');
                    return true;
                }
                const fxw = state.walls.find(wl => wl.isPlastered && wl.opening && !wl.hasFixture && !wl.res);
                if (fxw) {
                    fxw.res = true;
                    w.task = { type: 'fixture', wall: fxw, duration: 0.55 };
                    w.tx = (fxw.x1 + fxw.x2) / 2; w.tz = (fxw.z1 + fxw.z2) / 2;
                    setWorkerTool(w.rig, 'hammer');
                    return true;
                }
                const ptw = state.walls.find(wl => wl.isPlastered && (!wl.opening || wl.hasFixture) && !wl.isPainted && !wl.res);
                if (ptw) {
                    ptw.res = true;
                    w.task = { type: 'paint', wall: ptw, duration: 0.42 };
                    w.tx = (ptw.x1 + ptw.x2) / 2; w.tz = (ptw.z1 + ptw.z2) / 2;
                    setWorkerTool(w.rig, 'trowel');
                    return true;
                }
            }
            return false;
        },

        completeWorkerTask(tk) {
            const state = MO.state;
            if (tk.type === 'dig') {
                tk.col.dug = true; tk.col.ringMesh.material.color.setHex(0x38bdf8);
                const hole = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), MO.mats.hole); hole.position.y = 0.03;
                tk.col.holeMesh = hole; tk.col.meshGroup.add(hole); MO.SoundFX.playDirtShovel(); tk.col.res = false;
            } else if (tk.type === 'rebar') {
                tk.col.hasRebar = true;
                if (tk.pickedRebar && tk.pickedRebar.mesh) {
                    tk.pickedRebar.installed = true;
                    tk.pickedRebar.mesh.visible = true;
                    tk.pickedRebar.mesh.position.set(tk.col.x, tk.col.terrainY + 0.02, tk.col.z);
                    tk.pickedRebar.mesh.rotation.set(0, 0, 0);
                } else {
                    const c = MO.createRebarCageMesh();
                    c.position.set(tk.col.x, tk.col.terrainY + 0.02, tk.col.z);
                    MO.groups.looseRebars.add(c);
                }
                MO.SoundFX.playMetalClang(); tk.col.res = false;
            } else if (tk.type === 'fw') {
                MO.attachWoodFormworkToColumn(tk.col); MO.SoundFX.playHammerWood(); tk.col.res = false;
            } else if (tk.type === 'pour') {
                MO.concreteColumn(tk.col); tk.col.res = false;
                state.bucketCharges = Math.max(0, state.bucketCharges - 0.5); MO.updateBucketUI();
            } else if (tk.type === 'brick') {
                tk.slot.hasMortar = true; tk.slot.mortarMesh.visible = true;
                MO.animateBrickDrop(tk.slot); tk.slot.res = false;
                state.bucketCharges = Math.max(0, state.bucketCharges - 0.15); MO.updateBucketUI();
            } else if (tk.type === 'muro') {
                tk.muro.built = true; tk.muro.res = false; MO.renderMurosAndStairsBlueprint(); MO.SoundFX.playBrickClack();
            } else if (tk.type === 'stair') {
                tk.stair.built = true; tk.stair.res = false; MO.renderMurosAndStairsBlueprint(); MO.SoundFX.playMortarSquish();
            } else if (tk.type === 'floor') {
                tk.ft.concreted = true; tk.ft.hitbox.visible = false;
                const slab = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.14, 0.98), MO.mats.concrete);
                slab.position.set(tk.ft.x, state.houseBaseY + 0.07, tk.ft.z); slab.receiveShadow = true;
                tk.ft.slabMesh = slab; MO.groups.floor.add(slab); MO.SoundFX.playMortarSquish(); tk.ft.res = false;
            } else if (tk.type === 'mep-elec') {
                MO.placeElectricalNode(tk.wall, new THREE.Vector3(tk.x, state.houseBaseY + 0.95, tk.z));
                tk.wall.mepBusy = false;
            } else if (tk.type === 'mep-plumb') {
                MO.placePlumbingNode(tk.kind, new THREE.Vector3(tk.x, state.houseBaseY + 0.9, tk.z));
                if (tk.kind === 'tank') state.tankBusy = false;
                if (tk.kind === 'fixture') state.fixBusy = false;
                if (tk.kind === 'sewage') state.sewageBusy = false;
            } else if (tk.type === 'beam-fw') {
                tk.wall.hasBeamFormwork = true;
                if (tk.wall.beamFormworkGroup) tk.wall.beamFormworkGroup.visible = true;
                MO.SoundFX.playHammerWood(); tk.wall.res = false;
            } else if (tk.type === 'beam') {
                tk.wall.hasTopBeam = true; tk.wall.topBeamMesh.visible = true;
                if (tk.wall.beamFormworkGroup) tk.wall.beamFormworkGroup.visible = false;
                if (tk.wall.propGroup) tk.wall.propGroup.visible = false;
                MO.SoundFX.playMortarSquish(); tk.wall.res = false;
            } else if (tk.type === 'roof-stage') {
                MO.buildRealGableRoofStage();
                state.roofWorkerBusy = false;
            } else if (tk.type === 'plaster') {
                tk.wall.isPlastered = true; tk.wall.plasterGroup.visible = true;
                tk.wall.slots.forEach(s => { s.guideMesh.visible = false; });
                MO.SoundFX.playMortarSquish(); tk.wall.res = false;
            } else if (tk.type === 'fixture') {
                if (tk.wall.fixtureGroup) { tk.wall.hasFixture = true; tk.wall.fixtureGroup.visible = true; MO.SoundFX.playHammerWood(); }
                tk.wall.res = false;
            } else if (tk.type === 'paint') {
                tk.wall.isPainted = true;
                if (tk.wall.plasterMat) tk.wall.plasterMat.color.set(state.paintColorHex);
                MO.SoundFX.playMortarSquish(); tk.wall.res = false;
                if (state.walls.every(w => w.isPainted)) {
                    if (MO.buildHouseInteriorFurniture) MO.buildHouseInteriorFurniture();
                    if (MO.approveStructure && !state.structural.collapsed) {
                        MO.approveStructure('✅ HABITE-SE APROVADO · CASA SEGURA');
                    }
                }
            }
        },

        updateAutopilot(dt, t) {
            const state = MO.state;
            if (state.structural.collapsed) {
                state.structural.collapseTimer += dt;
                if (state.structural.collapseTimer > 3.2) {
                    // Operação Demolição & Reconstrução Reforçada
                    MO.resetStructuralState();
                    state.structural.repairedOnce = true;
                    state.structural.integrity = 100;
                    state.roofStage = 0;
                    MO.resources.clearGroup(MO.groups.roof);
                    state.walls.forEach(w => { w.hasTopBeam = true; w.topBeamMesh.visible = true; if (w.beamFormworkGroup) w.beamFormworkGroup.visible = false; });
                    MO.showToast('🔧 Equipe reforçou a cinta e iniciou reconstrução segura!', '🔧');
                }
                return false;
            }
            if (state.phase === 0) {
                const allWeedsCleared = state.weeds.every(w => w.cleared);
                const allLeveled = MO.computeLotLevelProgress() >= 92;
                if (allWeedsCleared && allLeveled) MO.advanceToPhase1();
            } else if (state.phase === 1) {
                if (state.walls.length === 0) MO.loadPresetHouse();
                const palettes = ['#f1f5f9', '#dfd3be', '#c9866b', '#8fa893', '#94a3b8'];
                const lotIdx = MO.constructionManager ? MO.constructionManager.getCompletedConstructions().length : 0;
                state.paintColorHex = palettes[(state.seed + lotIdx) % palettes.length];
                MO.advanceToPhase2();
            } else if (state.phase === 2) {
                if (state.columns.length > 0 && state.columns.every(c => c.concreted)) MO.advanceToPhase3();
            } else if (state.phase === 3) {
                const wallsDone = state.walls.every(wl => wl.slots.every(s => s.placed));
                const floorDone = state.floorTiles.every(f => f.concreted);
                const murosDone = state.muros.every(m => m.built);
                const stairsDone = state.stairs.every(s => s.built);
                if (wallsDone && floorDone && murosDone && stairsDone) MO.advanceToPhase4();
            } else if (state.phase === 4) {
                const elecReady = state.elecNodes.length >= Math.min(5, state.walls.length);
                const plumbReady = state.plumbNodes.some(n => n.type === 'tank') &&
                                   state.plumbNodes.filter(n => n.type === 'fixture').length >= 2 &&
                                   state.plumbNodes.some(n => n.type === 'sewage');
                if (elecReady && plumbReady) {
                    if (!state.elecPowerOn) MO.testElectricalSystem();
                    if (!state.waterFlowActive) MO.testPlumbingSystem();
                    MO.advanceToPhase5();
                }
            } else if (state.phase === 5) {
                const allPainted = state.walls.length > 0 && state.walls.every(w => w.isPainted);
                if (allPainted && state.roofStage >= 2) {
                    if (MO.buildHouseInteriorFurniture) MO.buildHouseInteriorFurniture();
                    if (MO.approveStructure && !state.structural.laudoStatus) {
                        MO.approveStructure('✅ HABITE-SE APROVADO · CASA SEGURA');
                    }
                    return true;
                }
            }
            return false;
        }
    };
})(window.MO = window.MO || {});

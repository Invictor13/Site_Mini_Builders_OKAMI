// =========================================================================
// ENTITIES / WORKERS: SELEÇÃO DE TAREFAS, RESERVAS & LOGÍSTICA DE MATERIAIS
// =========================================================================
(function(MO) {
    function releaseTaskReservations(tk) {
        if (!tk) return;
        if (tk.col) tk.col.res = false;
        if (tk.item) tk.item.res = false;
        if (tk.slot) tk.slot.res = false;
        if (tk.muro) tk.muro.res = false;
        if (tk.stair) tk.stair.res = false;
        if (tk.ft) tk.ft.res = false;
        if (tk.wall) { tk.wall.res = false; tk.wall.mepBusy = false; }
        if (tk.type === 'roof-stage') MO.state.roofWorkerBusy = false;
        if (tk.type === 'bld-roof' && MO.state.building) MO.state.building.roofBusy = false;
        if (tk.type === 'tw-top' && MO.state.tower) MO.state.tower.topBusy = false;
        if (tk.pickedBrick && !tk.pickedBrick.placed) tk.pickedBrick.res = false;
        if (tk.pickedRebar && !tk.pickedRebar.installed) tk.pickedRebar.res = false;
        if (tk.pickedBeam && !tk.pickedBeam.used) tk.pickedBeam.res = false;
        if (tk.pickedSupply && !tk.pickedSupply.consumed) tk.pickedSupply.res = false;
        if (tk.roadSeg) tk.roadSeg.res = false;
        if (tk.cityStruct) tk.cityStruct.res = false;
        if (tk.resourceNode) tk.resourceNode.res = false;
        if (tk.forestryTree) tk.forestryTree.res = false;
        if (tk.forestryLog) tk.forestryLog.res = false;
        if (tk.plantSpot) tk.plantSpot.res = false;
        if (tk.miningRock) tk.miningRock.res = false;
        if (tk.miningChunk) tk.miningChunk.res = false;
        if (tk.farmPlot) tk.farmPlot.res = false;
        if (tk.farmBundle) tk.farmBundle.res = false;
        if (tk.type === 'process-crusher' && MO.miningManager && MO.miningManager.state.crusher) {
            MO.miningManager.state.crusher.busyWorkerId = null;
            MO.miningManager.animateCrusher(false, 0, null);
        }
        if (tk.type === 'pack-bench' && MO.farmingManager && MO.farmingManager.state.bench) {
            MO.farmingManager.state.bench.busyWorkerId = null;
            MO.farmingManager.animateBench(false, null);
        }
        if ((tk.type === 'saw-wood' || tk.type === 'craft-forestry-plank') && MO.state.workbench) MO.state.workbench.busyWorkerId = null;
        if (MO.state.villageInfra) {
            if (tk.type === 'build-unloading') MO.state.villageInfra.unloadingRes = false;
            if (tk.type === 'build-mixer') MO.state.villageInfra.mixerRes = false;
            if (tk.type === 'build-workbench') MO.state.villageInfra.workbenchRes = false;
            if (tk.type === 'build-yards') MO.state.villageInfra.yardsRes = false;
        }
    }

    function setDestination(w, rawX, rawZ, wallRef) {
        const cur = w.rig.group.position;
        const app = (MO.getWorkerApproachPoint && wallRef)
            ? MO.getWorkerApproachPoint(cur.x, cur.z, rawX, rawZ, wallRef)
            : { x: rawX, z: rawZ };
        w.tx = app.x;
        w.tz = app.z;
        w.waypoints = MO.computeWorkerPath
            ? MO.computeWorkerPath(w, cur.x, cur.z, app.x, app.z)
            : [{ x: app.x, z: app.z }];
        w.stuckTimer = 0;
    }

    function tryStartConcreteSupplyOrMix(w) {
        const state = MO.state;
        if (state.unifiedVillage && state.villageInfra && !state.villageInfra.mixerBuilt) return false;
        const setWorkerTool = MO.workerFactory.setWorkerTool;
        const needsConcrete =
            (state.mode === 'house' && (
                (state.phase === 2 && state.columns.some(c => c.hasFormwork && !c.concreted)) ||
                (state.phase === 3 && (state.walls.some(wl => wl.slots.some(s => !s.placed)) || state.floorTiles.some(f => !f.concreted))) ||
                (state.phase === 5 && state.walls.some(wl => wl.hasBeamFormwork && !wl.hasTopBeam))
            )) ||
            (state.mode === 'bridge' && (state.phase === 1 && state.bridge.piers.some(p => p.hasCofferdam && !p.concreted))) ||
            (state.mode === 'building' && (state.phase === 1 && state.building.floors.some(f => f.hasStruct && !f.hasSlab))) ||
            (state.mode === 'tower' && (state.phase === 1 && state.tower.footings.some(f => f.hasRebar && !f.concreted)));

        if (!needsConcrete || state.mortarCharges > 0 || state.mixerWorkerBusy) return false;

        if (state.sand < 3 || state.cement < 1 || state.water < 1) {
            const wanted = state.sand < 3 ? 'sand' : (state.cement < 1 ? 'cement' : 'water');
            const bag = state.draggableSupplies.find(s => !s.consumed && !s.res && s.type === wanted);
            if (!bag) {
                if (MO.requestSupplyTruck) MO.requestSupplyTruck('supplies');
                return false;
            }
            bag.res = true;
            state.mixerWorkerBusy = true;
            w.task = {
                type: 'feed-mixer',
                supplyType: wanted,
                pickedSupply: bag,
                subPhase: 'pickup',
                deliverX: MO.STATION_MIXER.x,
                deliverZ: MO.STATION_MIXER.z + 1.02,
                duration: 0.22
            };
            setWorkerTool(w.rig, 'none');
            setDestination(w, bag.mesh.position.x, bag.mesh.position.z);
            w.rig.setBadge('📦');
            w.statusText = `Pegando ${wanted === 'sand' ? 'areia' : (wanted === 'cement' ? 'cimento' : 'água')} para a masseira`;
            return true;
        }

        state.mixerWorkerBusy = true;
        w.task = { type: 'mix-mortar', duration: 1.35, subPhase: 'work' };
        setDestination(w, MO.STATION_MIXER.x, MO.STATION_MIXER.z + 1.02);
        setWorkerTool(w.rig, 'hoe');
        w.rig.setBadge('🥄');
        w.statusText = 'Batendo massa na masseira';
        return true;
    }

    function wrapTaskWithRealLogistics(w) {
        const tk = w.task;
        if (!tk) return true;
        const state = MO.state;
        const setWorkerTool = MO.workerFactory.setWorkerTool;
        const wallTarget = tk.wall || (tk.slot ? tk.slot.wallRef : null);
        const isPlayerDriven = Boolean(state.cityMode && state.city && state.city.playerDriven);
        const infra = state.villageInfra;

        if (tk.type === 'brick' || tk.type === 'muro') {
            const brick = state.looseBricks.find(b => !b.placed && !b.res);
            if (!brick) {
                if (isPlayerDriven && (!infra || !infra.unloadingBuilt || !infra.yardsBuilt)) {
                    tk.subPhase = 'work';
                    setDestination(w, w.tx, w.tz, wallTarget);
                    return true;
                }
                releaseTaskReservations(tk);
                w.task = null;
                if (MO.requestSupplyTruck) MO.requestSupplyTruck('bricks');
                return false;
            }
            brick.res = true;
            tk.pickedBrick = brick;
            tk.subPhase = 'pickup';
            tk.deliverX = w.tx;
            tk.deliverZ = w.tz;
            tk.wallTarget = wallTarget;
            tk.carryTool = 'brick';
            setWorkerTool(w.rig, 'none');
            setDestination(w, brick.mesh.position.x, brick.mesh.position.z);
            w.statusText = 'Buscando tijolo no palete';
            return true;
        }

        if (tk.type === 'rebar' || tk.type === 'tw-rebar') {
            const rb = state.looseRebars.find(r => !r.installed && !r.res);
            if (!rb) {
                if (isPlayerDriven && (!infra || !infra.unloadingBuilt || !infra.yardsBuilt)) {
                    tk.subPhase = 'work';
                    setDestination(w, w.tx, w.tz, wallTarget);
                    return true;
                }
                releaseTaskReservations(tk);
                w.task = null;
                if (MO.requestSupplyTruck) MO.requestSupplyTruck('rebars');
                return false;
            }
            rb.res = true;
            tk.pickedRebar = rb;
            tk.subPhase = 'pickup';
            tk.deliverX = w.tx;
            tk.deliverZ = w.tz;
            tk.carryTool = 'rebar';
            setWorkerTool(w.rig, 'none');
            setDestination(w, rb.mesh.position.x, rb.mesh.position.z);
            w.statusText = 'Buscando armadura de ferro';
            return true;
        }

        if (
            tk.type === 'fw' || tk.type === 'beam-fw' || tk.type === 'roof-stage' ||
            tk.type === 'br-coffer' || tk.type === 'br-girder' || tk.type === 'bld-struct' || tk.type === 'tw-scaf' || tk.type === 'tw-steel'
        ) {
            const isSteelBeam = (tk.type === 'br-girder' || tk.type === 'tw-steel');
            if (!isSteelBeam && state.unifiedVillage && infra && infra.workbenchBuilt && state.workbench) {
                if (state.workbench.cutWood > 0) {
                    tk.needsCutWood = true;
                    tk.subPhase = 'pickup';
                    tk.deliverX = w.tx;
                    tk.deliverZ = w.tz;
                    tk.wallTarget = wallTarget;
                    tk.carryTool = 'plank';
                    setWorkerTool(w.rig, 'none');
                    setDestination(w, MO.STATION_WORKBENCH.x + 0.55, MO.STATION_WORKBENCH.z + 0.72);
                    w.statusText = 'Pegando madeira cortada na bancada';
                    return true;
                }
                releaseTaskReservations(tk);
                w.task = null;
                if (state.workbench.rawWood > 0 && state.workbench.busyWorkerId === null) {
                    return trySawWoodAtWorkbench(w, setDestination, setWorkerTool);
                }
                if (infra.roadBuilt && infra.unloadingBuilt && MO.requestSupplyTruck) {
                    MO.requestSupplyTruck('wood');
                }
                return false;
            }
            const wantKind = isSteelBeam ? 'beam' : 'plank';
            const beam = state.looseBeams.find(b => !b.used && !b.res && b.kind === wantKind)
                      || state.looseBeams.find(b => !b.used && !b.res);
            if (!beam) {
                if (isPlayerDriven && (!infra || !infra.workbenchBuilt || !infra.yardsBuilt)) {
                    tk.subPhase = 'work';
                    setDestination(w, w.tx, w.tz, wallTarget);
                    return true;
                }
                releaseTaskReservations(tk);
                w.task = null;
                if (MO.requestSupplyTruck) MO.requestSupplyTruck('beams');
                return false;
            }
            beam.res = true;
            tk.pickedBeam = beam;
            tk.subPhase = 'pickup';
            tk.deliverX = w.tx;
            tk.deliverZ = w.tz;
            tk.wallTarget = wallTarget;
            tk.carryTool = wantKind === 'beam' ? 'beam' : 'plank';
            setWorkerTool(w.rig, 'none');
            setDestination(w, beam.x, beam.z);
            w.statusText = wantKind === 'beam' ? 'Buscando viga estrutural' : 'Buscando tábuas de caixaria';
            return true;
        }

        if (
            tk.type === 'pour' || tk.type === 'floor' || tk.type === 'beam' ||
            tk.type === 'br-pour' || tk.type === 'bld-slab' || tk.type === 'tw-pour'
        ) {
            const useWheelbarrow = (tk.type === 'floor' || tk.type === 'br-pour' || tk.type === 'bld-slab' || tk.type === 'tw-pour');
            tk.carryTool = useWheelbarrow ? 'wheelbarrow' : 'bucket';
            if (state.bucketCharges < 0.5) {
                if (state.mortarCharges <= 0) {
                    if (isPlayerDriven && (!infra || !infra.mixerBuilt)) {
                        tk.subPhase = 'work';
                        setDestination(w, w.tx, w.tz, wallTarget);
                        return true;
                    }
                    releaseTaskReservations(tk);
                    w.task = null;
                    return false;
                }
                tk.subPhase = 'pickup';
                tk.needsBucketFill = true;
                tk.deliverX = w.tx;
                tk.deliverZ = w.tz;
                tk.wallTarget = wallTarget;
                setWorkerTool(w.rig, 'none');
                setDestination(w, MO.STATION_MIXER.x + 0.95, MO.STATION_MIXER.z + 0.78);
                w.rig.setBadge('🪣');
                w.statusText = 'Enchendo balde na masseira';
                return true;
            }
            tk.subPhase = 'deliver';
            tk.wallTarget = wallTarget;
            setWorkerTool(w.rig, tk.carryTool);
            setDestination(w, w.tx, w.tz, wallTarget);
            w.statusText = useWheelbarrow ? 'Levando concreto no carrinho' : 'Levando balde de massa à obra';
            return true;
        }

        tk.subPhase = 'work';
        setDestination(w, w.tx, w.tz, wallTarget);
        return true;
    }

    function trySawWoodAtWorkbench(w, setDest, setWorkerTool) {
        const state = MO.state;
        const infra = state.villageInfra;
        const wb = state.workbench;
        if (!state.unifiedVillage || !infra || !infra.workbenchBuilt || !wb) return false;
        if (wb.busyWorkerId === null && wb.cutWood < 4 && wb.rawWood > 0) {
            wb.busyWorkerId = w.id;
            w.task = { type: 'saw-wood', duration: 0.95, subPhase: 'work' };
            setDest(w, MO.STATION_WORKBENCH.x + 0.1, MO.STATION_WORKBENCH.z + 0.85);
            setWorkerTool(w.rig, 'saw');
            w.rig.setBadge('🪚');
            w.statusText = 'Serrando madeira para andaimes e vigas';
            return true;
        }
        if (wb.rawWood === 0 && wb.cutWood < 2 && infra.roadBuilt && infra.unloadingBuilt && MO.requestSupplyTruck) {
            MO.requestSupplyTruck('wood');
        }
        return false;
    }

    function tryAssignSupervisorTask(w, setDest, setWorkerTool) {
        const state = MO.state;
        if (!state.unifiedVillage || w.role !== 'supervisor') return false;
        const infra = state.villageInfra;
        if (!infra) return false;
        const playerDriven = Boolean(state.cityMode && state.city && state.city.playerDriven);

        if (playerDriven) {
            if (infra.roadBuilt && infra.unloadingBuilt && infra.workbenchBuilt && state.workbench && state.workbench.rawWood <= 0 && state.workbench.cutWood <= 1 && !state.site.truckActive && MO.requestSupplyTruck) {
                MO.requestSupplyTruck('wood');
            }
            const activeLot = (MO.worldManager && MO.worldManager.getActiveLotOrigin && MO.regionManager && MO.regionManager.getActiveLot())
                ? MO.worldManager.getActiveLotOrigin()
                : null;
            const lastStruct = (state.city && state.city.structures && state.city.structures.length > 0)
                ? state.city.structures[state.city.structures.length - 1]
                : null;
            const targetSpot = activeLot || lastStruct || MO.STATION_TOOLBOX || { x: -2.2, z: 2.0 };
            const surveyOffsets = [
                { x: 3.5, z: 0.4, txt: 'Guiando peregrinos da Rodovia até a clareira do vale' },
                { x: 8.2, z: -1.5, txt: 'Avaliando terreno fértil para erguer o primeiro abrigo' },
                { x: 1.6, z: 2.6, txt: 'Traçando ponto de ligação com a Rodovia Regional' }
            ];
            const useSurvey = !activeLot && !lastStruct && !infra.unloadingPlaced && !infra.mixerPlaced && !infra.workbenchPlaced;
            // Se há operário disponível próximo no início, faz briefing coordenado de equipe
            const peer = (state.workers || []).find(o => o !== w && !o.sleepingInside && o.rig && o.rig.group);
            if (useSurvey && peer && ((w._surveyStep || 0) % 3 === 2)) {
                w._surveyStep = (w._surveyStep || 0) + 1;
                w.task = { type: 'brief-crew', peer, duration: 1.5, subPhase: 'work' };
                setDest(w, peer.rig.group.position.x + 0.85, peer.rig.group.position.z + 0.35);
                setWorkerTool(w.rig, 'clipboard');
                w.rig.setBadge('📋');
                w.statusText = `Coordenando plano com ${peer.name}`;
                return true;
            }
            const sIdx = (w._surveyStep || 0) % surveyOffsets.length;
            w._surveyStep = sIdx + 1;
            const offset = useSurvey ? surveyOffsets[sIdx] : { x: -1.1, z: 1.4, txt: null };
            w.task = { type: 'inspect-site', duration: 1.65, subPhase: 'work' };
            setDest(w, targetSpot.x + offset.x, targetSpot.z + offset.z);
            setWorkerTool(w.rig, 'clipboard');
            w.rig.setBadge('👷‍♂️');
            if (offset.txt) {
                w.statusText = offset.txt;
            } else if (!infra.unloadingBuilt) {
                w.statusText = 'Aguardando Baia de Descarga (Apoio)';
            } else if (!infra.mixerBuilt) {
                w.statusText = 'Aguardando Masseira (Apoio)';
            } else if (!infra.workbenchBuilt) {
                w.statusText = 'Aguardando Bancada (Apoio)';
            } else {
                w.statusText = 'Coordenando equipe e obras da cidade';
            }
            return true;
        }

        if (!infra.demarcated) {
            w.task = { type: 'demarcate-site', duration: 0.90, subPhase: 'work' };
            setDest(w, MO.STATION_TOOLBOX.x + 1.6, MO.STATION_TOOLBOX.z + 0.6);
            setWorkerTool(w.rig, 'clipboard');
            w.rig.setBadge('📐');
            w.statusText = 'Analisando mapa e demarcando estradas';
            return true;
        }
        if (infra.bridgeUnlocked && !infra.eastRoadDemarcated) {
            w.task = { type: 'demarcate-east', duration: 0.80, subPhase: 'work' };
            setDest(w, -1.8, 0.5);
            setWorkerTool(w.rig, 'clipboard');
            w.rig.setBadge('📐');
            w.statusText = 'Demarcando estradas do Banco Leste';
            return true;
        }
        if (infra.roadBuilt && infra.unloadingBuilt && infra.workbenchBuilt && state.workbench && state.workbench.rawWood <= 0 && state.workbench.cutWood <= 1 && !state.site.truckActive && MO.requestSupplyTruck) {
            MO.requestSupplyTruck('wood');
        }
        const origin = (MO.worldManager && MO.worldManager.getActiveLotOrigin)
            ? MO.worldManager.getActiveLotOrigin()
            : { x: -4.2, z: -2.0 };
        w.task = { type: 'inspect-site', duration: 1.5, subPhase: 'work' };
        setDest(w, origin.x - 1.2, origin.z + 2.2);
        setWorkerTool(w.rig, 'clipboard');
        w.rig.setBadge('👷‍♂️');
        w.statusText = 'Supervisionando obra e logística da vila';
        return true;
    }

    function tryAssignInfrastructureTask(w, setDest, setWorkerTool) {
        const state = MO.state;
        if (!state.unifiedVillage || w.role === 'supervisor') return false;
        const infra = state.villageInfra;
        if (!infra) return false;
        const playerDriven = Boolean(state.cityMode && state.city && state.city.playerDriven);
        if (!playerDriven && !infra.demarcated) return false;

        const seg = infra.roadSegments.find(s => !s.built && !s.res && (s.bank === 'west' || s.bank === 'city' || infra.bridgeUnlocked));
        if (seg) {
            seg.res = true;
            w.task = { type: 'build-road', roadSeg: seg, duration: 0.42, subPhase: 'work' };
            setDest(w, seg.x, seg.z);
            setWorkerTool(w.rig, 'hoe');
            w.rig.setBadge(seg.kind === 'paved' ? '🏙️' : '🛣️');
            w.statusText = seg.kind === 'paved' ? 'Pavimentando rua da cidade' : 'Abrindo estrada de terra para entregas';
            return true;
        }

        // Estruturas produtivas colocadas pelo jogador na cidade (Fazenda, Serraria, Mina, Mercado)
        const citySt = (state.city && Array.isArray(state.city.structures))
            ? state.city.structures.find(st => !st.built && !st.res)
            : null;
        if (citySt) {
            citySt.res = true;
            w.task = { type: 'build-city-struct', cityStruct: citySt, duration: 0.85, subPhase: 'work' };
            setDest(w, citySt.x, citySt.z + 1.05);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🏗️');
            w.statusText = `Construindo ${citySt.kind}`;
            return true;
        }

        if ((!playerDriven || infra.unloadingPlaced) && !infra.unloadingBuilt && !infra.unloadingRes) {
            infra.unloadingRes = true;
            w.task = { type: 'build-unloading', duration: 0.55, subPhase: 'work' };
            setDest(w, MO.STATION_UNLOAD.x, MO.STATION_UNLOAD.z + 0.9);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🚚');
            w.statusText = 'Construindo baia de descarga dos caminhões';
            return true;
        }

        if ((!playerDriven || infra.mixerPlaced) && !infra.mixerBuilt && !infra.mixerRes) {
            infra.mixerRes = true;
            w.task = { type: 'build-mixer', duration: 0.56, subPhase: 'work' };
            setDest(w, MO.STATION_MIXER.x, MO.STATION_MIXER.z + 0.9);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🧱');
            w.statusText = 'Montando masseira e pátio de massa';
            return true;
        }

        if ((!playerDriven || infra.workbenchPlaced) && !infra.workbenchBuilt && !infra.workbenchRes) {
            infra.workbenchRes = true;
            w.task = { type: 'build-workbench', duration: 0.60, subPhase: 'work' };
            setDest(w, MO.STATION_WORKBENCH.x, MO.STATION_WORKBENCH.z + 0.85);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🪚');
            w.statusText = 'Construindo bancada de corte de madeira';
            return true;
        }

        if ((!playerDriven || infra.yardsPlaced) && !infra.stockYardsBuilt && !infra.yardsBuilt && !infra.yardsRes) {
            infra.yardsRes = true;
            w.task = { type: 'build-yards', duration: 0.52, subPhase: 'work' };
            setDest(w, MO.STATION_BRICK.x, MO.STATION_BRICK.z + 0.8);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('📦');
            w.statusText = 'Demarcando estoques de tijolo, aço e madeira';
            return true;
        }

        return false;
    }

    function tryAssignProfessionTask(w, setDest, setWorkerTool) {
        const state = MO.state;
        const pos = w.rig && w.rig.group ? w.rig.group.position : { x: 0, z: 0 };

        if (w.role === 'lumberjack' || w.specialty === 'lumberjack' || w.role === 'carpenter' || w.role === 'gardener') {
            const fm = MO.forestryManager;
            const fState = fm ? fm.state : null;

            // 1. Se já carrega tora bruta ou peça serrada, completa imediatamente o fluxo Bancada -> Madeireira
            if (fm && fState && w.forestryCarry === 'rawLog') {
                const infra = state.villageInfra;
                const sawmill = state.city && state.city.structures.find(st => st.kind === 'lumberyard' && st.built);
                const craftPos = (infra && infra.workbenchBuilt && MO.STATION_WORKBENCH)
                    ? { x: MO.STATION_WORKBENCH.x + 0.1, z: MO.STATION_WORKBENCH.z + 0.88, isWb: true }
                    : (sawmill ? { x: sawmill.x, z: sawmill.z + 1.05, isWb: false } : null);
                if (craftPos) {
                    w.task = { type: 'craft-forestry-plank', useWorkbench: craftPos.isWb, duration: 1.15, subPhase: 'work' };
                    setDest(w, craftPos.x, craftPos.z);
                    setWorkerTool(w.rig, 'log');
                    w.rig.setBadge('🪚');
                    w.statusText = craftPos.isWb ? 'Levando tora para serrar na Bancada' : 'Levando tora para a Serraria';
                    return true;
                }
                // Sem Bancada/Serraria ainda: entrega tora direto no estoque da cidade
                w.forestryCarry = null;
                if (MO.cityManager) MO.cityManager.addResources({ wood: 2 });
            }

            if (fm && fState && w.forestryCarry === 'craftedPiece') {
                const ws = fState.woodshop;
                if (ws.placed && !ws.completed) {
                    const nextP = fm.getNextWoodshopPiece();
                    if (nextP) {
                        w.task = { type: 'build-woodshop-piece', piece: nextP, lookX: nextP.worldX, lookZ: nextP.worldZ, duration: 0.72, subPhase: 'work' };
                        setDest(w, nextP.worldX + 0.72, nextP.worldZ + 0.72);
                        setWorkerTool(w.rig, 'plank');
                        w.rig.setBadge('🏪');
                        w.statusText = `Montando Madeireira: ${nextP.name}`;
                        return true;
                    }
                }
                if (ws.placed && ws.completed && ws.displayedBundles.length < fm.MAX_DISPLAY_LOGS) {
                    w.task = { type: 'deliver-woodshop-display', duration: 0.45, subPhase: 'work' };
                    setDest(w, ws.x - 0.5, ws.z + 1.95);
                    setWorkerTool(w.rig, 'plank');
                    w.rig.setBadge('🪵');
                    w.statusText = 'Expondo lote de madeira na Madeireira';
                    return true;
                }
                // Sem Madeireira ou expositor cheio: estoca na bancada/cidade
                w.forestryCarry = null;
                if (MO.cityManager) MO.cityManager.addResources({ wood: 2 });
            }

            // 2. Fila de reflorestamento marcado com anéis verdes (ativa em Manual ou Auto)
            if (fm && fState && fState.plantQueue.length > 0) {
                const spot = fState.plantQueue.find(q => !q.res);
                if (spot) {
                    spot.res = true;
                    w.task = { type: 'plant-sapling-spot', plantSpot: spot, duration: 0.85, subPhase: 'work' };
                    setDest(w, spot.x, spot.z);
                    setWorkerTool(w.rig, 'hoe');
                    w.rig.setBadge('🌱');
                    w.statusText = 'Plantando muda florestal marcada';
                    return true;
                }
            }

            // 3. Ciclo da Madeira (reflorestamento de tocos de chunks em contratos ambientais)
            const reforestContract = Boolean(state.economy && Array.isArray(state.economy.activeContracts) && state.economy.activeContracts.includes('reforest-valley'));
            const depletedTrees = (MO.chunkManager && MO.chunkManager.getDepletedTreeNodes) ? MO.chunkManager.getDepletedTreeNodes() : [];
            if (depletedTrees.length > 0 && (w.role === 'gardener' || reforestContract || (depletedTrees.length >= 4 && ((w._replantTurn || 0) % 3 === 2)))) {
                w._replantTurn = (w._replantTurn || 0) + 1;
                const stump = depletedTrees[0];
                w.task = { type: 'replant-tree', stumpId: stump.id, x: stump.x, z: stump.z, duration: 1.2, subPhase: 'work' };
                setDest(w, stump.x, stump.z + 0.55);
                setWorkerTool(w.rig, 'hoe');
                w.rig.setBadge('🌱');
                w.statusText = 'Replantando muda na floresta';
                return true;
            }

            // 4. Fluxo físico completo do Lenhador Automático: Toras no chão -> Tocos -> Troncos caídos -> Árvores
            if (fm && fState && fState.autoMode && (w.role === 'lumberjack' || w.specialty === 'lumberjack')) {
                const availLog = fState.groundLogs.find(l => !l.picked && !l.res && l.grounded);
                if (availLog) {
                    availLog.res = true;
                    w.task = { type: 'haul-log', forestryLog: availLog, duration: 0.35, subPhase: 'pickup' };
                    setDest(w, availLog.x, availLog.z);
                    setWorkerTool(w.rig, 'none');
                    w.rig.setBadge('🪵');
                    w.statusText = 'Recolhendo tora cortada no chão';
                    return true;
                }

                const fallenTree = fState.trees.find(tr => tr.status === 'fallen' && !tr.res);
                if (fallenTree) {
                    fallenTree.res = true;
                    const dirX = Math.sin(fallenTree.fallDirAngle);
                    const dirZ = Math.cos(fallenTree.fallDirAngle);
                    const midX = fallenTree.x + dirX * (fallenTree.trunkH * 0.45);
                    const midZ = fallenTree.z + dirZ * (fallenTree.trunkH * 0.45);
                    w.task = { type: 'buck-tree', forestryTree: fallenTree, lookX: midX, lookZ: midZ, duration: 1.25, subPhase: 'work' };
                    setDest(w, midX - dirZ * 0.75, midZ + dirX * 0.75);
                    setWorkerTool(w.rig, 'axe');
                    w.rig.setBadge('🪓');
                    w.statusText = 'Partindo tronco caído em 4 toras';
                    return true;
                }

                const leftoverStump = fState.trees.find(tr => tr.status === 'bucked' && !tr.stumpRemoved && !tr.res);
                if (leftoverStump) {
                    leftoverStump.res = true;
                    w.task = { type: 'remove-stump', forestryTree: leftoverStump, duration: 1.15, subPhase: 'work' };
                    setDest(w, leftoverStump.x + 0.65, leftoverStump.z + 0.35);
                    setWorkerTool(w.rig, 'axe');
                    w.rig.setBadge('🧹');
                    w.statusText = 'Destocando terreno florestal';
                    return true;
                }

                const standingPhysical = fState.trees.find(tr => tr.status === 'standing' && !tr.res);
                if (standingPhysical) {
                    standingPhysical.res = true;
                    w.task = { type: 'harvest-wood', forestryTree: standingPhysical, duration: 1.45, subPhase: 'work' };
                    setDest(w, standingPhysical.x + 0.72, standingPhysical.z + 0.45);
                    setWorkerTool(w.rig, 'axe');
                    w.rig.setBadge('🪓');
                    w.statusText = 'Derrubando árvore com machado';
                    return true;
                }
            }

            const sawmill = state.city && state.city.structures.find(st => st.kind === 'lumberyard' && st.built);
            const ecoWood = state.economy ? state.economy.wood : 0;
            // Se há Serraria construída e madeira em estoque suficiente (ou carpinteiro dedicado), beneficia toras em tábuas/receita!
            if (sawmill && (w.role === 'carpenter' || (ecoWood >= 4 && ((w._sawTurn || 0) % 2 === 1)))) {
                w._sawTurn = (w._sawTurn || 0) + 1;
                w.task = { type: 'work-lumberyard', cityStruct: sawmill, duration: 1.35, subPhase: 'work' };
                setDest(w, sawmill.x, sawmill.z + 1.05);
                setWorkerTool(w.rig, 'saw');
                w.rig.setBadge('🪚');
                w.statusText = 'Beneficiando toras na Serraria';
                return true;
            }
            if ((w.role === 'lumberjack' || w.specialty === 'lumberjack') && (!fState || fState.autoMode)) {
                const trees = MO.chunkManager ? MO.chunkManager.getLoadedResourceNodes('wood').filter(n => !n.res) : [];
                if (trees.length > 0) {
                    w._sawTurn = (w._sawTurn || 0) + 1;
                    w._replantTurn = (w._replantTurn || 0) + 1;
                    trees.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
                    const node = trees[0];
                    node.res = true;
                    w.task = { type: 'harvest-wood', resourceNode: node, duration: 1.45, subPhase: 'work' };
                    setDest(w, node.x + 0.72, node.z + 0.45);
                    setWorkerTool(w.rig, 'axe');
                    w.rig.setBadge('🪓');
                    w.statusText = 'Cortando árvore na floresta';
                    return true;
                }
            }
        }

        if (w.role === 'miner' || w.specialty === 'miner') {
            const mm = MO.miningManager;
            const mState = mm ? mm.state : null;

            // 1. Se já carrega pedra bruta, leva para montar ou processar no Britador
            if (mm && mState && w.miningCarry === 'rawChunk') {
                const cr = mState.crusher;
                if (cr.placed && !cr.built) {
                    const nextP = mm.getNextCrusherPiece();
                    if (nextP) {
                        w.task = { type: 'build-crusher-piece', piece: nextP, duration: 0.72, subPhase: 'work' };
                        setDest(w, cr.x + 0.15, cr.z + 1.0);
                        setWorkerTool(w.rig, 'chunk');
                        w.rig.setBadge('⚙️');
                        w.statusText = `Montando Britador: ${nextP.name}`;
                        return true;
                    }
                }
                if (cr.placed && cr.built && (cr.busyWorkerId === null || cr.busyWorkerId === w.id)) {
                    cr.busyWorkerId = w.id;
                    w.task = { type: 'process-crusher', duration: 1.15, subPhase: 'work' };
                    setDest(w, cr.x + 0.15, cr.z + 1.0);
                    setWorkerTool(w.rig, 'chunk');
                    w.rig.setBadge('⚙️');
                    w.statusText = 'Lapidando pedra na Serra Diamantada';
                    return true;
                }
                // Sem Britador ainda: entrega direto ao estoque da cidade
                const info = mm.ORE_TYPES[w.miningCarryOre] || mm.ORE_TYPES.granite;
                w.miningCarry = null;
                if (MO.cityManager) MO.cityManager.addResources({ stone: info.stoneGrant, iron: info.ironGrant });
            }

            // 2. Se já carrega bloco talhado / lingote, monta a Fundição ou expõe nos 12 slots
            if (mm && mState && w.miningCarry === 'cutBlock') {
                const dp = mState.depot;
                if (dp.placed && !dp.completed) {
                    const nextP = mm.getNextDepotPiece();
                    if (nextP) {
                        w.task = { type: 'build-depot-piece', piece: nextP, lookX: nextP.worldX, lookZ: nextP.worldZ, duration: 0.68, subPhase: 'work' };
                        setDest(w, nextP.worldX + 0.75, nextP.worldZ + 0.75);
                        setWorkerTool(w.rig, 'stone-block');
                        w.rig.setBadge('🏛️');
                        w.statusText = `Erguendo Fundição: ${nextP.name}`;
                        return true;
                    }
                }
                if (dp.placed && dp.completed && dp.displayedMinerals.length < mm.MAX_DISPLAY_ITEMS) {
                    w.task = { type: 'deliver-depot-display', duration: 0.45, subPhase: 'work' };
                    setDest(w, dp.x - 0.55, dp.z + 1.98);
                    setWorkerTool(w.rig, 'stone-block');
                    w.rig.setBadge('💎');
                    w.statusText = 'Expondo minério na Fundição';
                    return true;
                }
                w.miningCarry = null;
                if (MO.cityManager) MO.cityManager.addResources({ stone: 2, iron: 1 });
            }

            // 3. Fluxo físico autônomo do Minerador: Pedaços no chão -> Entulho -> Rochas físicas -> Chunks
            if (mm && mState && mState.autoMode) {
                const freeChunk = mState.groundChunks.find(c => !c.picked && !c.res && c.grounded);
                if (freeChunk) {
                    freeChunk.res = true;
                    w.task = { type: 'haul-chunk', miningChunk: freeChunk, duration: 0.35, subPhase: 'pickup' };
                    setDest(w, freeChunk.x, freeChunk.z);
                    setWorkerTool(w.rig, 'none');
                    w.rig.setBadge('🪨');
                    w.statusText = 'Recolhendo pedra fraturada';
                    return true;
                }

                const rubble = mState.rocks.find(r => r.status === 'rubble' && !r.rubbleCleared && !r.res);
                if (rubble) {
                    rubble.res = true;
                    w.task = { type: 'clear-rubble', miningRock: rubble, duration: 0.95, subPhase: 'work' };
                    setDest(w, rubble.x + 0.72, rubble.z + 0.35);
                    setWorkerTool(w.rig, 'hoe');
                    w.rig.setBadge('🧹');
                    w.statusText = 'Limpando entulho da pedreira';
                    return true;
                }

                const intactPhys = mState.rocks.find(r => r.status === 'intact' && !r.res);
                if (intactPhys) {
                    intactPhys.res = true;
                    w.task = { type: 'harvest-ore', miningRock: intactPhys, duration: 1.45, subPhase: 'work' };
                    setDest(w, intactPhys.x + 0.95, intactPhys.z + 0.55);
                    setWorkerTool(w.rig, 'pickaxe');
                    w.rig.setBadge('⛏️');
                    w.statusText = `Minerando ${(mm.ORE_TYPES[intactPhys.oreKey] || mm.ORE_TYPES.granite).name}`;
                    return true;
                }
            }

            if (!mState || mState.autoMode) {
                const ores = MO.chunkManager
                    ? MO.chunkManager.getLoadedResourceNodes().filter(n => !n.res && (n.kind === 'mine' || n.kind === 'stone' || n.kind === 'iron'))
                    : [];
                if (ores.length > 0) {
                    ores.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
                    const node = ores[0];
                    node.res = true;
                    w.task = { type: 'harvest-ore', resourceNode: node, duration: 1.40, subPhase: 'work' };
                    setDest(w, node.x + 0.85, node.z + 0.55);
                    setWorkerTool(w.rig, 'pickaxe');
                    w.rig.setBadge('⛏️');
                    w.statusText = node.kind === 'mine'
                        ? 'Minerando caverna natural'
                        : (node.kind === 'iron' ? 'Minerando minério de ferro' : 'Extraindo pedra natural');
                    return true;
                }
                const mine = state.city && state.city.structures.find(st => st.kind === 'mine' && st.built);
                if (mine) {
                    w.task = { type: 'harvest-ore', cityStruct: mine, duration: 1.3, subPhase: 'work' };
                    setDest(w, mine.x, mine.z + 1.0);
                    setWorkerTool(w.rig, 'pickaxe');
                    w.rig.setBadge('⛏️');
                    w.statusText = 'Trabalhando na mina da cidade';
                    return true;
                }
            }
        }

        if (w.role === 'farmer' || w.specialty === 'farmer') {
            const ag = MO.farmingManager;
            const agState = ag ? ag.state : null;

            // 1. Se já carrega cesto colhido, leva para montar ou embalar na Bancada de Triagem
            if (ag && agState && w.farmingCarry === 'rawCrop') {
                const bn = agState.bench;
                if (bn.placed && !bn.built) {
                    const nextP = ag.getNextBenchPiece();
                    if (nextP) {
                        w.task = { type: 'build-bench-piece', piece: nextP, duration: 0.72, subPhase: 'work' };
                        setDest(w, bn.x + 0.15, bn.z + 1.0);
                        setWorkerTool(w.rig, 'basket');
                        w.rig.setBadge('🧺');
                        w.statusText = `Montando Triagem: ${nextP.name}`;
                        return true;
                    }
                }
                if (bn.placed && bn.built && (bn.busyWorkerId === null || bn.busyWorkerId === w.id)) {
                    bn.busyWorkerId = w.id;
                    w.task = { type: 'pack-bench', duration: 1.05, subPhase: 'work' };
                    setDest(w, bn.x + 0.15, bn.z + 1.0);
                    setWorkerTool(w.rig, 'basket');
                    w.rig.setBadge('🧺');
                    w.statusText = 'Embalando colheita na Bancada de Triagem';
                    return true;
                }
                const info = ag.CROP_CATALOG[w.farmingCarryCrop] || ag.CROP_CATALOG.wheat;
                w.farmingCarry = null;
                if (MO.cityManager) MO.cityManager.addResources({ food: info.foodGrant });
            }

            // 2. Se já carrega caixote embalado, ergue o Celeiro ou expõe na Feira
            if (ag && agState && w.farmingCarry === 'packedCrate') {
                const br = agState.barn;
                if (br.placed && !br.completed) {
                    const nextP = ag.getNextBarnPiece();
                    if (nextP) {
                        w.task = { type: 'build-barn-piece', piece: nextP, lookX: nextP.worldX, lookZ: nextP.worldZ, duration: 0.68, subPhase: 'work' };
                        setDest(w, nextP.worldX + 0.75, nextP.worldZ + 0.75);
                        setWorkerTool(w.rig, 'crate');
                        w.rig.setBadge('🏡');
                        w.statusText = `Erguendo Celeiro: ${nextP.name}`;
                        return true;
                    }
                }
                if (br.placed && br.completed && br.displayedCrates.length < ag.MAX_DISPLAY_CRATES) {
                    w.task = { type: 'deliver-barn-display', duration: 0.45, subPhase: 'work' };
                    setDest(w, br.x - 0.55, br.z + 1.98);
                    setWorkerTool(w.rig, 'crate');
                    w.rig.setBadge('🧺');
                    w.statusText = 'Expondo caixote na Feira Agrícola';
                    return true;
                }
                w.farmingCarry = null;
                if (MO.cityManager) MO.cityManager.addResources({ food: 3 });
            }

            // 3. Fluxo autônomo da Lavoura Contígua: Cestos -> Poço -> Blocos da lavoura
            if (ag && agState && agState.autoMode) {
                const freeBundle = agState.harvestBundles.find(b => !b.picked && !b.res && b.grounded);
                if (freeBundle) {
                    freeBundle.res = true;
                    w.task = { type: 'haul-harvest', farmBundle: freeBundle, duration: 0.35, subPhase: 'pickup' };
                    setDest(w, freeBundle.x, freeBundle.z);
                    setWorkerTool(w.rig, 'none');
                    w.rig.setBadge('🧺');
                    w.statusText = 'Recolhendo cesto da colheita';
                    return true;
                }

                if (agState.well.placed && !agState.well.built) {
                    w.task = { type: 'build-well-piece', duration: 0.80, subPhase: 'work' };
                    setDest(w, agState.well.x, agState.well.z + 1.0);
                    setWorkerTool(w.rig, 'hammer');
                    w.rig.setBadge('🪣');
                    w.statusText = 'Construindo Poço d\'Água';
                    return true;
                }

                const priority = ['ripe', 'seeded', 'tilled', 'cleared', 'overgrown'];
                for (let pIdx = 0; pIdx < priority.length; pIdx++) {
                    const targetStatus = priority[pIdx];
                    const candidates = agState.plots.filter(p => p.status === targetStatus && !p.res);
                    if (candidates.length > 0) {
                        candidates.sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
                        const plot = candidates[0];
                        if (targetStatus === 'seeded' && agState.well.built && !w.hasWaterInCan) {
                            plot.res = true;
                            w.task = { type: 'fetch-water', farmPlot: plot, duration: 0.65, subPhase: 'work' };
                            setDest(w, agState.well.x, agState.well.z + 1.0);
                            setWorkerTool(w.rig, 'can');
                            w.rig.setBadge('💧');
                            w.statusText = 'Enchendo regador no Poço';
                            return true;
                        }
                        plot.res = true;
                        const cfgMap = {
                            overgrown: { type: 'farm-clear', tool: 'hoe', badge: '🌿', txt: 'Capinando lavoura' },
                            cleared:   { type: 'farm-till',  tool: 'hoe', badge: '🚜', txt: 'Arando solo em sulcos' },
                            tilled:    { type: 'farm-sow',   tool: 'none', badge: '🌱', txt: 'Semeando cultura' },
                            seeded:    { type: 'farm-water', tool: 'can', badge: '💧', txt: 'Irrigando lavoura' },
                            ripe:      { type: 'farm-harvest', tool: 'sickle', badge: '🌾', txt: 'Colhendo lavoura com foice' }
                        };
                        const cfg = cfgMap[targetStatus];
                        w.task = { type: cfg.type, farmPlot: plot, duration: 0.85, subPhase: 'work' };
                        setDest(w, plot.x, plot.z + 0.85);
                        setWorkerTool(w.rig, cfg.tool);
                        w.rig.setBadge(cfg.badge);
                        w.statusText = cfg.txt;
                        return true;
                    }
                }
            }

            const farm = state.city && state.city.structures.find(st => st.kind === 'farm' && st.built);
            if (farm) {
                w.task = { type: 'work-farm', cityStruct: farm, duration: 1.35, subPhase: 'work' };
                setDest(w, farm.x, farm.z + 0.9);
                setWorkerTool(w.rig, 'hoe');
                w.rig.setBadge('🌾');
                w.statusText = 'Cultivando colheita na fazenda';
                return true;
            }
        }

        if (w.role === 'merchant' || w.specialty === 'merchant') {
            const market = state.city && state.city.structures.find(st => st.kind === 'market' && st.built);
            const target = market || MO.STATION_UNLOAD || MO.STATION_TOOLBOX;
            w.task = { type: 'work-market', cityStruct: market || null, duration: 1.5, subPhase: 'work' };
            setDest(w, target.x, target.z + 0.95);
            setWorkerTool(w.rig, 'clipboard');
            w.rig.setBadge('🪙');
            w.statusText = market ? 'Comercializando no mercado' : 'Negociando entregas na cidade';
            return true;
        }
        return false;
    }

    function assignWorkerTask(w, t) {
        const state = MO.state;
        const { setWorkerTool, setBodyVisible } = MO.workerFactory;
        const { assignCampOrLifeTask } = MO.workerNeeds;

        setWorkerTool(w.rig, 'none');
        w.rig.torsoPivot.rotation.x = 0;
        w.rig.setBadge('');
        setBodyVisible(w, true);
        w.sleepingInside = false;

        if (assignCampOrLifeTask(w, setDestination, setWorkerTool, t, false)) return;

        if (tryAssignSupervisorTask(w, setDestination, setWorkerTool)) return;
        if (tryAssignProfessionTask(w, setDestination, setWorkerTool)) return;
        if (tryAssignInfrastructureTask(w, setDestination, setWorkerTool)) return;

        const isPlayerDriven = Boolean(state.cityMode && state.city && state.city.playerDriven);
        if (!isPlayerDriven && state.unifiedVillage && state.villageInfra && !state.villageInfra.demarcated) {
            assignCampOrLifeTask(w, setDestination, setWorkerTool, t, true);
            return;
        }

        if (trySawWoodAtWorkbench(w, setDestination, setWorkerTool)) return;

        if (state.phase === 0) {
            const wd = state.weeds.find(item => !item.cleared && !item.res);
            if (wd) {
                wd.res = true;
                w.task = { type: 'weed', weed: wd, duration: 0.48, subPhase: 'work' };
                setDestination(w, wd.x, wd.z);
                w.statusText = 'Capinando mato do terreno';
                setWorkerTool(w.rig, 'hoe');
                return;
            }
            const lt = state.levelTargets.find(item => !item.done && !item.res);
            if (lt) {
                lt.res = true;
                w.task = { type: 'level-spot', spot: lt, duration: 0.46, subPhase: 'work' };
                setDestination(w, lt.x, lt.z);
                w.statusText = 'Terraplanando lote';
                setWorkerTool(w.rig, 'hoe');
                return;
            }
        }

        if (!isPlayerDriven && state.unifiedVillage && state.villageInfra && (!state.villageInfra.roadBuilt || !state.villageInfra.mixerBuilt || !state.villageInfra.workbenchBuilt)) {
            assignCampOrLifeTask(w, setDestination, setWorkerTool, t, true);
            return;
        }

        if (tryStartConcreteSupplyOrMix(w)) return;

        const modePlugin = MO.modes[state.mode];
        if (modePlugin && modePlugin.assignWorkerTask) {
            if (modePlugin.assignWorkerTask(w, setWorkerTool)) {
                if (w.task) {
                    if (wrapTaskWithRealLogistics(w)) return;
                }
            }
        }

        if (state.site.truckActive) {
            if (assignCampOrLifeTask(w, setDestination, setWorkerTool, t, false)) return;
        }
        if (isPlayerDriven && w.role !== 'supervisor' && !MO.constructionManager?.getActiveConstruction?.() && (!state.city || state.city.structures.length === 0)) {
            const tb = MO.STATION_TOOLBOX || { x: -2.2, z: 2.0 };
            const scoutPts = [
                { x: tb.x + 2.2, z: tb.z + 0.6 },
                { x: tb.x - 1.8, z: tb.z - 2.1 },
                { x: tb.x + 1.4, z: tb.z - 1.6 }
            ];
            const sp = scoutPts[(w._scoutStep || 0) % scoutPts.length];
            w._scoutStep = (w._scoutStep || 0) + 1;
            w.task = { type: 'survey-area', duration: 1.75, subPhase: 'work' };
            setDestination(w, sp.x, sp.z);
            setWorkerTool(w.rig, 'clipboard');
            w.rig.setBadge('📐');
            w.statusText = 'Fazendo reconhecimento inicial do terreno';
            return;
        }
        assignCampOrLifeTask(w, setDestination, setWorkerTool, t, true);
    }

    MO.workerTasks = {
        releaseTaskReservations,
        setDestination,
        tryStartConcreteSupplyOrMix,
        trySawWoodAtWorkbench,
        tryAssignSupervisorTask,
        tryAssignInfrastructureTask,
        wrapTaskWithRealLogistics,
        assignWorkerTask
    };
})(window.MO = window.MO || {});

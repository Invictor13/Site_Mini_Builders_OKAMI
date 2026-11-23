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
        if (tk.type === 'saw-wood' && MO.state.workbench) MO.state.workbench.busyWorkerId = null;
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

        if (tk.type === 'brick' || tk.type === 'muro') {
            const brick = state.looseBricks.find(b => !b.placed && !b.res);
            if (!brick) {
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
            if (!isSteelBeam && state.unifiedVillage && state.villageInfra && state.villageInfra.workbenchBuilt && state.workbench) {
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
                if (state.villageInfra.roadBuilt && state.villageInfra.unloadingBuilt && MO.requestSupplyTruck) {
                    MO.requestSupplyTruck('wood');
                }
                return false;
            }
            const wantKind = isSteelBeam ? 'beam' : 'plank';
            const beam = state.looseBeams.find(b => !b.used && !b.res && b.kind === wantKind)
                      || state.looseBeams.find(b => !b.used && !b.res);
            if (!beam) {
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
        if (!infra || !infra.demarcated) return false;

        const seg = infra.roadSegments.find(s => !s.built && !s.res && (s.bank === 'west' || infra.bridgeUnlocked));
        if (seg) {
            seg.res = true;
            w.task = { type: 'build-road', roadSeg: seg, duration: 0.42, subPhase: 'work' };
            setDest(w, seg.x, seg.z);
            setWorkerTool(w.rig, 'hoe');
            w.rig.setBadge('🛣️');
            w.statusText = 'Abrindo estrada de terra para entregas';
            return true;
        }

        if (!infra.unloadingBuilt && !infra.unloadingRes) {
            infra.unloadingRes = true;
            w.task = { type: 'build-unloading', duration: 0.55, subPhase: 'work' };
            setDest(w, MO.STATION_UNLOAD.x, MO.STATION_UNLOAD.z + 0.9);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🚚');
            w.statusText = 'Construindo baia de descarga dos caminhões';
            return true;
        }

        if (!infra.mixerBuilt && !infra.mixerRes) {
            infra.mixerRes = true;
            w.task = { type: 'build-mixer', duration: 0.56, subPhase: 'work' };
            setDest(w, MO.STATION_MIXER.x, MO.STATION_MIXER.z + 0.9);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🧱');
            w.statusText = 'Montando masseira e pátio de massa';
            return true;
        }

        if (!infra.workbenchBuilt && !infra.workbenchRes) {
            infra.workbenchRes = true;
            w.task = { type: 'build-workbench', duration: 0.60, subPhase: 'work' };
            setDest(w, MO.STATION_WORKBENCH.x, MO.STATION_WORKBENCH.z + 0.85);
            setWorkerTool(w.rig, 'hammer');
            w.rig.setBadge('🪚');
            w.statusText = 'Construindo bancada de corte de madeira';
            return true;
        }

        if (!infra.yardsBuilt && !infra.yardsRes) {
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
        if (tryAssignInfrastructureTask(w, setDestination, setWorkerTool)) return;

        if (state.unifiedVillage && state.villageInfra && !state.villageInfra.demarcated) {
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

        if (state.unifiedVillage && state.villageInfra && (!state.villageInfra.roadBuilt || !state.villageInfra.mixerBuilt || !state.villageInfra.workbenchBuilt)) {
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

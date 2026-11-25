// =========================================================================
// ENTITIES / WORKERS: LOCOMOÇÃO, ANIMAÇÃO DE AÇÕES & EXECUÇÃO DO AGENTE NPC
// =========================================================================
(function(MO) {
    function updateHeadgearAndWeatherFX(w, state) {
        const headlampOn = state.isNight && !w.sleepingInside;
        w.rig.headlampLensMat.emissiveIntensity = headlampOn ? 2.2 : 0.0;
        w.rig.headlampCone.visible = headlampOn;
        w.rig.headlampConeMat.opacity = headlampOn ? 0.13 : 0.0;
        w.rig.headlampLight.intensity = headlampOn ? 1.05 : 0.0;
        w.rig.rainPoncho.visible = state.weather === 'rain' && !w.sleepingInside;
    }

    function stepMovement(w, dt, t, isDarkSite) {
        const pos = w.rig.group.position;
        let goalX = w.tx;
        let goalZ = w.tz;
        if (w.waypoints && w.waypoints.length > 0) {
            goalX = w.waypoints[0].x;
            goalZ = w.waypoints[0].z;
            if (Math.hypot(goalX - pos.x, goalZ - pos.z) < 0.34 && w.waypoints.length > 1) {
                w.waypoints.shift();
                goalX = w.waypoints[0].x;
                goalZ = w.waypoints[0].z;
            }
        }

        const dx = goalX - pos.x;
        const dz = goalZ - pos.z;
        const distToGoal = Math.hypot(w.tx - pos.x, w.tz - pos.z);
        const distStepTarget = Math.hypot(dx, dz);

        const levelMult = 1 + ((w.level || 1) - 1) * 0.08;
        const moraleMult = (w.morale ?? 82) < 45 ? 0.86 : ((w.morale ?? 82) > 82 ? 1.07 : 1.0);
        const fatigueMult = w.energy < 25 ? 0.82 : (w.energy > 75 ? 1.08 : 0.98);
        const lifeSpeedMult = (isDarkSite && w.task.type !== 'build-floodlight' ? 0.76 : fatigueMult) * levelMult * moraleMult;
        const arrivalThreshold = (w.stuckTimer > 2.2) ? 1.05 : 0.42;

        if (distToGoal <= arrivalThreshold || distStepTarget <= 0.05) {
            return false;
        }

        const prevX = pos.x;
        const prevZ = pos.z;
        const step = Math.min(distStepTarget, w.speed * lifeSpeedMult * dt);
        const rawNx = pos.x + (dx / distStepTarget) * step;
        const rawNz = pos.z + (dz / distStepTarget) * step;

        const resolved = MO.resolveWorkerPhysics ? MO.resolveWorkerPhysics(w, rawNx, rawNz) : { x: rawNx, z: rawNz };
        pos.x = resolved.x;
        pos.z = resolved.z;

        const actualMoved = Math.hypot(pos.x - prevX, pos.z - prevZ);
        if (actualMoved < step * 0.25) {
            w.stuckTimer += dt;
            if (Math.abs(w.stuckTimer - 1.2) < dt && MO.computeWorkerPath) {
                w.waypoints = MO.computeWorkerPath(w, pos.x, pos.z, w.tx, w.tz);
            }
            if (w.stuckTimer > 4.5 && distToGoal > 1.05) {
                MO.workerTasks.releaseTaskReservations(w.task);
                MO.workerFactory.setWorkerTool(w.rig, 'none');
                w.task = null;
                w.stuckTimer = 0;
                return true;
            }
        } else {
            w.stuckTimer = Math.max(0, w.stuckTimer - dt);
        }

        const yaw = Math.atan2(dx, dz);
        w.rig.group.rotation.y = yaw;
        w.rig.torsoPivot.rotation.x = w.energy < 25 ? 0.22 : 0.08;
        const cyc = Math.sin(t * 14 + w.id * 2);
        w.rig.legL.rotation.x = cyc * 0.62;
        w.rig.legR.rotation.x = -cyc * 0.62;

        const carrying = w.rig.carryBrick.visible || w.rig.carryPlank.visible || (w.rig.carryLog && w.rig.carryLog.visible) ||
            (w.rig.carryChunk && w.rig.carryChunk.visible) || (w.rig.carryStoneBlock && w.rig.carryStoneBlock.visible) ||
            (w.rig.carryBasket && w.rig.carryBasket.visible) || (w.rig.carryCrate && w.rig.carryCrate.visible) || w.rig.carryBeam.visible ||
            w.rig.carryBucket.visible || w.rig.carrySack.visible || w.rig.carryRebar.visible || w.rig.carryWheelbarrow.visible;
        w.rig.armL.rotation.x = carrying ? -1.05 : -cyc * 0.45;
        w.rig.armR.rotation.x = carrying ? -1.05 : cyc * 0.45;
        pos.y = Math.max(MO.WATER_LEVEL + 0.05, MO.getTerrainHeight(pos.x, pos.z)) + Math.abs(cyc) * 0.032;

        w.stepDist += actualMoved;
        if (w.stepDist > 0.40 && MO.spawnGroundTrack) {
            w.stepDist = 0;
            w.stepSide *= -1;
            const sideX = pos.x + Math.cos(yaw) * 0.075 * w.stepSide;
            const sideZ = pos.z - Math.sin(yaw) * 0.075 * w.stepSide;
            MO.spawnGroundTrack(sideX, sideZ, 'boot', yaw);
        }
        return true;
    }

    function handlePickupSubPhase(w, tk, dt) {
        const { setWorkerTool } = MO.workerFactory;
        const { setDestination } = MO.workerTasks;

        w.timer += dt;
        w.rig.legL.rotation.x = 0;
        w.rig.legR.rotation.x = 0;
        w.rig.torsoPivot.rotation.x = 0.42;
        w.rig.armL.rotation.x = -1.1;
        w.rig.armR.rotation.x = -1.1;

        if (w.timer < 0.22) return;
        w.timer = 0;

        if (tk.type === 'haul-log') {
            if (tk.forestryLog && MO.forestryManager) {
                MO.forestryManager.consumeGroundLog(tk.forestryLog);
                w.forestryCarry = 'rawLog';
                w.forestryCarrySpecies = tk.forestryLog.species || 'pine';
                if (MO.SoundFX && MO.SoundFX.playAxeChop) MO.SoundFX.playAxeChop();
            }
            setWorkerTool(w.rig, 'log');
            w.task = null;
            w.statusText = 'Carregando tora para a Bancada';
            return;
        }

        if (tk.type === 'haul-chunk') {
            if (tk.miningChunk && MO.miningManager) {
                MO.miningManager.consumeGroundChunk(tk.miningChunk);
                w.miningCarry = 'rawChunk';
                w.miningCarryOre = tk.miningChunk.oreKey || 'granite';
                if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
            }
            setWorkerTool(w.rig, 'chunk');
            w.task = null;
            w.statusText = 'Carregando pedra bruta para o Britador';
            return;
        }

        if (tk.type === 'haul-harvest') {
            if (tk.farmBundle && MO.farmingManager) {
                MO.farmingManager.consumeHarvestBundle(tk.farmBundle);
                w.farmingCarry = 'rawCrop';
                w.farmingCarryCrop = tk.farmBundle.cropKey || 'wheat';
                if (MO.SoundFX && MO.SoundFX.playPackCrate) MO.SoundFX.playPackCrate();
            }
            setWorkerTool(w.rig, 'basket');
            w.task = null;
            w.statusText = 'Levando cesto para a Triagem';
            return;
        }

        if (tk.type === 'feed-mixer') {
            if (tk.pickedSupply) {
                tk.pickedSupply.consumed = true;
                tk.pickedSupply.mesh.visible = false;
            }
            tk.subPhase = 'deliver';
            setWorkerTool(w.rig, 'sack');
            setDestination(w, tk.deliverX, tk.deliverZ);
            w.statusText = 'Levando insumo até a masseira';
            return;
        }

        if (tk.pickedBrick) {
            tk.pickedBrick.placed = true;
            tk.pickedBrick.mesh.visible = false;
            tk.pickedBrick.res = false;
        }
        if (tk.pickedRebar) {
            tk.pickedRebar.installed = true;
            tk.pickedRebar.mesh.visible = false;
            tk.pickedRebar.res = false;
        }
        if (tk.pickedBeam) {
            tk.pickedBeam.used = true;
            tk.pickedBeam.mesh.visible = false;
            tk.pickedBeam.res = false;
        }
        if (tk.needsCutWood) {
            if (MO.consumeCutWood) MO.consumeCutWood(1);
            tk.needsCutWood = false;
        }
        if (tk.needsBucketFill) {
            MO.fillBucketFromMixer();
            tk.needsBucketFill = false;
        }

        tk.subPhase = 'deliver';
        setWorkerTool(w.rig, tk.carryTool || 'none');
        setDestination(w, tk.deliverX, tk.deliverZ, tk.wallTarget);
        w.rig.setBadge('');
        w.statusText = tk.type === 'rebar'
            ? 'Carregando armadura até o buraco'
            : (tk.carryTool === 'brick' ? 'Levando tijolo até a parede' : 'Transportando carga até a obra');
    }

    function animateTaskExecution(w, tk, dt, t) {
        const state = MO.state;
        const pos = w.rig.group.position;
        const { stationGroup, hoeGroup, mixerFillMat, mixerBarGroup, mixerBarFill } = MO.mixer;
        const { setWorkerTool, setBodyVisible } = MO.workerFactory;

        // Bônus real de produtividade por Nível, Moral e Coordenação do Supervisor próximo (+18%)
        let speedBonus = 1 + ((w.level || 1) - 1) * 0.08;
        if ((w.morale ?? 82) >= 85) speedBonus *= 1.08;
        if (w.role !== 'supervisor' && Array.isArray(state.workers)) {
            const sup = state.workers.find(o => o.role === 'supervisor' && !o.sleepingInside && o.rig && o.rig.group);
            if (sup && Math.hypot(sup.rig.group.position.x - pos.x, sup.rig.group.position.z - pos.z) < 5.5) {
                speedBonus *= 1.18;
            }
        }
        w.timer += dt * speedBonus;
        w.subTimer += dt;
        w.rig.legL.rotation.x = 0;
        w.rig.legR.rotation.x = 0;
        const dur = tk.duration || 0.46;

        if (tk.type === 'sleep-tent') {
            w.sleepingInside = true;
            setBodyVisible(w, false);
            if (tk.tent) tk.tent.occupiedBy = w.id;
            w.rig.setBadge('💤');
            w.statusText = 'Dormindo na barraca';
            if (state.camp.nightMode === 'sleep' && state.isNight) {
                w.timer = Math.min(w.timer, dur - 0.1);
            } else if (w.energy >= 98) {
                w.timer = dur;
            }
        } else if (tk.type === 'drink-water') {
            setWorkerTool(w.rig, 'cup');
            w.rig.torsoPivot.rotation.x = -0.08 + Math.sin(t * 7) * 0.06;
            w.rig.armR.rotation.x = -1.45 + Math.sin(t * 7) * 0.25;
            w.rig.armL.rotation.x = -0.2;
        } else if (tk.type === 'eat-meal' || tk.type === 'camp-hangout') {
            setWorkerTool(w.rig, 'lunch');
            w.rig.torsoPivot.rotation.x = 0.05;
            w.rig.armR.rotation.x = -1.05 + Math.sin(t * 6) * 0.28;
            w.rig.armL.rotation.x = -0.85;
        } else if (tk.type === 'shelter-rain') {
            w.rig.torsoPivot.rotation.x = Math.sin(t * 3) * 0.05;
            w.rig.armL.rotation.x = -0.6;
            w.rig.armR.rotation.x = -0.6;
        } else if (tk.type === 'social-chat' || tk.type === 'assist-peer' || tk.type === 'brief-crew') {
            if (tk.peer && tk.peer.rig && tk.peer.rig.group) {
                const pp = tk.peer.rig.group.position;
                w.rig.group.rotation.y = Math.atan2(pp.x - pos.x, pp.z - pos.z);
            }
            if (tk.type === 'brief-crew') setWorkerTool(w.rig, 'clipboard');
            w.rig.torsoPivot.rotation.x = 0.05 + Math.sin(t * 6) * 0.06;
            w.rig.armL.rotation.x = -0.45 + Math.sin(t * 5) * 0.25;
            w.rig.armR.rotation.x = -0.65 - Math.sin(t * 5) * 0.25;
        } else if (tk.type === 'visit-home' || tk.type === 'stroll-bridge' || tk.type === 'visit-market' || tk.type === 'stroll-village') {
            w.rig.torsoPivot.rotation.x = Math.sin(t * 2) * 0.04;
            w.rig.armL.rotation.x = -0.15 + Math.sin(t * 3) * 0.10;
            w.rig.armR.rotation.x = -0.15 - Math.sin(t * 3) * 0.10;
        } else if (tk.type === 'tend-garden' || tk.type === 'replant-tree' || tk.type === 'plant-sapling-spot') {
            const swing = Math.sin(t * 14);
            w.rig.torsoPivot.rotation.x = 0.42 + swing * 0.10;
            w.rig.armL.rotation.x = -0.82 + swing * 0.32;
            w.rig.armR.rotation.x = -0.85 - swing * 0.32;
            if (w.subTimer > 0.32) {
                w.subTimer = 0;
                if (MO.SoundFX && MO.SoundFX.playPlantDig) MO.SoundFX.playPlantDig();
                MO.spawnBurst(pos.x, pos.y + 0.14, pos.z, 0x4ade80, 4, 0.05);
            }
        } else if (tk.type === 'harvest-wood' || tk.type === 'buck-tree' || tk.type === 'remove-stump') {
            // Promove árvore instanciada do chunk para árvore física articulada assim que o machado encosta!
            if (tk.type === 'harvest-wood' && !tk.forestryTree && tk.resourceNode && MO.forestryManager) {
                tk.forestryTree = MO.forestryManager.promoteChunkTree(tk.resourceNode);
                tk.resourceNode = null;
            }
            setWorkerTool(w.rig, 'axe');
            const lx = tk.lookX !== undefined ? tk.lookX : (tk.forestryTree ? tk.forestryTree.x : w.tx);
            const lz = tk.lookZ !== undefined ? tk.lookZ : (tk.forestryTree ? tk.forestryTree.z : w.tz);
            w.rig.group.rotation.y = Math.atan2(lx - pos.x, lz - pos.z);
            const swing = Math.sin(t * 11.5);
            w.rig.torsoPivot.rotation.x = tk.type === 'remove-stump' ? 0.34 : 0.08;
            w.rig.torsoPivot.rotation.y = -swing * 0.28;
            w.rig.armR.rotation.x = -1.1 + swing * 1.1;
            w.rig.armL.rotation.x = -0.65 + swing * 0.45;
            if (w.subTimer > 0.36) {
                w.subTimer = 0;
                if (tk.forestryTree && MO.forestryManager) {
                    if (tk.type === 'harvest-wood') {
                        if (MO.forestryManager.applyAxeHitToTree(tk.forestryTree, pos.x, pos.z)) {
                            w.timer = dur;
                        }
                    } else if (tk.type === 'buck-tree') {
                        if (MO.forestryManager.applyBuckHitToTree(tk.forestryTree)) {
                            w.timer = dur;
                        }
                    } else if (tk.type === 'remove-stump') {
                        if (MO.forestryManager.applyStumpHit(tk.forestryTree)) {
                            w.timer = dur;
                        }
                    }
                } else {
                    if (MO.SoundFX && MO.SoundFX.playAxeChop) MO.SoundFX.playAxeChop();
                    MO.spawnBurst(lx, pos.y + 0.55, lz, 0xdcb57e, 5, 0.06);
                }
            }
        } else if (tk.type === 'craft-forestry-plank') {
            setWorkerTool(w.rig, 'saw');
            const sawMotion = Math.sin(t * 20);
            const targetX = tk.useWorkbench && MO.STATION_WORKBENCH ? MO.STATION_WORKBENCH.x : w.tx;
            const targetZ = tk.useWorkbench && MO.STATION_WORKBENCH ? MO.STATION_WORKBENCH.z : w.tz;
            w.rig.group.rotation.y = Math.atan2(targetX - pos.x, targetZ - pos.z);
            w.rig.torsoPivot.rotation.x = 0.22 + sawMotion * 0.06;
            w.rig.armL.rotation.x = -0.95;
            w.rig.armR.rotation.x = -1.15 + sawMotion * 0.48;
            const prog = Math.min(1, w.timer / dur);
            if (tk.useWorkbench && MO.animateWorkbenchSaw) MO.animateWorkbenchSaw(true, t, prog);
            if (w.subTimer > 0.24) {
                w.subTimer = 0;
                if (MO.SoundFX && MO.SoundFX.playWoodSaw) MO.SoundFX.playWoodSaw();
                MO.spawnBurst(targetX, pos.y + 0.78, targetZ, 0xe8c798, 5, 0.05);
            }
        } else if (tk.type === 'build-woodshop-piece' || tk.type === 'deliver-woodshop-display' || tk.type === 'build-crusher-piece' || tk.type === 'build-depot-piece' || tk.type === 'deliver-depot-display' || tk.type === 'build-well-piece' || tk.type === 'build-bench-piece' || tk.type === 'build-barn-piece' || tk.type === 'deliver-barn-display') {
            setWorkerTool(w.rig, 'hammer');
            if (tk.lookX !== undefined) w.rig.group.rotation.y = Math.atan2(tk.lookX - pos.x, tk.lookZ - pos.z);
            const hit = Math.sin(t * 18);
            w.rig.torsoPivot.rotation.x = 0.06;
            w.rig.armL.rotation.x = -0.8;
            w.rig.armR.rotation.x = -1.2 + hit * 0.85;
            if (w.subTimer > 0.28) {
                w.subTimer = 0;
                if (tk.type.includes('crusher') || tk.type.includes('depot')) {
                    if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
                } else {
                    MO.SoundFX.playHammerWood();
                }
            }
        } else if (tk.type === 'farm-clear' || tk.type === 'farm-till') {
            setWorkerTool(w.rig, 'hoe');
            if (tk.farmPlot) w.rig.group.rotation.y = Math.atan2(tk.farmPlot.x - pos.x, tk.farmPlot.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.28;
            w.rig.armR.rotation.x = -0.95 + Math.sin(t * 13) * 0.85;
            w.rig.armL.rotation.x = -0.7;
        } else if (tk.type === 'farm-sow') {
            setWorkerTool(w.rig, 'none');
            if (tk.farmPlot) w.rig.group.rotation.y = Math.atan2(tk.farmPlot.x - pos.x, tk.farmPlot.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.34;
            w.rig.armR.rotation.x = -0.7 + Math.sin(t * 15) * 0.45;
            w.rig.armL.rotation.x = -0.7 - Math.sin(t * 15) * 0.45;
        } else if (tk.type === 'fetch-water' || tk.type === 'farm-water') {
            setWorkerTool(w.rig, 'can');
            if (tk.farmPlot && tk.type === 'farm-water') w.rig.group.rotation.y = Math.atan2(tk.farmPlot.x - pos.x, tk.farmPlot.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.16;
            w.rig.armR.rotation.x = -0.88;
            if (tk.type === 'farm-water' && w.subTimer > 0.20 && tk.farmPlot) {
                w.subTimer = 0;
                MO.spawnBurst(tk.farmPlot.x + (Math.random() - 0.5) * 0.6, pos.y + 0.35, tk.farmPlot.z + (Math.random() - 0.5) * 0.6, 0x38bdf8, 3, 0.04);
            }
        } else if (tk.type === 'farm-harvest') {
            setWorkerTool(w.rig, 'sickle');
            if (tk.farmPlot) w.rig.group.rotation.y = Math.atan2(tk.farmPlot.x - pos.x, tk.farmPlot.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.30;
            w.rig.armR.rotation.x = -0.85;
            w.rig.armR.rotation.y = Math.sin(t * 16) * 0.75;
        } else if (tk.type === 'pack-bench') {
            setWorkerTool(w.rig, 'none');
            const bn = MO.farmingManager ? MO.farmingManager.state.bench : null;
            if (bn) w.rig.group.rotation.y = Math.atan2(bn.x - pos.x, bn.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.16;
            w.rig.armR.rotation.x = -0.95 + Math.sin(t * 16) * 0.35;
            w.rig.armL.rotation.x = -0.95 - Math.sin(t * 16) * 0.35;
            const prog = Math.min(1, w.timer / dur);
            if (MO.farmingManager) MO.farmingManager.animateBench(true, prog);
        } else if (tk.type === 'harvest-ore') {
            if (!tk.miningRock && tk.resourceNode && MO.miningManager) {
                tk.miningRock = MO.miningManager.promoteChunkRock(tk.resourceNode);
                tk.resourceNode = null;
            }
            setWorkerTool(w.rig, 'pickaxe');
            const lx = tk.miningRock ? tk.miningRock.x : (tk.cityStruct ? tk.cityStruct.x : w.tx);
            const lz = tk.miningRock ? tk.miningRock.z : (tk.cityStruct ? tk.cityStruct.z : w.tz);
            w.rig.group.rotation.y = Math.atan2(lx - pos.x, lz - pos.z);
            const swing = Math.sin(t * 11.5);
            w.rig.torsoPivot.rotation.x = 0.10;
            w.rig.torsoPivot.rotation.y = -swing * 0.28;
            w.rig.armR.rotation.x = -1.15 + swing * 1.15;
            w.rig.armL.rotation.x = -0.65 + swing * 0.50;
            if (w.subTimer > 0.36) {
                w.subTimer = 0;
                if (tk.miningRock && MO.miningManager) {
                    if (MO.miningManager.applyPickaxeHit(tk.miningRock)) {
                        w.timer = dur;
                    }
                } else {
                    if (MO.SoundFX && MO.SoundFX.playPickaxeClink) MO.SoundFX.playPickaxeClink();
                    MO.spawnBurst(lx, pos.y + 0.45, lz, 0xfef08a, 4, 0.08);
                }
            }
        } else if (tk.type === 'clear-rubble') {
            setWorkerTool(w.rig, 'hoe');
            const lx = tk.miningRock ? tk.miningRock.x : w.tx;
            const lz = tk.miningRock ? tk.miningRock.z : w.tz;
            w.rig.group.rotation.y = Math.atan2(lx - pos.x, lz - pos.z);
            w.rig.torsoPivot.rotation.x = 0.38;
            w.rig.armR.rotation.x = -0.9 + Math.sin(t * 13) * 0.65;
            w.rig.armL.rotation.x = -0.8;
            if (w.subTimer > 0.42) {
                w.subTimer = 0;
                if (tk.miningRock && MO.miningManager) {
                    if (MO.miningManager.applyRubbleHit(tk.miningRock)) {
                        w.timer = dur;
                    }
                }
            }
        } else if (tk.type === 'process-crusher') {
            setWorkerTool(w.rig, 'hammer');
            const cr = MO.miningManager ? MO.miningManager.state.crusher : null;
            if (cr) w.rig.group.rotation.y = Math.atan2(cr.x - pos.x, cr.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.16;
            w.rig.armL.rotation.x = -0.95;
            w.rig.armR.rotation.x = -1.1 + Math.sin(t * 17) * 0.38;
            const prog = Math.min(1, w.timer / dur);
            if (MO.miningManager) MO.miningManager.animateCrusher(true, dt, prog);
            if (w.subTimer > 0.22) {
                w.subTimer = 0;
                if (MO.SoundFX && MO.SoundFX.playStoneGrind) MO.SoundFX.playStoneGrind();
                if (cr) MO.spawnBurst(cr.x, pos.y + 0.95, cr.z, 0xfef08a, 5, 0.06);
            }
        } else if (tk.type === 'inspect-site' || tk.type === 'survey-area' || tk.type === 'demarcate-site' || tk.type === 'demarcate-east') {
            setWorkerTool(w.rig, 'clipboard');
            w.rig.torsoPivot.rotation.x = 0.10;
            w.rig.armL.rotation.x = -0.95;
            w.rig.armR.rotation.x = -0.3 + Math.sin(t * 5) * 0.15;
        } else if (tk.type === 'saw-wood' || tk.type === 'work-lumberyard') {
            setWorkerTool(w.rig, 'saw');
            const sawMotion = Math.sin(t * 22);
            const targetX = tk.cityStruct ? tk.cityStruct.x : MO.STATION_WORKBENCH.x;
            const targetZ = tk.cityStruct ? tk.cityStruct.z : MO.STATION_WORKBENCH.z;
            w.rig.group.rotation.y = Math.atan2(targetX - pos.x, targetZ - pos.z);
            w.rig.torsoPivot.rotation.x = 0.25 + sawMotion * 0.08;
            w.rig.armL.rotation.x = -0.95;
            w.rig.armR.rotation.x = -1.15 + sawMotion * 0.55;
            if (tk.type === 'saw-wood' && MO.animateWorkbenchSaw) MO.animateWorkbenchSaw(true, t);
            if (w.subTimer > 0.24) {
                w.subTimer = 0;
                if (MO.SoundFX && MO.SoundFX.playWoodSaw) MO.SoundFX.playWoodSaw();
                MO.spawnBurst(targetX, pos.y + 0.62, targetZ, 0xd6b078, 4, 0.04);
            }
        } else if (tk.type === 'feed-mixer') {
            w.rig.group.rotation.y = Math.atan2(MO.STATION_MIXER.x - pos.x, MO.STATION_MIXER.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.42;
            w.rig.armL.rotation.x = -1.35;
            w.rig.armR.rotation.x = -1.35;
        } else if (tk.type === 'rebar') {
            w.rig.torsoPivot.rotation.x = 0.30;
            w.rig.armL.rotation.x = -1.1 + (w.timer / dur) * 0.45;
            w.rig.armR.rotation.x = -1.1 + (w.timer / dur) * 0.45;
        } else if (tk.type === 'weed' || tk.type === 'level-spot' || tk.type === 'dig' || tk.type === 'tw-dig' || tk.type === 'build-road' || tk.type === 'work-farm') {
            const swing = Math.sin(t * 22);
            w.rig.torsoPivot.rotation.x = 0.35 + swing * 0.14;
            w.rig.armL.rotation.x = -0.85 + swing * 0.55;
            w.rig.armR.rotation.x = -0.95 + swing * 0.65;
            if (w.subTimer > 0.22) {
                w.subTimer = 0;
                const dustHex = tk.type === 'weed' || tk.type === 'work-farm' ? 0x4d7c0f : (tk.type === 'build-road' ? 0x8c7253 : 0x7a654d);
                MO.spawnBurst(pos.x, pos.y + 0.12, pos.z, dustHex, 4, 0.05);
            }
        } else if (tk.type === 'work-market') {
            setWorkerTool(w.rig, 'clipboard');
            w.rig.torsoPivot.rotation.x = 0.06;
            w.rig.armL.rotation.x = -0.85;
            w.rig.armR.rotation.x = -0.45 + Math.sin(t * 5) * 0.2;
        } else if (tk.type === 'mix-mortar') {
            w.rig.group.rotation.y = Math.atan2(MO.STATION_MIXER.x - pos.x, MO.STATION_MIXER.z - pos.z);
            const pushPull = Math.sin(t * 16);
            w.rig.torsoPivot.rotation.x = 0.28 + pushPull * 0.12;
            w.rig.armL.rotation.x = -0.9 + pushPull * 0.45;
            w.rig.armR.rotation.x = -0.9 + pushPull * 0.45;

            hoeGroup.visible = true;
            hoeGroup.position.x = Math.sin(t * 10) * 0.36;
            hoeGroup.position.z = Math.cos(t * 14) * 0.22;
            state.mixProgress = Math.min(100, (w.timer / dur) * 100);
            const r = state.mixProgress / 100;
            mixerFillMat.color.copy(new THREE.Color(0xc99a56)).lerp(new THREE.Color(0x5b636c), r);
            mixerBarGroup.visible = true;
            mixerBarFill.scale.x = Math.max(0.01, r);
            mixerBarFill.position.x = -0.52 * (1 - r);
            MO.updateMixerVisuals();

            if (w.subTimer > 0.24) {
                w.subTimer = 0;
                MO.SoundFX.playMixerScrape();
                MO.spawnBurst(stationGroup.position.x + hoeGroup.position.x, stationGroup.position.y + 0.30, stationGroup.position.z + hoeGroup.position.z, 0x94a3b8, 3, 0.04);
            }
        } else if (
            tk.type === 'fw' || tk.type === 'beam-fw' || tk.type === 'roof-stage' ||
            tk.type === 'fixture' || tk.type === 'br-coffer' || tk.type === 'br-pile' ||
            tk.type === 'br-girder' || tk.type === 'br-rail' || tk.type === 'bld-struct' ||
            tk.type === 'tw-scaf' || tk.type === 'tw-steel' || tk.type === 'tw-top' ||
            tk.type === 'build-tent' || tk.type === 'build-mess' || tk.type === 'build-floodlight' ||
            tk.type === 'build-unloading' || tk.type === 'build-mixer' || tk.type === 'build-workbench' || tk.type === 'build-yards' ||
            tk.type === 'build-city-struct'
        ) {
            setWorkerTool(w.rig, 'hammer');
            const hammerHit = Math.sin(t * 26);
            w.rig.torsoPivot.rotation.x = -0.10;
            w.rig.armL.rotation.x = -1.15;
            w.rig.armR.rotation.x = -1.25 + hammerHit * 0.55;
            if (w.subTimer > 0.25) {
                w.subTimer = 0;
                MO.SoundFX.playHammerWood();
                MO.spawnBurst(w.tx, pos.y + 0.65, w.tz, 0x9e744a, 3, 0.05);
            }
        } else {
            w.rig.torsoPivot.rotation.x = 0.18;
            w.rig.armL.rotation.x = -0.75 + Math.sin(t * 18) * 0.35;
            w.rig.armR.rotation.x = -0.75 - Math.sin(t * 18) * 0.35;
        }

        return w.timer >= dur;
    }

    function completeTask(w, tk) {
        const state = MO.state;
        const { hoeGroup, mixerBarGroup } = MO.mixer;
        const { setWorkerTool } = MO.workerFactory;
        const { setDestination } = MO.workerTasks;

        w.timer = 0;
        w.subTimer = 0;

        if (tk.type === 'feed-mixer') {
            MO.addIngredient(tk.supplyType);
            state.mixerWorkerBusy = false;
            if (state.sand === 3 && state.cement === 1 && state.water === 1) {
                state.mixerWorkerBusy = true;
                w.task = { type: 'mix-mortar', duration: 1.35, subPhase: 'work' };
                setDestination(w, MO.STATION_MIXER.x, MO.STATION_MIXER.z + 1.02);
                setWorkerTool(w.rig, 'hoe');
                w.rig.setBadge('🥄');
                w.statusText = 'Batendo massa na masseira';
                return;
            }
        } else if (!MO.workerNeeds.completeLifeTask(w, tk)) {
            if (tk.type === 'weed') {
                MO.clearWeedItem(tk.weed);
            } else if (tk.type === 'level-spot') {
                MO.paintLevelWeight(tk.spot.x, tk.spot.z, 1.85, 0.92);
                tk.spot.done = true;
                tk.spot.res = false;
                MO.updateTerrainGeometry();
                MO.SoundFX.playDirtShovel();
            } else if (tk.type === 'mix-mortar') {
                hoeGroup.visible = false;
                mixerBarGroup.visible = false;
                state.mixProgress = 100;
                state.mortarCharges = 12;
                state.sand = 0;
                state.cement = 0;
                state.water = 0;
                state.mixerWorkerBusy = false;
                MO.updateMixerVisuals();
                MO.SoundFX.playMortarSquish();
            } else if (tk.type === 'demarcate-site') {
                if (MO.worldManager && MO.worldManager.demarcateWestInfrastructure) MO.worldManager.demarcateWestInfrastructure();
                if (MO.worldManager && MO.worldManager.saveToStorage) MO.worldManager.saveToStorage();
                if (MO.SoundFX && MO.SoundFX.playRadioBlip) MO.SoundFX.playRadioBlip();
                if (MO.showToast) MO.showToast('📐 Supervisor demarcou estradas, baia, masseira, bancada e estoques!', '👷‍♂️');
            } else if (tk.type === 'demarcate-east') {
                if (MO.worldManager && MO.worldManager.demarcateEastRoads) MO.worldManager.demarcateEastRoads();
                if (MO.worldManager && MO.worldManager.saveToStorage) MO.worldManager.saveToStorage();
                if (MO.showToast) MO.showToast('📐 Supervisor demarcou o acesso do Banco Leste após a ponte!', '👷‍♂️');
            } else if (tk.type === 'build-road') {
                const seg = tk.roadSeg;
                if (seg) {
                    seg.built = true;
                    seg.res = false;
                    if (MO.paintRoadWeight) {
                        MO.paintRoadWeight(seg.x, seg.z, 1.35, 0.96, seg.kind || 'dirt', true);
                        MO.updateTerrainGeometry();
                    }
                    if (seg.cityKey && state.city && state.city.roadTiles && state.city.roadTiles.has(seg.cityKey)) {
                        const tile = state.city.roadTiles.get(seg.cityKey);
                        tile.built = true;
                        if (MO.cityManager && MO.cityManager.renderCityRoadTile) MO.cityManager.renderCityRoadTile(tile);
                    }
                    MO.SoundFX.playDirtShovel();
                    const infra = state.villageInfra;
                    if (infra) {
                        const mainSegs = infra.roadSegments.filter(s => s.bank === 'west' || s.bank === 'city');
                        if (mainSegs.length > 0 && mainSegs.every(s => s.built) && !infra.roadBuilt) {
                            infra.roadBuilt = true;
                            if (MO.worldManager) MO.worldManager.renderDemarcationLines();
                            if (MO.flushQueuedTruckIfReady) MO.flushQueuedTruckIfReady();
                            if (MO.showToast) MO.showToast('🛣️ Estrada concluída! Caminhões já podem entrar pela via.', '🚚');
                        }
                        const eastSegs = infra.roadSegments.filter(s => s.bank === 'east');
                        if (infra.eastRoadDemarcated && eastSegs.length > 0 && eastSegs.every(s => s.built) && !infra.eastRoadBuilt) {
                            infra.eastRoadBuilt = true;
                            if (MO.worldManager) MO.worldManager.renderDemarcationLines();
                        }
                    }
                }
            } else if (tk.type === 'build-unloading') {
                if (state.villageInfra) state.villageInfra.unloadingRes = false;
                if (MO.setUnloadingBuilt) MO.setUnloadingBuilt(true);
                if (MO.worldManager) MO.worldManager.renderDemarcationLines();
                MO.SoundFX.playHammerWood();
            } else if (tk.type === 'build-mixer') {
                if (state.villageInfra) state.villageInfra.mixerRes = false;
                if (MO.setMixerBuilt) MO.setMixerBuilt(true);
                if (MO.worldManager) MO.worldManager.renderDemarcationLines();
                MO.SoundFX.playHammerWood();
            } else if (tk.type === 'build-workbench') {
                if (state.villageInfra) state.villageInfra.workbenchRes = false;
                if (MO.setWorkbenchBuilt) MO.setWorkbenchBuilt(true);
                if (MO.worldManager) MO.worldManager.renderDemarcationLines();
                MO.SoundFX.playHammerWood();
                if (MO.showToast) MO.showToast('🪚 Bancada de corte de madeira pronta!', '🪵');
            } else if (tk.type === 'build-yards') {
                if (state.villageInfra) state.villageInfra.yardsRes = false;
                if (MO.setStockYardsBuilt) MO.setStockYardsBuilt(true);
                if (MO.worldManager) {
                    MO.worldManager.renderDemarcationLines();
                    if (MO.worldManager.saveToStorage) MO.worldManager.saveToStorage();
                }
                if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck('wood');
                MO.SoundFX.playHammerWood();
            } else if (tk.type === 'saw-wood') {
                if (MO.animateWorkbenchSaw) MO.animateWorkbenchSaw(false, 0);
                if (MO.completeWoodSawing) MO.completeWoodSawing();
                if (MO.SoundFX && MO.SoundFX.playWoodSaw) MO.SoundFX.playWoodSaw();
            } else if (tk.type === 'build-city-struct') {
                const st = tk.cityStruct;
                if (st) {
                    st.built = true;
                    st.res = false;
                    if (st.guide) st.guide.visible = false;
                    if (st.builtGroup) st.builtGroup.visible = true;
                    MO.SoundFX.playHammerWood();
                    MO.spawnBurst(st.x, (MO.getTerrainHeight ? MO.getTerrainHeight(st.x, st.z) : 0.3) + 0.5, st.z, 0xfbbf24, 10, 0.08);
                    if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 10, 4);
                    if (MO.workerFactory && MO.workerFactory.rememberWorkerEvent) MO.workerFactory.rememberWorkerEvent(w, `Inaugurou ${st.kind}`);
                    if (MO.economyManager && MO.economyManager.logJournal) {
                        MO.economyManager.logJournal('🏗️', `${st.kind.toUpperCase()} inaugurado(a)`, `Concluído por ${w.name}`);
                    }
                    w.celebrateTimer = 1.6;
                    if (MO.economyManager && MO.economyManager.evaluateContracts) MO.economyManager.evaluateContracts();
                    if (MO.showToast) MO.showToast(`✅ ${st.kind.toUpperCase()} concluído na cidade!`, '🏗️');
                }
            } else if (tk.type === 'replant-tree') {
                const planted = (MO.chunkManager && MO.chunkManager.replantSapling)
                    ? MO.chunkManager.replantSapling(tk.stumpId)
                    : null;
                if (planted) {
                    if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 7, 3);
                    if (MO.workerFactory && MO.workerFactory.rememberWorkerEvent) MO.workerFactory.rememberWorkerEvent(w, 'Replantou muda na floresta');
                    if (MO.economyManager && MO.economyManager.logJournal) {
                        MO.economyManager.logJournal('🌱', 'Nova muda plantada', `${w.name} reflorestou a borda do bosque`);
                    }
                    if (MO.economyManager && MO.economyManager.evaluateContracts) MO.economyManager.evaluateContracts();
                    if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
                    MO.SoundFX.playDirtShovel();
                }
            } else if (tk.type === 'work-lumberyard') {
                if (MO.economyManager && MO.economyManager.processSawmillBatch) {
                    MO.economyManager.processSawmillBatch();
                } else if (MO.cityManager) {
                    MO.cityManager.addResources({ wood: 2, coins: 3 });
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 6, 1);
                if (MO.SoundFX && MO.SoundFX.playWoodSaw) MO.SoundFX.playWoodSaw();
            } else if (tk.type === 'harvest-wood') {
                const pos = w.rig && w.rig.group ? w.rig.group.position : { x: 0, z: 0 };
                let taken = 1;
                if (tk.forestryTree && MO.forestryManager) {
                    if (tk.forestryTree.status === 'standing') {
                        tk.forestryTree.hp = 0;
                        MO.forestryManager.triggerTreeFall(tk.forestryTree, pos.x, pos.z);
                    }
                    tk.forestryTree.res = false;
                } else if (tk.resourceNode && MO.chunkManager) {
                    taken = MO.chunkManager.harvestNode(tk.resourceNode, 1);
                    tk.resourceNode.res = false;
                }
                if (taken > 0) {
                    if (MO.cityManager) {
                        MO.cityManager.addResources({ wood: 3 });
                        if (MO.cityManager.saveCityState) MO.cityManager.saveCityState();
                    }
                    if (MO.deliverRawWood && MO.state.villageInfra && MO.state.villageInfra.workbenchBuilt) {
                        MO.deliverRawWood(1);
                    }
                    if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
                    if (MO.SoundFX && MO.SoundFX.playAxeChop) MO.SoundFX.playAxeChop();
                }
            } else if (tk.type === 'buck-tree') {
                if (tk.forestryTree && MO.forestryManager) {
                    if (tk.forestryTree.status === 'fallen') {
                        tk.forestryTree.buckHp = 1;
                        MO.forestryManager.applyBuckHitToTree(tk.forestryTree);
                    }
                    tk.forestryTree.res = false;
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 4, 1);
            } else if (tk.type === 'remove-stump') {
                if (tk.forestryTree && MO.forestryManager) {
                    if (!tk.forestryTree.stumpRemoved) {
                        tk.forestryTree.stumpHp = 1;
                        MO.forestryManager.applyStumpHit(tk.forestryTree);
                    }
                    tk.forestryTree.res = false;
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
            } else if (tk.type === 'plant-sapling-spot') {
                if (tk.plantSpot && MO.forestryManager) {
                    MO.forestryManager.completePlantSapling(tk.plantSpot);
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 7, 3);
                if (MO.workerFactory && MO.workerFactory.rememberWorkerEvent) MO.workerFactory.rememberWorkerEvent(w, 'Plantou nova muda florestal');
                if (MO.economyManager && MO.economyManager.evaluateContracts) MO.economyManager.evaluateContracts();
            } else if (tk.type === 'craft-forestry-plank') {
                if (tk.useWorkbench && MO.animateWorkbenchSaw) MO.animateWorkbenchSaw(false, 0, null);
                if (MO.state && MO.state.workbench) MO.state.workbench.cutWood = (MO.state.workbench.cutWood || 0) + 2;
                if (MO.updateWorkbenchVisuals) MO.updateWorkbenchVisuals();
                if (MO.cityManager) MO.cityManager.addResources({ wood: 1 });
                if (MO.forestryManager && MO.forestryManager.state.woodshop.placed) {
                    w.forestryCarry = 'craftedPiece';
                    setWorkerTool(w.rig, 'plank');
                    w.rig.torsoPivot.rotation.x = 0;
                    w.rig.torsoPivot.rotation.y = 0;
                    w.task = null;
                    return;
                }
                w.forestryCarry = null;
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
            } else if (tk.type === 'build-woodshop-piece') {
                w.forestryCarry = null;
                if (MO.forestryManager) MO.forestryManager.installNextWoodshopPiece(w);
            } else if (tk.type === 'deliver-woodshop-display') {
                const sp = w.forestryCarrySpecies || 'pine';
                w.forestryCarry = null;
                w.forestryCarrySpecies = null;
                if (MO.forestryManager) MO.forestryManager.deliverDisplayBundle(sp);
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 2);
            } else if (tk.type === 'harvest-ore') {
                const node = tk.resourceNode;
                let taken = 1;
                if (tk.miningRock && MO.miningManager) {
                    if (tk.miningRock.status === 'intact') {
                        tk.miningRock.hp = 0;
                        MO.miningManager.shatterRockToChunks(tk.miningRock);
                    }
                    tk.miningRock.res = false;
                } else if (node && MO.chunkManager) {
                    taken = MO.chunkManager.harvestNode(node, 1);
                    node.res = false;
                }
                if (taken > 0 && MO.cityManager) {
                    if (tk.miningRock && MO.miningManager) {
                        const info = MO.miningManager.ORE_TYPES[tk.miningRock.oreKey] || MO.miningManager.ORE_TYPES.granite;
                        MO.cityManager.addResources({ stone: info.stoneGrant, iron: info.ironGrant });
                    } else if (node && node.kind === 'mine') MO.cityManager.addResources({ stone: 3, iron: 2 });
                    else if (node && node.kind === 'iron') MO.cityManager.addResources({ iron: 2, stone: 1 });
                    else if (tk.cityStruct && tk.cityStruct.kind === 'mine') MO.cityManager.addResources({ stone: 2, iron: 1 });
                    else MO.cityManager.addResources({ stone: 3 });
                    if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 6, 1);
                    if (MO.cityManager.saveCityState) MO.cityManager.saveCityState();
                    if (MO.SoundFX && MO.SoundFX.playPickaxeClink) MO.SoundFX.playPickaxeClink();
                }
            } else if (tk.type === 'clear-rubble') {
                if (tk.miningRock && MO.miningManager) {
                    if (!tk.miningRock.rubbleCleared) {
                        tk.miningRock.rubbleHp = 1;
                        MO.miningManager.applyRubbleHit(tk.miningRock);
                    }
                    tk.miningRock.res = false;
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 4, 1);
            } else if (tk.type === 'build-crusher-piece') {
                w.miningCarry = null;
                if (MO.miningManager) MO.miningManager.installNextCrusherPiece(w);
            } else if (tk.type === 'process-crusher') {
                if (MO.miningManager) {
                    MO.miningManager.state.crusher.busyWorkerId = null;
                    MO.miningManager.animateCrusher(false, 0, null);
                    const info = MO.miningManager.ORE_TYPES[w.miningCarryOre] || MO.miningManager.ORE_TYPES.granite;
                    if (MO.cityManager) MO.cityManager.addResources({ stone: info.stoneGrant, iron: info.ironGrant });
                    if (MO.miningManager.state.depot.placed) {
                        w.miningCarry = 'cutBlock';
                        setWorkerTool(w.rig, 'stone-block');
                        w.rig.torsoPivot.rotation.x = 0;
                        w.rig.torsoPivot.rotation.y = 0;
                        w.task = null;
                        return;
                    }
                }
                w.miningCarry = null;
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
            } else if (tk.type === 'build-depot-piece') {
                w.miningCarry = null;
                if (MO.miningManager) MO.miningManager.installNextDepotPiece(w);
            } else if (tk.type === 'deliver-depot-display') {
                const ok = w.miningCarryOre || 'granite';
                w.miningCarry = null;
                w.miningCarryOre = null;
                if (MO.miningManager) MO.miningManager.deliverDisplayMineral(ok);
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 2);
            } else if (tk.type === 'fetch-water') {
                w.hasWaterInCan = true;
                if (MO.SoundFX && MO.SoundFX.playWaterPour) MO.SoundFX.playWaterPour();
                if (tk.farmPlot && tk.farmPlot.status === 'seeded') {
                    w.task = { type: 'farm-water', farmPlot: tk.farmPlot, duration: 0.85, subPhase: 'work' };
                    setDestination(w, tk.farmPlot.x, tk.farmPlot.z + 0.85);
                    setWorkerTool(w.rig, 'can');
                    w.rig.setBadge('💧');
                    w.statusText = 'Irrigando lavoura com água do Poço';
                    return;
                }
                if (tk.farmPlot) tk.farmPlot.res = false;
            } else if (tk.type === 'farm-clear' || tk.type === 'farm-till' || tk.type === 'farm-sow' || tk.type === 'farm-water' || tk.type === 'farm-harvest') {
                if (tk.type === 'farm-water') w.hasWaterInCan = false;
                w.rig.armR.rotation.y = 0;
                if (tk.farmPlot && MO.farmingManager) {
                    MO.farmingManager.advancePlotStage(tk.farmPlot, w);
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 4, 1);
            } else if (tk.type === 'build-well-piece') {
                if (MO.farmingManager) MO.farmingManager.installNextWellPiece(w);
            } else if (tk.type === 'build-bench-piece') {
                w.farmingCarry = null;
                if (MO.farmingManager) MO.farmingManager.installNextBenchPiece(w);
            } else if (tk.type === 'pack-bench') {
                if (MO.farmingManager) {
                    MO.farmingManager.state.bench.busyWorkerId = null;
                    MO.farmingManager.animateBench(false, null);
                    if (MO.SoundFX && MO.SoundFX.playPackCrate) MO.SoundFX.playPackCrate();
                    if (MO.cityManager) MO.cityManager.addResources({ food: 1 });
                    if (MO.farmingManager.state.barn.placed) {
                        w.farmingCarry = 'packedCrate';
                        setWorkerTool(w.rig, 'crate');
                        w.rig.torsoPivot.rotation.x = 0;
                        w.rig.torsoPivot.rotation.y = 0;
                        w.task = null;
                        return;
                    }
                }
                w.farmingCarry = null;
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
            } else if (tk.type === 'build-barn-piece') {
                w.farmingCarry = null;
                if (MO.farmingManager) MO.farmingManager.installNextBarnPiece(w);
            } else if (tk.type === 'deliver-barn-display') {
                const ck = w.farmingCarryCrop || 'wheat';
                w.farmingCarry = null;
                w.farmingCarryCrop = null;
                if (MO.farmingManager) MO.farmingManager.deliverDisplayCrate(ck);
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 2);
            } else if (tk.type === 'work-farm') {
                const nearWater = tk.cityStruct && MO.getRiverCenterX
                    ? Math.abs(tk.cityStruct.x - MO.getRiverCenterX(tk.cityStruct.z)) < 12
                    : false;
                // Evolui visualmente o estágio da plantação (broto -> verde -> dourado maduro)
                if (tk.cityStruct && Array.isArray(tk.cityStruct.cropMeshes) && tk.cityStruct.cropMeshes.length > 0) {
                    tk.cityStruct.cropStage = ((tk.cityStruct.cropStage || 0) + 1) % 3;
                    const scaleY = [0.55, 0.95, 1.32][tk.cityStruct.cropStage];
                    const cropHex = [0x4d7c0f, 0x65a30d, 0xeab308][tk.cityStruct.cropStage];
                    tk.cityStruct.cropMeshes.forEach(cm => {
                        if (cm && cm.scale) cm.scale.y = scaleY;
                        if (cm && cm.material && cm.material.color) cm.material.color.setHex(cropHex);
                    });
                }
                if (MO.cityManager) MO.cityManager.addResources({ food: nearWater ? 4 : 3 });
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
                MO.SoundFX.playDirtShovel();
            } else if (tk.type === 'work-market') {
                if (MO.economyManager && MO.economyManager.processMarketTrade) {
                    MO.economyManager.processMarketTrade(Boolean(tk.cityStruct));
                } else {
                    const coins = tk.cityStruct ? 4 : 2;
                    if (MO.cityManager) MO.cityManager.addResources({ coins });
                }
                if (MO.forestryManager && MO.forestryManager.state.woodshop.displayedBundles.length >= 4) {
                    MO.forestryManager.sellDisplayedWood({ single: true, silent: true });
                }
                if (MO.miningManager && MO.miningManager.state.depot.displayedMinerals.length >= 4) {
                    MO.miningManager.sellDisplayedMinerals({ single: true, silent: true });
                }
                if (MO.farmingManager && MO.farmingManager.state.barn.displayedCrates.length >= 4) {
                    MO.farmingManager.sellDisplayedHarvest({ single: true, silent: true });
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 5, 1);
                MO.SoundFX.playElectricSwitch();
            } else if (tk.type === 'brief-crew') {
                if (tk.peer && MO.workerFactory && MO.workerFactory.recordPeerBond) {
                    MO.workerFactory.recordPeerBond(w, tk.peer, 5);
                    tk.peer.morale = Math.min(100, (tk.peer.morale ?? 82) + 4);
                }
                w.morale = Math.min(100, (w.morale ?? 82) + 3);
            } else if (tk.type !== 'inspect-site' && tk.type !== 'survey-area') {
                const modePlugin = MO.modes[state.mode];
                if (modePlugin && modePlugin.completeWorkerTask) {
                    modePlugin.completeWorkerTask(tk);
                }
                if (MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(w, 4, 1);
                const activeLot = MO.regionManager && MO.regionManager.getActiveLot ? MO.regionManager.getActiveLot() : null;
                if (activeLot && MO.workerFactory && MO.workerFactory.recordWorkerBuiltLot) {
                    MO.workerFactory.recordWorkerBuiltLot(w, activeLot.id, activeLot.label);
                }
                if (tk.type === 'br-pour' || tk.type === 'bld-slab' || tk.type === 'tw-pour') {
                    state.bucketCharges = Math.max(0, state.bucketCharges - 1.0);
                    if (MO.updateBucketUI) MO.updateBucketUI();
                }
            }
        } else if ((tk.type === 'social-chat' || tk.type === 'assist-peer') && tk.peer && MO.workerFactory && MO.workerFactory.recordPeerBond) {
            MO.workerFactory.recordPeerBond(w, tk.peer, 4);
            w.morale = Math.min(100, (w.morale ?? 82) + 4);
        }

        setWorkerTool(w.rig, 'none');
        w.rig.torsoPivot.rotation.x = 0;
        w.rig.torsoPivot.rotation.y = 0;
        w.rig.setBadge('');
        w.task = null;
    }

    function updateWorker(w, dt, t, context) {
        const { state, isDarkSite, isHotBiome } = context;
        MO.workerNeeds.updateNeeds(w, dt, isDarkSite, isHotBiome);
        updateHeadgearAndWeatherFX(w, state);

        if (MO.workerNeeds.shouldWakeFromSleep(w, state)) {
            return;
        }

        // Animação expressiva de comemoração após concluir obra, contrato ou subir de nível
        if ((w.celebrateTimer || 0) > 0 && !w.sleepingInside) {
            w.celebrateTimer = Math.max(0, w.celebrateTimer - dt);
            const hop = Math.abs(Math.sin(t * 14 + w.id));
            const pos = w.rig.group.position;
            const groundY = Math.max(MO.WATER_LEVEL + 0.05, MO.getTerrainHeight ? MO.getTerrainHeight(pos.x, pos.z) : 0.28);
            pos.y = groundY + hop * 0.24;
            w.rig.armL.rotation.x = -2.65 + Math.sin(t * 16) * 0.25;
            w.rig.armR.rotation.x = -2.65 - Math.sin(t * 16) * 0.25;
            w.rig.torsoPivot.rotation.x = -0.06;
            w.rig.setBadge('🎉');
            return;
        }

        if (!w.task) {
            w.rig.torsoPivot.rotation.x = Math.sin(t * 2 + w.id) * 0.03;
            w.rig.armL.rotation.x = Math.sin(t * 1.5 + w.id) * 0.06;
            w.rig.armR.rotation.x = -Math.sin(t * 1.5 + w.id) * 0.06;
            MO.workerTasks.assignWorkerTask(w, t);
            return;
        }

        if (isDarkSite && w.task.type !== 'build-floodlight' && w.task.type !== 'sleep-tent') {
            w.rig.setBadge('🔦');
        }

        if (stepMovement(w, dt, t, isDarkSite)) {
            return;
        }

        const tk = w.task;
        if (tk.subPhase === 'pickup') {
            handlePickupSubPhase(w, tk, dt);
            return;
        }

        if (animateTaskExecution(w, tk, dt, t)) {
            completeTask(w, tk);
        }
    }

    MO.workerAgent = {
        update: updateWorker,
        updateHeadgearAndWeatherFX,
        stepMovement,
        handlePickupSubPhase,
        animateTaskExecution,
        completeTask
    };
})(window.MO = window.MO || {});

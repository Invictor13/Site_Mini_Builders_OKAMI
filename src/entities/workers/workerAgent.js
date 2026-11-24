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

        const lifeSpeedMult = isDarkSite && w.task.type !== 'build-floodlight' ? 0.72 : (w.energy > 75 ? 1.08 : 0.98);
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
        w.rig.torsoPivot.rotation.x = 0.08;
        const cyc = Math.sin(t * 14 + w.id * 2);
        w.rig.legL.rotation.x = cyc * 0.62;
        w.rig.legR.rotation.x = -cyc * 0.62;

        const carrying = w.rig.carryBrick.visible || w.rig.carryPlank.visible || w.rig.carryBeam.visible ||
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

        w.timer += dt;
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
        } else if (tk.type === 'social-chat' || tk.type === 'assist-peer') {
            if (tk.peer && tk.peer.rig && tk.peer.rig.group) {
                const pp = tk.peer.rig.group.position;
                w.rig.group.rotation.y = Math.atan2(pp.x - pos.x, pp.z - pos.z);
            }
            w.rig.torsoPivot.rotation.x = 0.05 + Math.sin(t * 6) * 0.06;
            w.rig.armL.rotation.x = -0.45 + Math.sin(t * 5) * 0.25;
            w.rig.armR.rotation.x = -0.65 - Math.sin(t * 5) * 0.25;
        } else if (tk.type === 'visit-home' || tk.type === 'stroll-bridge') {
            w.rig.torsoPivot.rotation.x = Math.sin(t * 2) * 0.04;
            w.rig.armL.rotation.x = -0.15;
            w.rig.armR.rotation.x = -0.15;
        } else if (tk.type === 'tend-garden') {
            const swing = Math.sin(t * 14);
            w.rig.torsoPivot.rotation.x = 0.30 + swing * 0.10;
            w.rig.armL.rotation.x = -0.75 + swing * 0.40;
            w.rig.armR.rotation.x = -0.85 + swing * 0.45;
            if (w.subTimer > 0.32) {
                w.subTimer = 0;
                MO.spawnBurst(pos.x, pos.y + 0.14, pos.z, 0x4ade80, 3, 0.04);
            }
        } else if (tk.type === 'inspect-site' || tk.type === 'demarcate-site' || tk.type === 'demarcate-east') {
            setWorkerTool(w.rig, 'clipboard');
            w.rig.torsoPivot.rotation.x = 0.10;
            w.rig.armL.rotation.x = -0.95;
            w.rig.armR.rotation.x = -0.3 + Math.sin(t * 5) * 0.15;
        } else if (tk.type === 'saw-wood') {
            setWorkerTool(w.rig, 'saw');
            const sawMotion = Math.sin(t * 22);
            w.rig.group.rotation.y = Math.atan2(MO.STATION_WORKBENCH.x - pos.x, MO.STATION_WORKBENCH.z - pos.z);
            w.rig.torsoPivot.rotation.x = 0.25 + sawMotion * 0.08;
            w.rig.armL.rotation.x = -0.95;
            w.rig.armR.rotation.x = -1.15 + sawMotion * 0.55;
            if (MO.animateWorkbenchSaw) MO.animateWorkbenchSaw(true, t);
            if (w.subTimer > 0.24) {
                w.subTimer = 0;
                if (MO.SoundFX && MO.SoundFX.playWoodSaw) MO.SoundFX.playWoodSaw();
                MO.spawnBurst(MO.STATION_WORKBENCH.x, pos.y + 0.62, MO.STATION_WORKBENCH.z, 0xd6b078, 4, 0.04);
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
        } else if (tk.type === 'weed' || tk.type === 'level-spot' || tk.type === 'dig' || tk.type === 'tw-dig' || tk.type === 'build-road' || tk.type === 'harvest-ore' || tk.type === 'work-farm') {
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
            tk.type === 'build-city-struct' || tk.type === 'harvest-wood'
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
                    if (MO.showToast) MO.showToast(`✅ ${st.kind.toUpperCase()} concluído na cidade!`, '🏗️');
                }
            } else if (tk.type === 'harvest-wood') {
                const taken = (tk.resourceNode && MO.chunkManager) ? MO.chunkManager.harvestNode(tk.resourceNode, 1) : 1;
                if (tk.resourceNode) tk.resourceNode.res = false;
                if (taken > 0) {
                    if (MO.cityManager) MO.cityManager.addResources({ wood: 3 });
                    if (MO.deliverRawWood && MO.state.villageInfra && MO.state.villageInfra.workbenchBuilt) {
                        MO.deliverRawWood(1);
                    }
                    MO.SoundFX.playHammerWood();
                }
            } else if (tk.type === 'harvest-ore') {
                const node = tk.resourceNode;
                const taken = (node && MO.chunkManager) ? MO.chunkManager.harvestNode(node, 1) : 1;
                if (node) node.res = false;
                if (taken > 0 && MO.cityManager) {
                    if (node && node.kind === 'mine') MO.cityManager.addResources({ stone: 3, iron: 2 });
                    else if (node && node.kind === 'iron') MO.cityManager.addResources({ iron: 2, stone: 1 });
                    else if (tk.cityStruct && tk.cityStruct.kind === 'mine') MO.cityManager.addResources({ stone: 2, iron: 1 });
                    else MO.cityManager.addResources({ stone: 3 });
                    MO.SoundFX.playMetalClang();
                }
            } else if (tk.type === 'work-farm') {
                if (MO.cityManager) MO.cityManager.addResources({ food: 3 });
                MO.SoundFX.playDirtShovel();
            } else if (tk.type === 'work-market') {
                const coins = tk.cityStruct ? 4 : 2;
                if (MO.cityManager) MO.cityManager.addResources({ coins });
                MO.SoundFX.playElectricSwitch();
            } else if (tk.type !== 'inspect-site') {
                const modePlugin = MO.modes[state.mode];
                if (modePlugin && modePlugin.completeWorkerTask) {
                    modePlugin.completeWorkerTask(tk);
                }
                if (tk.type === 'br-pour' || tk.type === 'bld-slab' || tk.type === 'tw-pour') {
                    state.bucketCharges = Math.max(0, state.bucketCharges - 1.0);
                    if (MO.updateBucketUI) MO.updateBucketUI();
                }
            }
        }

        setWorkerTool(w.rig, 'none');
        w.rig.torsoPivot.rotation.x = 0;
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

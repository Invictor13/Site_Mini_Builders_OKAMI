// =========================================================================
// ENTITIES / WORKERS: NECESSIDADES, ROTINAS DE ACAMPAMENTO & RESERVAS
// =========================================================================
(function(MO) {
    function updateNeeds(w, dt, isDarkSite, isHotBiome) {
        w.socialCooldown = Math.max(0, (w.socialCooldown || 0) - dt);
        if (!w.sleepingInside) {
            const hydDrain = (isHotBiome && !MO.state.isNight) ? 1.15 : 0.72;
            const engDrain = isDarkSite ? 1.05 : 0.62;
            w.hydration = Math.max(0, w.hydration - dt * hydDrain);
            w.hunger = Math.max(0, w.hunger - dt * 0.52);
            w.energy = Math.max(0, w.energy - dt * engDrain);
        } else {
            w.energy = Math.min(100, w.energy + dt * 11.5);
        }
    }

    function releaseCampReservations(w) {
        const camp = MO.state.camp;
        if (!camp) return;
        camp.tents.forEach(tent => {
            if (tent.occupiedBy === w.id) tent.occupiedBy = null;
            if (tent.reserved === w.id) tent.reserved = false;
        });
        if (camp.messHall && camp.messHall.reserved === w.id) camp.messHall.reserved = false;
        camp.floodlights.forEach(fl => {
            if (fl.reserved === w.id) fl.reserved = false;
        });
        w.sleepingInside = false;
        if (MO.workerFactory && MO.workerFactory.setBodyVisible) {
            MO.workerFactory.setBodyVisible(w, true);
        }
    }

    function shouldWakeFromSleep(w, state) {
        if (w.task && w.task.type === 'sleep-tent' && state.camp && state.camp.nightMode === 'sleep' && !state.isNight && w.sleepingInside) {
            releaseCampReservations(w);
            w.energy = Math.max(w.energy, 85);
            w.task = null;
            w.rig.setBadge('☀️');
            return true;
        }
        return false;
    }

    function assignCampOrLifeTask(w, setDestinationFn, setToolFn, t, afterWorkCheck) {
        const state = MO.state;
        const camp = state.camp;
        if (!camp) return false;

        if (state.isNight) {
            const unbuiltLight = camp.floodlights.find(fl => !fl.built && fl.reserved === false);
            if (unbuiltLight) {
                unbuiltLight.reserved = w.id;
                w.task = { type: 'build-floodlight', light: unbuiltLight, duration: 0.90, subPhase: 'work' };
                setDestinationFn(w, unbuiltLight.x, unbuiltLight.z);
                w.rig.setBadge('🔦');
                w.statusText = 'Armando torre de refletor';
                setToolFn(w.rig, 'hammer');
                return true;
            }
        }

        const builtTents = camp.tents.filter(tn => tn.built);
        if (camp.nightMode === 'sleep' && state.isNight) {
            const myTent = camp.tents[w.id] && camp.tents[w.id].built
                ? camp.tents[w.id]
                : builtTents.find(tn => tn.occupiedBy === null && tn.reserved === false);
            if (myTent && myTent.occupiedBy === null) {
                myTent.reserved = w.id;
                w.task = { type: 'sleep-tent', tent: myTent, duration: 6.0, subPhase: 'work' };
                setDestinationFn(w, myTent.x, myTent.z);
                w.rig.setBadge('💤');
                w.statusText = 'Indo dormir na barraca';
                return true;
            }
        } else if (camp.nightMode === 'rotate') {
            const sleepers = state.workers.filter(o => o.task && o.task.type === 'sleep-tent').length;
            const maxSleepers = state.workers.length >= 2 ? 1 : 0;
            const needsRest = (state.isNight && w.energy < 58) || w.energy < 22;
            if (sleepers < maxSleepers && needsRest) {
                const freeTent = builtTents.find(tn => tn.occupiedBy === null && tn.reserved === false);
                if (freeTent) {
                    freeTent.reserved = w.id;
                    w.task = { type: 'sleep-tent', tent: freeTent, duration: 4.2, subPhase: 'work' };
                    setDestinationFn(w, freeTent.x, freeTent.z);
                    w.rig.setBadge('💤');
                    w.statusText = 'Descansando na barraca (revezamento)';
                    return true;
                }
            }
        }

        if (state.weather === 'rain' && camp.messHall && camp.messHall.built && (afterWorkCheck || w.energy < 48)) {
            const shSpot = camp.messHall.shelterSpots[w.id % camp.messHall.shelterSpots.length];
            w.task = { type: 'shelter-rain', duration: 2.5, subPhase: 'work' };
            setDestinationFn(w, shSpot.x, shSpot.z);
            w.rig.setBadge('☔');
            w.statusText = 'Abrigado da chuva no refeitório';
            return true;
        }

        if (w.hydration < 28 && camp.messHall && camp.messHall.built && camp.waterCooler) {
            w.task = { type: 'drink-water', duration: 1.4, subPhase: 'work' };
            setDestinationFn(w, camp.waterCooler.x, camp.waterCooler.z);
            w.rig.setBadge('💧');
            w.statusText = 'Bebendo água no galão';
            return true;
        }

        const isLunchHour = Math.abs(state.timeOfDay - 0.30) < 0.04;
        if ((w.hunger < 26 || (isLunchHour && w.hunger < 62)) && camp.messHall && camp.messHall.built) {
            const seat = camp.messHall.seats[w.id % camp.messHall.seats.length];
            w.task = { type: 'eat-meal', duration: 2.2, subPhase: 'work' };
            setDestinationFn(w, seat.x, seat.z);
            w.rig.setBadge(isLunchHour ? '🍲' : '☕');
            w.statusText = isLunchHour ? 'Almoçando marmita no refeitório' : 'Fazendo pausa pro café';
            return true;
        }

        const campBuilderBusy = state.workers.some(o => o.task && (o.task.type === 'build-tent' || o.task.type === 'build-mess' || o.task.type === 'build-floodlight'));
        const canBuildCampNow = w.role !== 'supervisor' && (afterWorkCheck || (!campBuilderBusy && (state.phase > 0 || state.weeds.filter(wd => !wd.cleared).length < 6)));
        if (canBuildCampNow) {
            const unbuiltLight = camp.floodlights.find(fl => !fl.built && fl.reserved === false);
            if (unbuiltLight) {
                unbuiltLight.reserved = w.id;
                w.task = { type: 'build-floodlight', light: unbuiltLight, duration: 0.85, subPhase: 'work' };
                setDestinationFn(w, unbuiltLight.x, unbuiltLight.z);
                w.rig.setBadge('💡');
                w.statusText = 'Montando refletor portátil';
                setToolFn(w.rig, 'hammer');
                return true;
            }
            if (camp.messHall && !camp.messHall.built && camp.messHall.reserved === false) {
                camp.messHall.reserved = w.id;
                w.task = { type: 'build-mess', duration: 0.95, subPhase: 'work' };
                setDestinationFn(w, camp.messHall.x, camp.messHall.z);
                w.rig.setBadge('🍲');
                w.statusText = 'Montando refeitório e bebedouro';
                setToolFn(w.rig, 'hammer');
                return true;
            }
            const unbuiltTent = camp.tents.find(tn => !tn.built && tn.reserved === false);
            if (unbuiltTent) {
                unbuiltTent.reserved = w.id;
                w.task = { type: 'build-tent', tent: unbuiltTent, duration: 0.80, subPhase: 'work' };
                setDestinationFn(w, unbuiltTent.x, unbuiltTent.z);
                w.rig.setBadge('⛺');
                w.statusText = `Armando barraca #${unbuiltTent.id + 1}`;
                setToolFn(w.rig, 'hammer');
                return true;
            }
        }

        if (afterWorkCheck) {
            if (w.role === 'supervisor' || w.role === 'foreman') {
                const ang = t * 0.4 + w.id;
                w.task = { type: 'inspect-site', duration: 2.0, subPhase: 'work' };
                setDestinationFn(w, Math.cos(ang) * 2.2, Math.sin(ang) * 2.0 - 0.3);
                w.rig.setBadge('📋');
                w.statusText = 'Vistoriando qualidade da obra';
                setToolFn(w.rig, 'clipboard');
                return true;
            }

            // P2.0: Interação social com colega próximo
            if ((w.socialCooldown || 0) <= 0 && w.rig && w.rig.group) {
                const pos = w.rig.group.position;
                const peer = state.workers.find(o => o !== w && !o.sleepingInside && o.rig && o.rig.group
                    && Math.hypot(o.rig.group.position.x - pos.x, o.rig.group.position.z - pos.z) < 4.0);
                if (peer) {
                    w.socialCooldown = 22;
                    w.task = { type: 'social-chat', peer, duration: 1.55, subPhase: 'work' };
                    setDestinationFn(w, peer.rig.group.position.x + 0.72, peer.rig.group.position.z + 0.35);
                    w.rig.setBadge('💬');
                    w.statusText = `Conversando com ${peer.name}`;
                    return true;
                }
            }

            // P2.2: Vida pós-construção — visitar/habitar casas concluídas e jardins
            const completedList = MO.constructionManager ? MO.constructionManager.getCompletedConstructions() : [];
            const completedHouses = completedList.filter(c => c.mode === 'house');
            if (completedHouses.length > 0 && (w.specialty === 'resident' || w.specialty === 'gardener' || state.villageCompleted || (w.id % 2 === 0))) {
                const houseRec = completedHouses[w.id % completedHouses.length];
                const lot = MO.regionManager ? MO.regionManager.getLot(houseRec.lotId) : null;
                const hx = lot ? lot.originX : -4.4;
                const hz = lot ? lot.originZ : -4.6;
                if (w.specialty === 'gardener' || w.specialty === 'earthwork') {
                    w.task = { type: 'tend-garden', duration: 1.65, subPhase: 'work' };
                    setDestinationFn(w, hx + 1.65, hz + 1.35);
                    w.rig.setBadge('🌱');
                    w.statusText = `Cuidando do jardim (${lot ? lot.label : 'Vila'})`;
                    setToolFn(w.rig, 'hoe');
                    return true;
                }
                const door = (houseRec.obstacles && houseRec.obstacles.doorCenters && houseRec.obstacles.doorCenters[0]) || { x: hx, z: hz + 1.55 };
                w.task = { type: 'visit-home', duration: 2.1, subPhase: 'work' };
                setDestinationFn(w, door.x, door.z + 0.35);
                w.rig.setBadge('🏡');
                w.statusText = state.isNight ? `Em casa (${lot ? lot.label : 'Vila'})` : `Descansando na varanda (${lot ? lot.label : 'Vila'})`;
                return true;
            }

            // Travessia contemplativa pela ponte quando o Banco Leste está liberado
            if (state.villageInfra && state.villageInfra.bridgeUnlocked && (state.villageCompleted || w.id % 3 === 1)) {
                const bz = state.villageInfra.bridgeZ !== undefined ? state.villageInfra.bridgeZ : -0.6;
                const rx = MO.getRiverCenterX ? MO.getRiverCenterX(bz) : 1.6;
                const toEast = w.rig && w.rig.group ? (w.rig.group.position.x < rx) : true;
                w.task = { type: 'stroll-bridge', duration: 1.4, subPhase: 'work' };
                setDestinationFn(w, toEast ? rx + 3.2 : rx - 3.2, bz);
                w.rig.setBadge('🌉');
                w.statusText = 'Atravessando a ponte da vila';
                return true;
            }

            if (camp.messHall && camp.messHall.built) {
                const seat = camp.messHall.seats[w.id % camp.messHall.seats.length];
                w.task = { type: 'camp-hangout', duration: 1.8, subPhase: 'work' };
                setDestinationFn(w, seat.x, seat.z);
                w.rig.setBadge(state.isNight ? '🔥' : '☕');
                w.statusText = state.isNight ? 'Esquentando no fogareiro' : 'Aguardando próxima etapa no refeitório';
                return true;
            }
        }
        return false;
    }

    function completeLifeTask(w, tk) {
        if (tk.type === 'build-tent') {
            if (MO.completeTentBuild) MO.completeTentBuild(tk.tent);
            return true;
        }
        if (tk.type === 'build-mess') {
            if (MO.completeMessBuild) MO.completeMessBuild();
            return true;
        }
        if (tk.type === 'build-floodlight') {
            if (MO.completeFloodlightBuild) MO.completeFloodlightBuild(tk.light);
            return true;
        }
        if (tk.type === 'drink-water') {
            w.hydration = 100;
            w.energy = Math.min(100, w.energy + 10);
            if (MO.SoundFX && MO.SoundFX.playWaterRush) MO.SoundFX.playWaterRush();
            return true;
        }
        if (tk.type === 'eat-meal') {
            w.hunger = 100;
            w.energy = Math.min(100, w.energy + 22);
            w.hydration = Math.min(100, w.hydration + 18);
            return true;
        }
        if (tk.type === 'sleep-tent') {
            w.energy = 100;
            releaseCampReservations(w);
            return true;
        }
        if (tk.type === 'shelter-rain' || tk.type === 'camp-hangout' || tk.type === 'social-chat' || tk.type === 'visit-home' || tk.type === 'tend-garden' || tk.type === 'stroll-bridge' || tk.type === 'assist-peer') {
            w.energy = Math.min(100, w.energy + 12);
            return true;
        }
        return false;
    }

    MO.workerNeeds = {
        updateNeeds,
        releaseCampReservations,
        shouldWakeFromSleep,
        assignCampOrLifeTask,
        completeLifeTask
    };
})(window.MO = window.MO || {});

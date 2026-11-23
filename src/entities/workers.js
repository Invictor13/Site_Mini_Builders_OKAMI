// =========================================================================
// ENTITIES: MINI AJUDANTES COM FÍSICA REAL, TRANSPORTE DE MATERIAIS & VIDA
// =========================================================================
(function(MO) {
    function createBadgeSprite() {
        if (typeof THREE.Sprite !== 'function' || typeof THREE.SpriteMaterial !== 'function') {
            return { sprite: null, setIcon: () => {} };
        }
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = (canvas && typeof canvas.getContext === 'function') ? canvas.getContext('2d') : null;
        if (!ctx) {
            return { sprite: null, setIcon: () => {} };
        }

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.42, 0.42, 1);
        sprite.position.set(0, 1.05, 0);
        sprite.visible = false;

        let lastIcon = '';
        function setIcon(icon) {
            if (!icon) {
                sprite.visible = false;
                lastIcon = '';
                return;
            }
            sprite.visible = true;
            if (icon === lastIcon) return;
            lastIcon = icon;
            ctx.clearRect(0, 0, 64, 64);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
            ctx.beginPath();
            ctx.arc(32, 32, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.font = '32px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(icon, 32, 34);
            tex.needsUpdate = true;
        }
        return { sprite, setIcon };
    }

    function createWorkerMesh(helmetHex, vestHex, workerIdx) {
        const g = new THREE.Group();
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
        const legL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.26, 0.10), legMat); legL.position.set(-0.07, 0.13, 0);
        const legR = legL.clone(); legR.position.x = 0.07;

        const torsoPivot = new THREE.Group();
        torsoPivot.position.set(0, 0.26, 0);

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: vestHex, roughness: 0.75 }));
        torso.position.y = 0.16; torso.castShadow = true;

        const rainPoncho = new THREE.Mesh(
            new THREE.BoxGeometry(0.30, 0.33, 0.20),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 })
        );
        rainPoncho.position.y = 0.17;
        rainPoncho.visible = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.7 });
        const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), skin); armL.position.set(-0.18, 0.16, 0);
        const armR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), skin); armR.position.set(0.18, 0.16, 0);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin); head.position.y = 0.43;
        const hMat = new THREE.MeshStandardMaterial({ color: helmetHex, roughness: 0.35 });
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hMat);
        helmet.position.y = 0.47; helmet.castShadow = true;

        // Lanterna frontal no capacete
        const headlampMount = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.045, 0.05),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
        );
        headlampMount.position.set(0, 0.50, 0.13);
        const headlampLensMat = new THREE.MeshStandardMaterial({
            color: 0xfef9c3,
            emissive: 0xfef08a,
            emissiveIntensity: 0.0
        });
        const headlampLens = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), headlampLensMat);
        headlampLens.position.set(0, 0.50, 0.156);

        const headlampConeMat = new THREE.MeshBasicMaterial({
            color: 0xfef9c3,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const headlampCone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.55, 10, 1, true), headlampConeMat);
        headlampCone.rotation.x = -Math.PI / 2 + 0.26;
        headlampCone.position.set(0, 0.34, 0.90);
        headlampCone.visible = false;

        const headlampLight = new THREE.PointLight(0xfef9c3, 0, 5.0, 1.7);
        headlampLight.position.set(0, 0.48, 0.85);

        // Itens transportados visíveis (tijolo, tábua, viga, balde com massa, saco, armadura, carrinho de mão)
        const carryBrick = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.12), MO.mats.brickCeramic);
        carryBrick.position.set(0, 0.18, 0.20); carryBrick.visible = false;

        const carryPlank = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.11, 0.05), MO.mats.formwork);
        carryPlank.position.set(0, 0.22, 0.22); carryPlank.visible = false;

        const carryBeam = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.13), MO.mats.steel);
        carryBeam.position.set(0, 0.28, 0.22); carryBeam.visible = false;

        const carryBucket = new THREE.Group();
        const bkBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.085, 0.18, 10),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
        );
        const bkMortar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.10, 0.10, 0.03, 10),
            MO.mats.concrete
        );
        bkMortar.position.y = 0.085;
        carryBucket.add(bkBody, bkMortar);
        carryBucket.position.set(0, 0.12, 0.23);
        carryBucket.visible = false;

        const carrySack = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.16, 0.22),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 })
        );
        carrySack.position.set(0, 0.20, 0.22);
        carrySack.visible = false;

        const carryRebar = new THREE.Group();
        [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]].forEach(([rx, rz]) => {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.72, 6), MO.mats.steel);
            bar.position.set(rx, 0, rz);
            carryRebar.add(bar);
        });
        carryRebar.rotation.x = 0.42;
        carryRebar.position.set(0, 0.24, 0.24);
        carryRebar.visible = false;

        const carryWheelbarrow = new THREE.Group();
        const wbTub = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.36), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }));
        wbTub.position.set(0, 0.02, 0.42);
        const wbConcrete = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.30), MO.mats.concrete);
        wbConcrete.position.set(0, 0.09, 0.42);
        const wbWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), MO.mats.steel);
        wbWheel.rotation.z = Math.PI / 2;
        wbWheel.position.set(0, -0.06, 0.62);
        carryWheelbarrow.add(wbTub, wbConcrete, wbWheel);
        carryWheelbarrow.visible = false;

        const toolHoe = new THREE.Group();
        const hShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.58, 6), MO.mats.wood);
        hShaft.rotation.x = Math.PI / 2; hShaft.position.set(0, -0.08, 0.22);
        const hBlade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.025), MO.mats.steel);
        hBlade.position.set(0, -0.12, 0.48);
        toolHoe.add(hShaft, hBlade); toolHoe.visible = false;
        armR.add(toolHoe);

        const toolHammer = new THREE.Group();
        const mShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6), MO.mats.wood);
        mShaft.rotation.x = Math.PI / 2; mShaft.position.set(0, -0.08, 0.14);
        const mHead = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.045), MO.mats.steel);
        mHead.position.set(0, -0.08, 0.26);
        toolHammer.add(mShaft, mHead); toolHammer.visible = false;
        armR.add(toolHammer);

        const toolTrowel = new THREE.Group();
        const tPlate = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.16), MO.mats.steel);
        tPlate.position.set(0, -0.10, 0.15);
        toolTrowel.add(tPlate); toolTrowel.visible = false;
        armR.add(toolTrowel);

        const propCup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.032, 0.09, 8),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 })
        );
        propCup.position.set(0, -0.10, 0.09);
        propCup.visible = false;
        armR.add(propCup);

        const propLunch = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.06, 0.12),
            new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 })
        );
        propLunch.position.set(0, -0.10, 0.11);
        propLunch.visible = false;
        armR.add(propLunch);

        const propClipboard = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.02, 0.19),
            new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 })
        );
        propClipboard.position.set(0, -0.10, 0.13);
        propClipboard.visible = false;
        armL.add(propClipboard);

        torsoPivot.add(
            torso, rainPoncho, armL, armR, head, helmet,
            headlampMount, headlampLens, headlampCone, headlampLight,
            carryBrick, carryPlank, carryBeam, carryBucket, carrySack, carryRebar, carryWheelbarrow
        );
        g.add(legL, legR, torsoPivot);

        const badge = createBadgeSprite();
        if (badge.sprite) g.add(badge.sprite);

        g.userData = { interactiveKind: 'worker', workerId: workerIdx };

        return {
            group: g, legL, legR, torsoPivot, armL, armR, rainPoncho,
            headlampLensMat, headlampConeMat, headlampCone, headlampLight,
            carryBrick, carryPlank, carryBeam, carryBucket, carrySack, carryRebar, carryWheelbarrow,
            toolHoe, toolHammer, toolTrowel,
            propCup, propLunch, propClipboard,
            setBadge: badge.setIcon
        };
    }

    function setWorkerTool(rig, toolName) {
        rig.carryBrick.visible = toolName === 'brick';
        rig.carryPlank.visible = toolName === 'plank';
        rig.carryBeam.visible = toolName === 'beam';
        rig.carryBucket.visible = toolName === 'bucket';
        rig.carrySack.visible = toolName === 'sack';
        rig.carryRebar.visible = toolName === 'rebar';
        rig.carryWheelbarrow.visible = toolName === 'wheelbarrow';
        rig.toolHoe.visible = toolName === 'hoe';
        rig.toolHammer.visible = toolName === 'hammer';
        rig.toolTrowel.visible = toolName === 'trowel';
        rig.propCup.visible = toolName === 'cup';
        rig.propLunch.visible = toolName === 'lunch';
        rig.propClipboard.visible = toolName === 'clipboard';
    }

    function setBodyVisible(w, visible) {
        w.rig.legL.visible = visible;
        w.rig.legR.visible = visible;
        w.rig.torsoPivot.visible = visible;
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
        setBodyVisible(w, true);
    }

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

    MO.hireMiniWorker = function() {
        const state = MO.state;
        if (state.workers.length >= 3) {
            MO.showToast('Equipe completa (3/3 ajudantes trabalhando na obra)!', '👷');
            return;
        }
        const styles = [
            { h: 0xfacc15, v: 0xd97706, n: 'Pedreiro Zé', role: 'builder' },
            { h: 0xe2e8f0, v: 0x334155, n: 'Servente Léo', role: 'helper' },
            { h: 0x65a30d, v: 0x475569, n: 'Mestre Beto', role: 'foreman' }
        ];
        const idx = state.workers.length;
        const st = styles[idx];
        const rig = createWorkerMesh(st.h, st.v, idx);
        const sx = state.mode === 'bridge' ? (-3.8 + idx * 0.4) : (-1.6 + idx * 1.4);
        const sz = 2.4;
        rig.group.position.set(sx, MO.getTerrainHeight(sx, sz), sz);
        MO.groups.workers.add(rig.group);
        state.workers.push({
            id: idx,
            name: st.n,
            role: st.role,
            rig,
            task: null,
            tx: sx,
            tz: sz,
            waypoints: [],
            timer: 0,
            subTimer: 0,
            stepDist: 0,
            stepSide: 1,
            stuckTimer: 0,
            speed: 2.75 + idx * 0.22,
            energy: 92 - idx * 8,
            hydration: 88 - idx * 10,
            hunger: 85 - idx * 12,
            sleepingInside: false,
            statusText: 'Chegou ao canteiro'
        });
        const lbl = document.getElementById('worker-btn-label');
        if (lbl) lbl.textContent = `Ajudante (${state.workers.length}/3)`;
        MO.SoundFX.playHammerWood();
        MO.showToast(`${st.n} entrou no canteiro!`, '👷');
    };

    function assignCampOrLifeTask(w, setToolFn, t, afterWorkCheck) {
        const state = MO.state;
        const camp = state.camp;
        if (!camp) return false;

        if (state.isNight) {
            const unbuiltLight = camp.floodlights.find(fl => !fl.built && fl.reserved === false);
            if (unbuiltLight) {
                unbuiltLight.reserved = w.id;
                w.task = { type: 'build-floodlight', light: unbuiltLight, duration: 0.90, subPhase: 'work' };
                setDestination(w, unbuiltLight.x, unbuiltLight.z);
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
                setDestination(w, myTent.x, myTent.z);
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
                    setDestination(w, freeTent.x, freeTent.z);
                    w.rig.setBadge('💤');
                    w.statusText = 'Descansando na barraca (revezamento)';
                    return true;
                }
            }
        }

        if (state.weather === 'rain' && camp.messHall && camp.messHall.built && (afterWorkCheck || w.energy < 48)) {
            const shSpot = camp.messHall.shelterSpots[w.id % camp.messHall.shelterSpots.length];
            w.task = { type: 'shelter-rain', duration: 2.5, subPhase: 'work' };
            setDestination(w, shSpot.x, shSpot.z);
            w.rig.setBadge('☔');
            w.statusText = 'Abrigado da chuva no refeitório';
            return true;
        }

        if (w.hydration < 28 && camp.messHall && camp.messHall.built && camp.waterCooler) {
            w.task = { type: 'drink-water', duration: 1.4, subPhase: 'work' };
            setDestination(w, camp.waterCooler.x, camp.waterCooler.z);
            w.rig.setBadge('💧');
            w.statusText = 'Bebendo água no galão';
            return true;
        }

        const isLunchHour = Math.abs(state.timeOfDay - 0.30) < 0.04;
        if ((w.hunger < 26 || (isLunchHour && w.hunger < 62)) && camp.messHall && camp.messHall.built) {
            const seat = camp.messHall.seats[w.id % camp.messHall.seats.length];
            w.task = { type: 'eat-meal', duration: 2.2, subPhase: 'work' };
            setDestination(w, seat.x, seat.z);
            w.rig.setBadge(isLunchHour ? '🍲' : '☕');
            w.statusText = isLunchHour ? 'Almoçando marmita no refeitório' : 'Fazendo pausa pro café';
            return true;
        }

        const campBuilderBusy = state.workers.some(o => o.task && (o.task.type === 'build-tent' || o.task.type === 'build-mess' || o.task.type === 'build-floodlight'));
        const canBuildCampNow = afterWorkCheck || (!campBuilderBusy && (state.phase > 0 || state.weeds.filter(wd => !wd.cleared).length < 6));
        if (canBuildCampNow) {
            const unbuiltLight = camp.floodlights.find(fl => !fl.built && fl.reserved === false);
            if (unbuiltLight) {
                unbuiltLight.reserved = w.id;
                w.task = { type: 'build-floodlight', light: unbuiltLight, duration: 0.85, subPhase: 'work' };
                setDestination(w, unbuiltLight.x, unbuiltLight.z);
                w.rig.setBadge('💡');
                w.statusText = 'Montando refletor portátil';
                setToolFn(w.rig, 'hammer');
                return true;
            }
            if (camp.messHall && !camp.messHall.built && camp.messHall.reserved === false) {
                camp.messHall.reserved = w.id;
                w.task = { type: 'build-mess', duration: 0.95, subPhase: 'work' };
                setDestination(w, camp.messHall.x, camp.messHall.z);
                w.rig.setBadge('🍲');
                w.statusText = 'Montando refeitório e bebedouro';
                setToolFn(w.rig, 'hammer');
                return true;
            }
            const unbuiltTent = camp.tents.find(tn => !tn.built && tn.reserved === false);
            if (unbuiltTent) {
                unbuiltTent.reserved = w.id;
                w.task = { type: 'build-tent', tent: unbuiltTent, duration: 0.80, subPhase: 'work' };
                setDestination(w, unbuiltTent.x, unbuiltTent.z);
                w.rig.setBadge('⛺');
                w.statusText = `Armando barraca #${unbuiltTent.id + 1}`;
                setToolFn(w.rig, 'hammer');
                return true;
            }
        }

        if (afterWorkCheck) {
            if (w.role === 'foreman') {
                const ang = t * 0.4 + w.id;
                w.task = { type: 'inspect-site', duration: 2.0, subPhase: 'work' };
                setDestination(w, Math.cos(ang) * 2.2, Math.sin(ang) * 2.0 - 0.3);
                w.rig.setBadge('📋');
                w.statusText = 'Vistoriando qualidade da obra';
                setToolFn(w.rig, 'clipboard');
                return true;
            }
            if (camp.messHall && camp.messHall.built) {
                const seat = camp.messHall.seats[w.id % camp.messHall.seats.length];
                w.task = { type: 'camp-hangout', duration: 1.8, subPhase: 'work' };
                setDestination(w, seat.x, seat.z);
                w.rig.setBadge(state.isNight ? '🔥' : '☕');
                w.statusText = state.isNight ? 'Esquentando no fogareiro' : 'Aguardando próxima etapa no refeitório';
                return true;
            }
        }
        return false;
    }

    function tryStartConcreteSupplyOrMix(w) {
        const state = MO.state;
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

        // Se ainda faltam ingredientes na masseira, busca saco de areia/cimento/água fisicamente!
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

        // Ingredientes completos -> bate massa com enxada na masseira!
        state.mixerWorkerBusy = true;
        w.task = { type: 'mix-mortar', duration: 1.35, subPhase: 'work' };
        setDestination(w, MO.STATION_MIXER.x, MO.STATION_MIXER.z + 1.02);
        setWorkerTool(w.rig, 'hoe');
        w.rig.setBadge('🥄');
        w.statusText = 'Batendo massa na masseira';
        return true;
    }

    // Converte tarefas de obra em transporte real: buscar no canteiro -> levar -> encaixar/concretar!
    function wrapTaskWithRealLogistics(w) {
        const tk = w.task;
        if (!tk) return true;
        const state = MO.state;
        const wallTarget = tk.wall || (tk.slot ? tk.slot.wallRef : null);

        // 1. Tijolos & Muro -> buscar no palete de tijolos
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

        // 2. Armadura de Aço -> buscar no rack de ferragens e encaixar no buraco
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

        // 3. Madeiras de Caixaria & Vigas/Longarinas -> buscar no rack de madeiras/vigas e encaixar
        if (
            tk.type === 'fw' || tk.type === 'beam-fw' || tk.type === 'roof-stage' ||
            tk.type === 'br-girder' || tk.type === 'bld-struct' || tk.type === 'tw-scaf' || tk.type === 'tw-steel'
        ) {
            const wantKind = (tk.type === 'br-girder' || tk.type === 'bld-struct' || tk.type === 'tw-steel') ? 'beam' : 'plank';
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

        // 4. Concreto/Massa (Colunas, Cintas, Contrapiso, Pilares) -> encher balde/carrinho na masseira primeiro!
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

        // Demais tarefas (cavar, mep, acabamento) aplicam approach inteligente evitando atravessar paredes
        tk.subPhase = 'work';
        setDestination(w, w.tx, w.tz, wallTarget);
        return true;
    }

    function assignWorkerTask(w, t) {
        const state = MO.state;
        setWorkerTool(w.rig, 'none');
        w.rig.torsoPivot.rotation.x = 0;
        w.rig.setBadge('');
        setBodyVisible(w, true);
        w.sleepingInside = false;

        if (assignCampOrLifeTask(w, setWorkerTool, t, false)) return;

        // Fase 0: Capina e terraplanagem
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

        // Primeiro garante insumos/massa batida se a obra precisar de concreto
        if (tryStartConcreteSupplyOrMix(w)) return;

        const modePlugin = MO.modes[state.mode];
        if (modePlugin && modePlugin.assignWorkerTask) {
            if (modePlugin.assignWorkerTask(w, setWorkerTool)) {
                if (w.task) {
                    if (wrapTaskWithRealLogistics(w)) return;
                }
            }
        }

        // Se faltou material e caminhão foi chamado, sinaliza ou constrói acampamento enquanto chega
        if (state.site.truckActive) {
            if (assignCampOrLifeTask(w, setWorkerTool, t, false)) return;
        }
        assignCampOrLifeTask(w, setWorkerTool, t, true);
    }

    MO.updateWorkers = function(dt, t) {
        const state = MO.state;
        const { stationGroup, hoeGroup, mixerFillMat, mixerBarGroup, mixerBarFill } = MO.mixer;
        const isDarkSite = state.isNight && !MO.areFloodlightsReady();
        const isHotBiome = state.biome === 'cerrado' || state.biome === 'coast';

        state.workers.forEach(w => {
            if (!w.sleepingInside) {
                const hydDrain = (isHotBiome && !state.isNight) ? 1.15 : 0.72;
                const engDrain = isDarkSite ? 1.05 : 0.62;
                w.hydration = Math.max(0, w.hydration - dt * hydDrain);
                w.hunger = Math.max(0, w.hunger - dt * 0.52);
                w.energy = Math.max(0, w.energy - dt * engDrain);
            } else {
                w.energy = Math.min(100, w.energy + dt * 11.5);
            }

            const headlampOn = state.isNight && !w.sleepingInside;
            w.rig.headlampLensMat.emissiveIntensity = headlampOn ? 2.2 : 0.0;
            w.rig.headlampCone.visible = headlampOn;
            w.rig.headlampConeMat.opacity = headlampOn ? 0.13 : 0.0;
            w.rig.headlampLight.intensity = headlampOn ? 1.05 : 0.0;
            w.rig.rainPoncho.visible = state.weather === 'rain' && !w.sleepingInside;

            if (w.task && w.task.type === 'sleep-tent' && MO.state.camp.nightMode === 'sleep' && !state.isNight && w.sleepingInside) {
                releaseCampReservations(w);
                w.energy = Math.max(w.energy, 85);
                w.task = null;
                w.rig.setBadge('☀️');
                return;
            }

            if (!w.task) {
                w.rig.torsoPivot.rotation.x = Math.sin(t * 2 + w.id) * 0.03;
                w.rig.armL.rotation.x = Math.sin(t * 1.5 + w.id) * 0.06;
                w.rig.armR.rotation.x = -Math.sin(t * 1.5 + w.id) * 0.06;
                assignWorkerTask(w, t);
                return;
            }

            if (isDarkSite && w.task.type !== 'build-floodlight' && w.task.type !== 'sleep-tent') {
                w.rig.setBadge('🔦');
            }

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

            const dx = goalX - pos.x, dz = goalZ - pos.z;
            const distToGoal = Math.hypot(w.tx - pos.x, w.tz - pos.z);
            const distStepTarget = Math.hypot(dx, dz);

            const lifeSpeedMult = isDarkSite && w.task.type !== 'build-floodlight' ? 0.72 : (w.energy > 75 ? 1.08 : 0.98);
            const arrivalThreshold = (w.stuckTimer > 2.2) ? 1.05 : 0.42;

            if (distToGoal > arrivalThreshold && distStepTarget > 0.05) {
                const prevX = pos.x, prevZ = pos.z;
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
                    // Se o cômodo estiver 100% fechado sem porta (usuário esqueceu porta), solta tarefa após tentar contornar
                    if (w.stuckTimer > 4.5 && distToGoal > 1.05) {
                        releaseTaskReservations(w.task);
                        setWorkerTool(w.rig, 'none');
                        w.task = null;
                        w.stuckTimer = 0;
                        return;
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

                const carrying = w.rig.carryBrick.visible || w.rig.carryPlank.visible || w.rig.carryBeam.visible || w.rig.carryBucket.visible || w.rig.carrySack.visible || w.rig.carryRebar.visible || w.rig.carryWheelbarrow.visible;
                w.rig.armL.rotation.x = carrying ? -1.05 : -cyc * 0.45;
                w.rig.armR.rotation.x = carrying ? -1.05 : cyc * 0.45;
                pos.y = Math.max(MO.WATER_LEVEL + 0.05, MO.getTerrainHeight(pos.x, pos.z)) + Math.abs(cyc) * 0.032;

                // Deixa pegadas / rastros temporários no chão ou ondulações na água ao caminhar!
                w.stepDist += actualMoved;
                if (w.stepDist > 0.40 && MO.spawnGroundTrack) {
                    w.stepDist = 0;
                    w.stepSide *= -1;
                    const sideX = pos.x + Math.cos(yaw) * 0.075 * w.stepSide;
                    const sideZ = pos.z - Math.sin(yaw) * 0.075 * w.stepSide;
                    MO.spawnGroundTrack(sideX, sideZ, 'boot', yaw);
                }
                return;
            }

            // Chegou ao ponto da sub-etapa!
            const tk = w.task;

            // --- SUB-FASE PICKUP: pegar material real e levar até a obra ---
            if (tk.subPhase === 'pickup') {
                w.timer += dt;
                w.rig.legL.rotation.x = 0; w.rig.legR.rotation.x = 0;
                w.rig.torsoPivot.rotation.x = 0.42;
                w.rig.armL.rotation.x = -1.1; w.rig.armR.rotation.x = -1.1;

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
                if (tk.needsBucketFill) {
                    MO.fillBucketFromMixer();
                    tk.needsBucketFill = false;
                }

                tk.subPhase = 'deliver';
                setWorkerTool(w.rig, tk.carryTool || 'none');
                setDestination(w, tk.deliverX, tk.deliverZ, tk.wallTarget);
                w.rig.setBadge('');
                w.statusText = tk.type === 'rebar' ? 'Carregando armadura até o buraco' : (tk.carryTool === 'brick' ? 'Levando tijolo até a parede' : 'Transportando carga até a obra');
                return;
            }

            // --- CHEGOU NO DESTINO FINAL: EXECUTA AÇÃO/ENCAIXE ---
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
            } else if (tk.type === 'inspect-site') {
                setWorkerTool(w.rig, 'clipboard');
                w.rig.torsoPivot.rotation.x = 0.10;
                w.rig.armL.rotation.x = -0.95;
                w.rig.armR.rotation.x = -0.3 + Math.sin(t * 5) * 0.15;
            } else if (tk.type === 'feed-mixer') {
                w.rig.group.rotation.y = Math.atan2(MO.STATION_MIXER.x - pos.x, MO.STATION_MIXER.z - pos.z);
                w.rig.torsoPivot.rotation.x = 0.42;
                w.rig.armL.rotation.x = -1.35; w.rig.armR.rotation.x = -1.35;
            } else if (tk.type === 'rebar') {
                // Animação de baixar e encaixar a armadura dentro da sapata cavada
                w.rig.torsoPivot.rotation.x = 0.30;
                w.rig.armL.rotation.x = -1.1 + (w.timer / dur) * 0.45;
                w.rig.armR.rotation.x = -1.1 + (w.timer / dur) * 0.45;
            } else if (tk.type === 'weed' || tk.type === 'level-spot' || tk.type === 'dig' || tk.type === 'tw-dig') {
                const swing = Math.sin(t * 22);
                w.rig.torsoPivot.rotation.x = 0.35 + swing * 0.14;
                w.rig.armL.rotation.x = -0.85 + swing * 0.55;
                w.rig.armR.rotation.x = -0.95 + swing * 0.65;
                if (w.subTimer > 0.22) {
                    w.subTimer = 0;
                    MO.spawnBurst(pos.x, pos.y + 0.12, pos.z, tk.type === 'weed' ? 0x4d7c0f : 0x7a654d, 4, 0.05);
                }
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
                tk.type === 'build-tent' || tk.type === 'build-mess' || tk.type === 'build-floodlight'
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

            if (w.timer < dur) return;
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
            } else if (tk.type === 'build-tent') {
                if (MO.completeTentBuild) MO.completeTentBuild(tk.tent);
            } else if (tk.type === 'build-mess') {
                if (MO.completeMessBuild) MO.completeMessBuild();
            } else if (tk.type === 'build-floodlight') {
                if (MO.completeFloodlightBuild) MO.completeFloodlightBuild(tk.light);
            } else if (tk.type === 'drink-water') {
                w.hydration = 100;
                w.energy = Math.min(100, w.energy + 10);
                MO.SoundFX.playWaterRush();
            } else if (tk.type === 'eat-meal') {
                w.hunger = 100;
                w.energy = Math.min(100, w.energy + 22);
                w.hydration = Math.min(100, w.hydration + 18);
            } else if (tk.type === 'sleep-tent') {
                w.energy = 100;
                releaseCampReservations(w);
            } else if (tk.type === 'shelter-rain' || tk.type === 'camp-hangout') {
                w.energy = Math.min(100, w.energy + 12);
            } else if (tk.type === 'weed') {
                MO.clearWeedItem(tk.weed);
            } else if (tk.type === 'level-spot') {
                MO.paintLevelWeight(tk.spot.x, tk.spot.z, 1.85, 0.92);
                tk.spot.done = true; tk.spot.res = false;
                MO.updateTerrainGeometry();
                MO.SoundFX.playDirtShovel();
            } else if (tk.type === 'mix-mortar') {
                hoeGroup.visible = false;
                mixerBarGroup.visible = false;
                state.mixProgress = 100;
                state.mortarCharges = 12;
                state.sand = 0; state.cement = 0; state.water = 0;
                state.mixerWorkerBusy = false;
                MO.updateMixerVisuals();
                MO.SoundFX.playMortarSquish();
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

            setWorkerTool(w.rig, 'none');
            w.rig.torsoPivot.rotation.x = 0;
            w.rig.setBadge('');
            w.task = null;
        });
    };

    MO.regenerateNewTerrain = function(targetMode, forcedBiome) {
        const state = MO.state;
        if (targetMode && MO.modes[targetMode]) {
            state.mode = targetMode;
        }
        state.seed = Math.floor(1000 + Math.random() * 8999);

        const nextBiome = forcedBiome || MO.BIOME_ORDER[state.seed % MO.BIOME_ORDER.length];
        if (MO.applyBiomeStyle) MO.applyBiomeStyle(nextBiome);
        if (MO.setWeather) MO.setWeather('clear');
        if (MO.resetStructuralState) MO.resetStructuralState();

        MO.levelMap.fill(0);
        state.phase = 0;
        state.sand = 0; state.cement = 0; state.water = 0; state.mortarCharges = 0; state.bucketCharges = 0;
        state.looseRebars = []; state.looseBeams = []; state.looseBricks = []; state.workers = [];
        state.site.tracks = []; state.site.ripples = [];
        state.screensaverCompletedTime = 0;
        MO.resetBucketRef();

        [
            MO.groups.blueprint, MO.groups.foundation, MO.groups.looseRebars, MO.groups.walls,
            MO.groups.muroStair, MO.groups.looseBricks, MO.groups.floor, MO.groups.mep,
            MO.groups.roof, MO.groups.bridge, MO.groups.building, MO.groups.tower,
            MO.groups.camp, MO.groups.workers, MO.groups.fx, MO.groups.physicsSupplies, MO.groups.weeds
        ].forEach(g => { while (g.children.length > 0) g.remove(g.children[0]); });
        state.draggableSupplies = [];

        MO.toggleXRayMode(false);
        MO.createProceduralTerrainMesh();
        MO.populateNatureAndSplats();
        MO.populateBuildableLotWeeds();
        MO.placeMixerStationOnTerrain();
        MO.restockSupplies(true);
        if (MO.rebuildSiteProps) MO.rebuildSiteProps();
        if (MO.rebuildCamp) MO.rebuildCamp();
        if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck();

        const modePlugin = MO.modes[state.mode];
        if (modePlugin && modePlugin.onInit) modePlugin.onInit();

        const lbl = document.getElementById('worker-btn-label');
        if (lbl) lbl.textContent = 'Ajudante (0/3)';
        MO.syncPhaseUI();

        if (state.screensaver) {
            while (state.workers.length < 3) MO.hireMiniWorker();
        }

        const modeNames = {
            house: 'Casa no Campo',
            bridge: 'Ponte sobre o Rio',
            building: 'Edifício Multi-Andar',
            tower: 'Torre Treliçada'
        };
        const biomeLabel = (MO.BIOMES && MO.BIOMES[state.biome]) ? MO.BIOMES[state.biome].label : state.biome;
        MO.showToast(`Contrato: ${modeNames[state.mode]} · Bioma ${biomeLabel} (#${state.seed})`, '🏗️');
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
            while (state.workers.length < 3) {
                MO.hireMiniWorker();
            }
            MO.showToast('🌙 Modo Protetor de Tela Ativo! Equipe montando acampamento e obra.', '✨');
        } else {
            MO.showToast('Modo Protetor de Tela pausado. Controle manual ativo.', '📐');
        }
    };

    MO.updateScreensaverAutopilot = function(dt, t) {
        const state = MO.state;
        if (!state.screensaver) return;

        if (!MO.camOrbit.isDragging) {
            MO.camOrbit.theta += dt * 0.14;
            MO.camOrbit.phi = 0.84 + Math.sin(t * 0.25) * 0.08;
        }

        if (state.workers.length < 3) {
            MO.hireMiniWorker();
        }

        const modePlugin = MO.modes[state.mode];
        const finished = modePlugin && modePlugin.updateAutopilot ? modePlugin.updateAutopilot(dt, t) : false;

        if (finished) {
            if (state.screensaverCompletedTime === 0) {
                state.screensaverCompletedTime = t;
                MO.showToast('🏆 Obra concluída pela equipe! Apreciando o resultado antes do próximo contrato...', '🌟');
            } else if (t - state.screensaverCompletedTime > 7.5) {
                state.screensaverCompletedTime = 0;
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

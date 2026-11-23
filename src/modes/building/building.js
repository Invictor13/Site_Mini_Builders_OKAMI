// =========================================================================
// MODO 3: PRÉDIO MULTI-ANDAR (2-4 ANDARES, GRUA, CORTE & MOBÍLIA INTERNA)
// =========================================================================
(function(MO) {
    const BLD_W = 3.6;
    const BLD_D = 3.2;
    const FLOOR_H = 1.45;
    const BLD_Z = -0.6;

    function createTowerCrane(mastH) {
        const g = new THREE.Group();
        const cx = -3.8, cz = -2.4;
        const baseY = MO.getTerrainHeight(cx, cz);
        g.position.set(cx, baseY, cz);

        const yellowMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.45, metalness: 0.35 });
        const darkMat = MO.mats.steel;

        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.1), MO.mats.concreteDark);
        pad.position.y = 0.14; pad.castShadow = true;
        g.add(pad);

        [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([mx, mz]) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, mastH, 6), yellowMat);
            post.position.set(mx, mastH / 2 + 0.25, mz);
            post.castShadow = true;
            g.add(post);
        });
        for (let y = 0.6; y < mastH; y += 0.65) {
            const ring = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), yellowMat);
            ring.position.y = y;
            g.add(ring);
        }

        const jibPivot = new THREE.Group();
        jibPivot.position.y = mastH + 0.3;

        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.50, 0.48), yellowMat);
        cab.position.set(0.15, 0.25, 0);
        const jib = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.22, 0.26), yellowMat);
        jib.position.set(2.1, 0.45, 0); jib.castShadow = true;
        const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.44), MO.mats.concreteDark);
        counterWeight.position.set(-1.35, 0.35, 0);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.9, 4), yellowMat);
        spire.position.set(0, 0.9, 0); spire.rotation.y = Math.PI / 4;

        const trolley = new THREE.Group();
        trolley.position.set(3.2, 0.32, 0);
        const cart = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.30), darkMat);
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.0, 6), darkMat);
        cable.position.y = -1.0;
        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 }));
        hook.position.y = -2.0;
        trolley.add(cart, cable, hook);

        jibPivot.add(cab, jib, counterWeight, spire, trolley);
        g.add(jibPivot);
        MO.groups.building.add(g);

        return { group: g, jibPivot, trolley, cable, hook, cx, cz };
    }

    function buildBuildingSkeleton() {
        const bg = MO.groups.building;
        const bld = MO.state.building;
        while (bg.children.length > 0) bg.remove(bg.children[0]);

        // Variação procedural de 2 a 4 andares + cor da fachada
        const floorCounts = [2, 3, 4];
        bld.numFloors = floorCounts[MO.state.seed % floorCounts.length];
        MO.state.variant = `${bld.numFloors}-andares`;

        const facadeColors = ['#e2e8f0', '#cbd5e1', '#dfd3be', '#94a3b8'];
        const chosenFacadeHex = facadeColors[MO.state.seed % facadeColors.length];

        bld.floors = [];
        bld.floorCut = bld.numFloors;
        bld.roofDone = false;
        bld.roofBusy = false;
        bld.craneAngle = 0;
        bld.craneTargetAngle = 0.45;
        bld.crane = createTowerCrane(1.8 + bld.numFloors * FLOOR_H + 1.2);

        const baseFloorY = MO.PLATEAU_Y + 0.05;

        const pad = new THREE.Mesh(new THREE.BoxGeometry(BLD_W + 0.4, 0.22, BLD_D + 0.4), MO.mats.concreteDark);
        pad.position.set(0, baseFloorY, BLD_Z);
        pad.receiveShadow = true;
        bg.add(pad);

        for (let f = 0; f < bld.numFloors; f++) {
            const fy = baseFloorY + 0.12 + f * FLOOR_H;
            const fg = new THREE.Group();
            bg.add(fg);

            const guide = new THREE.Mesh(
                new THREE.BoxGeometry(BLD_W, 0.06, BLD_D),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18, depthWrite: false })
            );
            guide.position.set(0, fy + 0.03, BLD_Z);
            fg.add(guide);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(BLD_W + 0.2, FLOOR_H, BLD_D + 0.2), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.set(0, fy + FLOOR_H / 2, BLD_Z);

            const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(BLD_W + 0.14, 0.14, BLD_D + 0.14), MO.mats.concrete);
            slabMesh.position.set(0, fy + FLOOR_H, BLD_Z);
            slabMesh.castShadow = true; slabMesh.receiveShadow = true;
            slabMesh.visible = false;
            fg.add(slabMesh);

            const structGroup = new THREE.Group();
            [[-BLD_W / 2 + 0.15, -BLD_D / 2 + 0.15], [0, -BLD_D / 2 + 0.15], [BLD_W / 2 - 0.15, -BLD_D / 2 + 0.15],
             [-BLD_W / 2 + 0.15, BLD_D / 2 - 0.15], [0, BLD_D / 2 - 0.15], [BLD_W / 2 - 0.15, BLD_D / 2 - 0.15]].forEach(([px, pz]) => {
                const col = new THREE.Mesh(new THREE.BoxGeometry(0.26, FLOOR_H, 0.26), MO.mats.concrete);
                col.position.set(px, fy + FLOOR_H / 2, BLD_Z + pz);
                col.castShadow = true;
                structGroup.add(col);
            });
            const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.95, FLOOR_H, 0.95), MO.mats.concreteDark);
            shaft.position.set(0, fy + FLOOR_H / 2, BLD_Z);
            shaft.castShadow = true;
            structGroup.add(shaft);
            structGroup.visible = false;
            fg.add(structGroup);

            const wallGroup = new THREE.Group();
            const wallMat = new THREE.MeshStandardMaterial({ map: MO.mats.brickCeramic.map, roughness: 0.84 });
            [-BLD_D / 2 + 0.1, BLD_D / 2 - 0.1].forEach(wz => {
                const sill = new THREE.Mesh(new THREE.BoxGeometry(BLD_W - 0.3, 0.42, 0.16), wallMat);
                sill.position.set(0, fy + 0.21, BLD_Z + wz);
                const head = new THREE.Mesh(new THREE.BoxGeometry(BLD_W - 0.3, 0.24, 0.16), wallMat);
                head.position.set(0, fy + FLOOR_H - 0.18, BLD_Z + wz);
                sill.castShadow = true; head.castShadow = true;
                wallGroup.add(sill, head);
            });
            [-BLD_W / 2 + 0.1, BLD_W / 2 - 0.1].forEach(wx => {
                const sideSill = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, BLD_D - 0.3), wallMat);
                sideSill.position.set(wx, fy + 0.225, BLD_Z);
                const sideHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, BLD_D - 0.3), wallMat);
                sideHead.position.set(wx, fy + FLOOR_H - 0.18, BLD_Z);
                sideSill.castShadow = true; sideHead.castShadow = true;
                wallGroup.add(sideSill, sideHead);
            });
            wallGroup.visible = false;
            fg.add(wallGroup);

            const mepGroup = new THREE.Group();
            const pElec = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, FLOOR_H, 8), MO.mats.conduit);
            pElec.position.set(-0.65, fy + FLOOR_H / 2, BLD_Z);
            const pWater = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, FLOOR_H, 8), MO.mats.pipeCold);
            pWater.position.set(0.65, fy + FLOOR_H / 2, BLD_Z);
            const pSewage = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, FLOOR_H, 8), MO.mats.pipeSewage);
            pSewage.position.set(0.82, fy + FLOOR_H / 2, BLD_Z);
            const pLight = new THREE.PointLight(0xffd28a, 0, 5.2);
            pLight.position.set(0, fy + FLOOR_H - 0.25, BLD_Z + 0.5);
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.09, 8, 8),
                new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfbbf24, emissiveIntensity: 1.2 })
            );
            bulb.position.set(0, fy + FLOOR_H - 0.14, BLD_Z + 0.5);
            mepGroup.add(pElec, pWater, pSewage, pLight, bulb);
            mepGroup.visible = false;
            fg.add(mepGroup);

            const facadeGroup = new THREE.Group();
            const fMat = new THREE.MeshStandardMaterial({ color: chosenFacadeHex, roughness: 0.72 });
            [-BLD_D / 2 + 0.09, BLD_D / 2 - 0.09].forEach(wz => {
                const bandB = new THREE.Mesh(new THREE.BoxGeometry(BLD_W + 0.06, 0.44, 0.18), fMat);
                bandB.position.set(0, fy + 0.22, BLD_Z + wz);
                const bandT = new THREE.Mesh(new THREE.BoxGeometry(BLD_W + 0.06, 0.26, 0.18), fMat);
                bandT.position.set(0, fy + FLOOR_H - 0.14, BLD_Z + wz);
                const glass = new THREE.Mesh(new THREE.BoxGeometry(BLD_W - 0.4, FLOOR_H - 0.68, 0.04), MO.mats.glass);
                glass.position.set(0, fy + 0.44 + (FLOOR_H - 0.68) / 2, BLD_Z + wz);
                facadeGroup.add(bandB, bandT, glass);
            });
            [-BLD_W / 2 + 0.09, BLD_W / 2 - 0.09].forEach(wx => {
                const sB = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, BLD_D + 0.06), fMat);
                sB.position.set(wx, fy + 0.23, BLD_Z);
                const sT = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, BLD_D + 0.06), fMat);
                sT.position.set(wx, fy + FLOOR_H - 0.14, BLD_Z);
                const sG = new THREE.Mesh(new THREE.BoxGeometry(0.04, FLOOR_H - 0.70, BLD_D - 0.4), MO.mats.glass);
                sG.position.set(wx, fy + 0.44 + (FLOOR_H - 0.70) / 2, BLD_Z);
                facadeGroup.add(sB, sT, sG);
            });
            // Mobília interna visível pelas janelas panorâmicas
            const desk1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.34, 0.42), MO.mats.doorWood);
            desk1.position.set(-0.95, fy + 0.24, BLD_Z + 0.75);
            const desk2 = desk1.clone(); desk2.position.set(0.95, fy + 0.24, BLD_Z + 0.75);
            facadeGroup.add(desk1, desk2);
            facadeGroup.visible = false;
            fg.add(facadeGroup);

            const floorObj = {
                index: f, baseY: fy, group: fg, guide, hitbox: hit,
                structGroup, slabMesh, wallGroup, wallMat, mepGroup, facadeGroup, fMat, light: pLight,
                hasStruct: false, hasSlab: false, hasWalls: false, mepDone: false, facadeDone: false, res: false
            };
            hit.userData = { buildingFloor: floorObj };
            fg.add(hit);
            bld.floors.push(floorObj);
        }

        const roofY = baseFloorY + 0.12 + bld.numFloors * FLOOR_H + 0.07;
        const roofGrp = new THREE.Group();
        const parapet1 = new THREE.Mesh(new THREE.BoxGeometry(BLD_W + 0.18, 0.32, 0.14), MO.mats.concreteDark);
        parapet1.position.set(0, roofY + 0.16, BLD_Z + BLD_D / 2);
        const parapet2 = parapet1.clone(); parapet2.position.z = BLD_Z - BLD_D / 2;
        const parapet3 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, BLD_D + 0.18), MO.mats.concreteDark);
        parapet3.position.set(-BLD_W / 2, roofY + 0.16, BLD_Z);
        const parapet4 = parapet3.clone(); parapet4.position.x = BLD_W / 2;
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 0.65, 16), MO.mats.waterTank);
        tank.position.set(-1.1, roofY + 0.33, BLD_Z - 0.7);
        const heliRing = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.68, 24),
            new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
        );
        heliRing.rotation.x = -Math.PI / 2;
        heliRing.position.set(0.5, roofY + 0.02, BLD_Z + 0.2);
        roofGrp.add(parapet1, parapet2, parapet3, parapet4, tank, heliRing);
        roofGrp.visible = false;
        bg.add(roofGrp);
        bld.roofGroup = roofGrp;
    }

    MO.setBuildingFloorCut = function(maxFloorIdx) {
        const bld = MO.state.building;
        bld.floorCut = maxFloorIdx;
        bld.floors.forEach(fl => {
            fl.group.visible = fl.index <= maxFloorIdx;
        });
        if (bld.roofGroup) {
            bld.roofGroup.visible = bld.roofDone && maxFloorIdx >= bld.numFloors - 1;
        }
        document.querySelectorAll('[data-floor-cut]').forEach(b => {
            b.classList.toggle('active', Number(b.getAttribute('data-floor-cut')) === maxFloorIdx);
        });
    };

    function aimCraneAtFloor(fl) {
        const bld = MO.state.building;
        if (!bld.crane) return;
        bld.craneTargetAngle = Math.atan2(-(BLD_Z - bld.crane.cz), 0 - bld.crane.cx) + (fl.index - 1) * 0.18;
    }

    function buildFloorStructure(fl) {
        if (fl.hasStruct) return;
        fl.hasStruct = true; fl.res = false;
        fl.structGroup.visible = true;
        aimCraneAtFloor(fl);
        if (MO.spawnWeldSparks) MO.spawnWeldSparks(0, fl.baseY + 0.6, BLD_Z);
        else MO.SoundFX.playMetalClang();
    }

    function pourFloorSlab(fl) {
        if (!fl.hasStruct || fl.hasSlab) return;
        fl.hasSlab = true; fl.res = false;
        fl.slabMesh.visible = true;
        fl.guide.visible = false;
        aimCraneAtFloor(fl);
        MO.spawnBurst(0, fl.baseY + FLOOR_H, BLD_Z, 0x94a3b8, 10);
        MO.SoundFX.playMortarSquish();
    }

    function buildFloorWalls(fl) {
        if (!fl.hasSlab || fl.hasWalls) return;
        fl.hasWalls = true; fl.res = false;
        fl.wallGroup.visible = true;
        aimCraneAtFloor(fl);
        MO.spawnBurst(0, fl.baseY + 0.5, BLD_Z, 0x9d4627, 10);
        MO.SoundFX.playBrickClack();
    }

    function installFloorMEP(fl) {
        if (!fl.hasWalls || fl.mepDone) return;
        fl.mepDone = true; fl.res = false;
        fl.mepGroup.visible = true;
        fl.light.intensity = MO.state.isNight ? 2.0 : 0.6;
        MO.SoundFX.playElectricSwitch();
    }

    function finishFloorFacade(fl) {
        if (!fl.mepDone || fl.facadeDone) return;
        fl.facadeDone = true; fl.res = false;
        fl.facadeGroup.visible = true;
        aimCraneAtFloor(fl);
        MO.SoundFX.playMortarSquish();
    }

    function finishBuildingRoof() {
        const state = MO.state;
        const bld = state.building;
        if (bld.roofDone) return;

        if (state.riskProfile === 'realistic' && state.structural.integrity < 72 && !state.structural.repairedOnce) {
            MO.triggerStructuralCollapse('SOBRECARGA NA LAJE SUPERIOR DO EDIFÍCIO', { x: 0, y: 2.5, z: BLD_Z });
            if (!state.screensaver) return;
        }

        bld.roofDone = true;
        if (bld.roofGroup) bld.roofGroup.visible = true;
        MO.approveStructure(`✅ HABITE-SE APROVADO · ${bld.numFloors} PAVIMENTOS`);
        MO.showToast(`🏢 Edifício de ${bld.numFloors} andares concluído com Heliponto!`, '🏆');
    }

    MO.advanceBuildingPhase2 = function() {
        const bld = MO.state.building;
        if (!bld.floors.every(f => f.hasSlab) && !MO.state.screensaver) {
            MO.showToast('Conclua os pilares e lajes de todos os andares antes da alvenaria!', '⚠️');
            return;
        }
        MO.state.phase = 2;
        MO.syncPhaseUI();
        MO.selectTool('bld-wall');
        if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck();
        MO.showToast('Fase 2: Suba as paredes dos andares e instale as prumadas MEP!', '🧱');
    };

    MO.advanceBuildingPhase3 = function() {
        const bld = MO.state.building;
        if (!bld.floors.every(f => f.mepDone) && !MO.state.screensaver) {
            MO.showToast('Conclua a alvenaria e prumadas MEP de todos os andares!', '⚠️');
            return;
        }
        MO.state.phase = 3;
        MO.toggleXRayMode(false);
        MO.syncPhaseUI();
        MO.selectTool('bld-facade');
        MO.showToast('Fase 3: Aplique fachada de vidro nos pavimentos e finalize a Cobertura!', '🏢');
    };

    MO.modes.building = {
        id: 'building',
        label: 'Edifício Multi-Andar',

        onInit() {
            MO.state.phase = 0;
            buildBuildingSkeleton();
            MO.selectTool('clear-weeds');
        },

        onStartPhase1() {
            MO.state.phase = 1;
            MO.syncPhaseUI();
            MO.setBuildingFloorCut(4);
            MO.selectTool('bld-struct');
            MO.showToast(`Fase 1: Edifício de ${MO.state.building.numFloors} andares! Erga pilares e lajes.`, '🏗️');
        },

        updateSimulation(dt, t) {
            const bld = MO.state.building;
            if (bld.crane && bld.crane.jibPivot) {
                const windSway = MO.state.weather === 'wind' ? Math.sin(t * 1.4) * 0.45 : 0;
                const target = bld.craneTargetAngle + Math.sin(t * 0.45) * 0.25 + windSway;
                bld.craneAngle += (target - bld.craneAngle) * Math.min(1, dt * 2.0);
                bld.crane.jibPivot.rotation.y = bld.craneAngle;
                bld.crane.trolley.position.x = 2.8 + Math.sin(t * 0.7) * 0.6;
            }
        },

        handlePointerDown(raycaster) {
            const state = MO.state;
            if (state.phase < 1) return false;
            const hits = raycaster.intersectObjects(MO.groups.building.children, true);
            for (let h of hits) {
                const fl = h.object.userData.buildingFloor;
                if (!fl || !fl.group.visible) continue;

                if (state.phase === 1) {
                    if (state.tool === 'bld-struct' && !fl.hasStruct) { buildFloorStructure(fl); return true; }
                    if (state.tool === 'bld-slab' && fl.hasStruct && !fl.hasSlab) { pourFloorSlab(fl); return true; }
                } else if (state.phase === 2) {
                    if (state.tool === 'bld-wall' && !fl.hasWalls) { buildFloorWalls(fl); return true; }
                    if (state.tool === 'bld-mep' && fl.hasWalls && !fl.mepDone) { installFloorMEP(fl); return true; }
                } else if (state.phase === 3) {
                    if (state.tool === 'bld-facade' && !fl.facadeDone) { finishFloorFacade(fl); return true; }
                    if (state.tool === 'bld-roof' && state.building.floors.every(f => f.facadeDone)) { finishBuildingRoof(); return true; }
                }
            }
            return false;
        },

        assignWorkerTask(w, setWorkerTool) {
            const state = MO.state;
            const bld = state.building;
            if (state.phase === 1) {
                const f1 = bld.floors.find(f => !f.hasStruct && !f.res && (f.index === 0 || bld.floors[f.index - 1].hasSlab));
                if (f1) { f1.res = true; w.task = { type: 'bld-struct', item: f1, duration: 0.60 }; w.tx = -1.6; w.tz = BLD_Z + 1.4; setWorkerTool(w.rig, 'hammer'); return true; }
                const f2 = bld.floors.find(f => f.hasStruct && !f.hasSlab && !f.res);
                if (f2) { f2.res = true; w.task = { type: 'bld-slab', item: f2, duration: 0.56 }; w.tx = 1.6; w.tz = BLD_Z + 1.4; setWorkerTool(w.rig, 'trowel'); return true; }
            }
            if (state.phase === 2) {
                const f3 = bld.floors.find(f => f.hasSlab && !f.hasWalls && !f.res);
                if (f3) { f3.res = true; w.task = { type: 'bld-wall', item: f3, duration: 0.55 }; w.tx = -1.5; w.tz = BLD_Z - 1.5; setWorkerTool(w.rig, 'brick'); return true; }
                const f4 = bld.floors.find(f => f.hasWalls && !f.mepDone && !f.res);
                if (f4) { f4.res = true; w.task = { type: 'bld-mep', item: f4, duration: 0.50 }; w.tx = 1.5; w.tz = BLD_Z - 1.5; setWorkerTool(w.rig, 'hammer'); return true; }
            }
            if (state.phase === 3) {
                const f5 = bld.floors.find(f => f.mepDone && !f.facadeDone && !f.res);
                if (f5) { f5.res = true; w.task = { type: 'bld-facade', item: f5, duration: 0.58 }; w.tx = 0; w.tz = BLD_Z + 1.8; setWorkerTool(w.rig, 'trowel'); return true; }
                if (bld.floors.every(f => f.facadeDone) && !bld.roofDone && !bld.roofBusy) {
                    bld.roofBusy = true;
                    w.task = { type: 'bld-roof', duration: 0.70 }; w.tx = -0.8; w.tz = BLD_Z + 1.7; setWorkerTool(w.rig, 'hammer'); return true;
                }
            }
            return false;
        },

        completeWorkerTask(tk) {
            if (tk.type === 'bld-struct') buildFloorStructure(tk.item);
            else if (tk.type === 'bld-slab') pourFloorSlab(tk.item);
            else if (tk.type === 'bld-wall') buildFloorWalls(tk.item);
            else if (tk.type === 'bld-mep') installFloorMEP(tk.item);
            else if (tk.type === 'bld-facade') finishFloorFacade(tk.item);
            else if (tk.type === 'bld-roof') { finishBuildingRoof(); MO.state.building.roofBusy = false; }
        },

        updateAutopilot(dt) {
            const state = MO.state;
            const bld = state.building;
            if (state.structural.collapsed) {
                state.structural.collapseTimer += dt;
                if (state.structural.collapseTimer > 3.2) {
                    MO.resetStructuralState();
                    state.structural.repairedOnce = true;
                    state.structural.integrity = 100;
                    bld.roofDone = false;
                    bld.roofBusy = false;
                    MO.showToast('🔧 Equipe reforçou a cobertura e retomou a obra!', '🔧');
                    finishBuildingRoof();
                }
                return false;
            }
            if (state.phase === 0) {
                if (state.weeds.every(w => w.cleared) && MO.computeLotLevelProgress() >= 90) {
                    MO.modes.building.onStartPhase1();
                }
            } else if (state.phase === 1) {
                if (bld.floors.every(f => f.hasSlab)) MO.advanceBuildingPhase2();
            } else if (state.phase === 2) {
                if (bld.floors.every(f => f.mepDone)) MO.advanceBuildingPhase3();
            } else if (state.phase === 3) {
                if (bld.roofDone) return true;
            }
            return false;
        }
    };

    MO.setBuildingFloorCut = MO.setBuildingFloorCut;
    MO.advanceBuildingPhase2 = MO.advanceBuildingPhase2;
    MO.advanceBuildingPhase3 = MO.advanceBuildingPhase3;
    MO.finishBuildingRoof = finishBuildingRoof;
})(window.MO = window.MO || {});

// =========================================================================
// MODO 4: TORRE TRELIÇADA / FAROL / TELECOM (VARIANTES & TESTE DE VENTO)
// =========================================================================
(function(MO) {
    const TOWER_Z = -0.3;

    function buildTowerSkeleton() {
        const tg = MO.groups.tower;
        const tw = MO.state.tower;
        while (tg.children.length > 0) tg.remove(tg.children[0]);

        const variants = ['lattice', 'telecom', 'lighthouse'];
        MO.state.variant = variants[MO.state.seed % variants.length];

        tw.footings = [];
        tw.tiers = [];
        tw.topInstalled = false;
        tw.topBusy = false;
        tw.beaconLight = null;
        tw.beaconMesh = null;
        tw.windTesting = false;
        tw.windPhase = 0;
        tw.windAmplitude = 0;
        tw.windPassed = false;

        const baseY = MO.getTerrainHeight(0, TOWER_Z);
        const pivot = new THREE.Group();
        pivot.position.set(0, baseY, TOWER_Z);
        tg.add(pivot);
        tw.towerPivot = pivot;

        const fOff = [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]];
        fOff.forEach(([fx, fz], idx) => {
            const g = new THREE.Group();
            g.position.set(fx, 0, fz);

            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.26, 0.42, 4),
                new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.rotation.z = Math.PI / 4;
            ring.position.y = 0.05;
            g.add(ring);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.y = 0.5;
            const ftObj = {
                id: idx, x: fx, z: TOWER_Z + fz, localX: fx, localZ: fz,
                dug: false, hasRebar: false, concreted: false, res: false,
                group: g, ring, hitbox: hit
            };
            hit.userData = { towerItem: ftObj, kind: 'footing' };
            g.add(hit);
            pivot.add(g);
            tw.footings.push(ftObj);
        });

        const tierH = 1.35;
        const radii = [1.15, 0.94, 0.74, 0.56, 0.40];
        const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.35 });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45, metalness: 0.25 });

        for (let t = 0; t < 4; t++) {
            const y0 = 0.2 + t * tierH;
            const r0 = radii[t];
            const r1 = radii[t + 1];

            const tierGrp = new THREE.Group();
            pivot.add(tierGrp);

            const scafGrp = new THREE.Group();
            const sr = r0 + 0.32;
            [[-sr, -sr], [sr, -sr], [-sr, sr], [sr, sr]].forEach(([sx, sz]) => {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, tierH, 6), MO.mats.wood);
                post.position.set(sx, y0 + tierH / 2, sz);
                scafGrp.add(post);
            });
            const plank1 = new THREE.Mesh(new THREE.BoxGeometry(sr * 2.1, 0.05, 0.28), MO.mats.formwork);
            plank1.position.set(0, y0 + tierH * 0.75, sr);
            const plank2 = plank1.clone(); plank2.position.z = -sr;
            scafGrp.add(plank1, plank2);
            scafGrp.visible = false;
            tierGrp.add(scafGrp);

            const steelGrp = new THREE.Group();

            if (MO.state.variant === 'lighthouse') {
                // Farol Costeiro cilíndrico listrado vermelho e branco
                const drum = new THREE.Mesh(
                    new THREE.CylinderGeometry(r1 * 1.15, r0 * 1.15, tierH, 16),
                    t % 2 === 0 ? whiteMat : redMat
                );
                drum.position.y = y0 + tierH / 2;
                drum.castShadow = true; drum.receiveShadow = true;
                steelGrp.add(drum);
            } else {
                // Treliça metálica ou Telecom bicolor
                const strutMat = MO.state.variant === 'telecom' ? (t % 2 === 0 ? redMat : whiteMat) : MO.mats.steel;
                const corners0 = [[-r0, -r0], [r0, -r0], [r0, r0], [-r0, r0]];
                const corners1 = [[-r1, -r1], [r1, -r1], [r1, r1], [-r1, r1]];
                for (let c = 0; c < 4; c++) {
                    const pA = new THREE.Vector3(corners0[c][0], y0, corners0[c][1]);
                    const pB = new THREE.Vector3(corners1[c][0], y0 + tierH, corners1[c][1]);
                    steelGrp.add(createStrutMesh(pA, pB, 0.042, strutMat));

                    const next = (c + 1) % 4;
                    const pA2 = new THREE.Vector3(corners0[next][0], y0, corners0[next][1]);
                    const pB2 = new THREE.Vector3(corners1[next][0], y0 + tierH, corners1[next][1]);
                    steelGrp.add(createStrutMesh(pB, pB2, 0.03, strutMat));
                    steelGrp.add(createStrutMesh(pA, pB2, 0.022, strutMat));
                    steelGrp.add(createStrutMesh(pA2, pB, 0.022, strutMat));
                }
            }

            steelGrp.visible = false;
            tierGrp.add(steelGrp);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(r0 * 2.4, tierH, r0 * 2.4), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.set(0, y0 + tierH / 2, 0);
            const tierObj = {
                id: t, y0, tierH, hasScaffold: false, hasSteel: false, res: false,
                group: tierGrp, scafGrp, steelGrp, hitbox: hit
            };
            hit.userData = { towerItem: tierObj, kind: 'tier' };
            tierGrp.add(hit);
            tw.tiers.push(tierObj);
        }

        const topY = 0.2 + 4 * tierH;
        const topGrp = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 1.35), MO.mats.concreteDark);
        deck.position.y = topY + 0.07; deck.castShadow = true;

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 1.55, 8), MO.mats.steel);
        mast.position.y = topY + 0.90;

        const beaconColor = MO.state.variant === 'lighthouse' ? 0xfef08a : 0xef4444;
        const beaconMat = new THREE.MeshStandardMaterial({ color: beaconColor, emissive: beaconColor, emissiveIntensity: 1.5 });
        const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), beaconMat);
        beaconMesh.position.y = topY + 1.72;
        const beaconLight = new THREE.PointLight(beaconColor, 1.4, 8.5);
        beaconLight.position.y = topY + 1.72;

        topGrp.add(deck, mast, beaconMesh, beaconLight);
        topGrp.visible = false;
        pivot.add(topGrp);
        tw.topDeck = topGrp;
        tw.beaconLight = beaconLight;
        tw.beaconMesh = beaconMesh;
    }

    function createStrutMesh(p1, p2, radius, mat) {
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        const geo = new THREE.CylinderGeometry(radius, radius, len, 6);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(p1).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        mesh.castShadow = true;
        return mesh;
    }

    function digTowerFooting(ft) {
        if (ft.dug) return;
        ft.dug = true; ft.res = false;
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), MO.mats.hole);
        hole.position.y = 0.04;
        ft.group.add(hole);
        ft.ring.material.color.setHex(0x38bdf8);
        MO.spawnBurst(ft.x, MO.getTerrainHeight(ft.x, ft.z) + 0.1, ft.z, 0x5c4632, 8);
        MO.SoundFX.playDirtShovel();
    }

    function rebarTowerFooting(ft) {
        if (!ft.dug || ft.hasRebar) return;
        ft.hasRebar = true; ft.res = false;
        const cage = MO.createRebarCageMesh(0.75);
        cage.position.y = 0.02;
        ft.group.add(cage);
        MO.SoundFX.playMetalClang();
    }

    function concreteTowerFooting(ft) {
        if (!ft.hasRebar || ft.concreted) return;
        ft.concreted = true; ft.res = false;
        ft.ring.visible = false;
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.62), MO.mats.concrete);
        block.position.y = 0.16;
        block.castShadow = true; block.receiveShadow = true;
        ft.group.add(block);
        MO.spawnBurst(ft.x, MO.getTerrainHeight(ft.x, ft.z) + 0.25, ft.z, 0x94a3b8, 10);
        MO.SoundFX.playMortarSquish();
    }

    function installTierScaffold(tier) {
        if (tier.hasScaffold) return;
        tier.hasScaffold = true; tier.res = false;
        tier.scafGrp.visible = true;
        MO.SoundFX.playHammerWood();
    }

    function installTierSteel(tier) {
        if (!tier.hasScaffold || tier.hasSteel) return;
        tier.hasSteel = true; tier.res = false;
        tier.steelGrp.visible = true;
        tier.scafGrp.visible = false;
        if (MO.spawnWeldSparks) MO.spawnWeldSparks(0, tier.y0 + tier.tierH, TOWER_Z);
        else MO.SoundFX.playMetalClang();
    }

    function installTowerTop() {
        const tw = MO.state.tower;
        if (tw.topInstalled) return;
        tw.topInstalled = true;
        if (tw.topDeck) tw.topDeck.visible = true;
        MO.SoundFX.playElectricSwitch();
        MO.showToast('🗼 Plataforma do Mirante e Farol instalados! Execute o Teste de Vento!', '🗼');
    }

    MO.advanceTowerPhase2 = function() {
        const tw = MO.state.tower;
        if (!tw.footings.every(f => f.concreted) && !MO.state.screensaver) {
            MO.showToast('Conclua todas as 4 sapatas de ancoragem antes de subir a torre!', '⚠️');
            return;
        }
        MO.state.phase = 2;
        MO.syncPhaseUI();
        MO.selectTool('tw-scaf');
        if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck();
        MO.showToast('Fase 2: Monte os andaimes de madeira e erga os 4 módulos!', '🗼');
    };

    MO.advanceTowerPhase3 = function() {
        const tw = MO.state.tower;
        if (!tw.tiers.every(t => t.hasSteel) && !MO.state.screensaver) {
            MO.showToast('Conclua todos os 4 módulos antes da antena e teste de vento!', '⚠️');
            return;
        }
        MO.state.phase = 3;
        MO.syncPhaseUI();
        MO.selectTool('tw-top');
        MO.showToast('Fase 3: Instale o Mirante + Farol no topo e execute o Teste de Vento!', '💨');
    };

    MO.runTowerWindTest = function() {
        const tw = MO.state.tower;
        if (!tw.tiers.every(t => t.hasSteel)) {
            MO.showToast('⚠️ Conclua os módulos antes de testar a rajada de vento!', '⚠️');
            return;
        }
        tw.windTesting = true;
        tw.windPhase = 0;
        tw.windAmplitude = 0.055;
        MO.setWeather('wind');
        MO.SoundFX.playWindGust();
        MO.showToast('💨 Aplicando rajada de vento lateral para validar centro de gravidade...', '💨');
    };

    MO.modes.tower = {
        id: 'tower',
        label: 'Torre Treliçada',

        onInit() {
            MO.state.phase = 0;
            buildTowerSkeleton();
            MO.selectTool('clear-weeds');
        },

        onStartPhase1() {
            MO.state.phase = 1;
            MO.syncPhaseUI();
            MO.selectTool('tw-dig');
            const vNames = { lattice: 'Torre Treliçada', telecom: 'Torre Telecom', lighthouse: 'Farol Costeiro' };
            MO.showToast(`Fase 1 (${vNames[MO.state.variant]}): Cave, arme e concrete as 4 sapatas!`, '⛏️');
        },

        updateSimulation(dt) {
            const state = MO.state;
            const tw = state.tower;
            if (!tw.windTesting || !tw.towerPivot) return;

            const footingsOk = tw.footings.every(f => f.concreted);
            const shouldFail = !footingsOk || (state.riskProfile === 'realistic' && state.structural.integrity < 72 && !state.structural.repairedOnce);

            tw.windPhase += dt * 9.5;
            if (shouldFail && tw.windPhase > 3.5 && !state.structural.collapsed) {
                tw.windTesting = false;
                tw.towerPivot.rotation.z = 0.48;
                MO.triggerStructuralCollapse(!footingsOk ? 'SAPATAS SEM CONCRETO CEDERAM AO VENTO' : 'ANEL DE ANCORAGEM ROMPEU NA RAJADA', { x: 0, y: 2.8, z: TOWER_Z });
                return;
            }

            tw.windAmplitude *= Math.pow(0.55, dt);
            tw.towerPivot.rotation.z = Math.sin(tw.windPhase) * tw.windAmplitude;

            if (Math.random() < 0.45) {
                MO.spawnBurst(-2.4, 2.5 + Math.random() * 2.5, TOWER_Z + (Math.random() - 0.5) * 1.5, 0xbae6fd, 2, 0.14);
            }

            if (tw.windAmplitude < 0.0025) {
                tw.windTesting = false;
                tw.towerPivot.rotation.z = 0;
                tw.windPassed = true;
                MO.setWeather('clear');
                MO.approveStructure('✅ TESTE DE VENTO APROVADO · TORRE ESTÁVEL');
                MO.showToast('✅ Teste de Vento APROVADO! Torre homologada!', '🏆');
            }
        },

        handlePointerDown(raycaster) {
            const state = MO.state;
            if (state.phase < 1) return false;
            const hits = raycaster.intersectObjects(MO.groups.tower.children, true);
            for (let h of hits) {
                const item = h.object.userData.towerItem;
                const kind = h.object.userData.kind;
                if (!item) continue;

                if (state.phase === 1 && kind === 'footing') {
                    if (state.tool === 'tw-dig' && !item.dug) { digTowerFooting(item); return true; }
                    if (state.tool === 'tw-rebar' && item.dug && !item.hasRebar) { rebarTowerFooting(item); return true; }
                    if (state.tool === 'tw-pour' && item.hasRebar && !item.concreted) { concreteTowerFooting(item); return true; }
                } else if (state.phase === 2 && kind === 'tier') {
                    if (state.tool === 'tw-scaf' && !item.hasScaffold) { installTierScaffold(item); return true; }
                    if (state.tool === 'tw-steel' && item.hasScaffold && !item.hasSteel) { installTierSteel(item); return true; }
                } else if (state.phase === 3 && state.tool === 'tw-top') {
                    installTowerTop();
                    return true;
                }
            }
            return false;
        },

        assignWorkerTask(w, setWorkerTool) {
            const state = MO.state;
            const tw = state.tower;

            if (state.phase === 1) {
                const f1 = tw.footings.find(f => !f.dug && !f.res);
                if (f1) { f1.res = true; w.task = { type: 'tw-dig', item: f1, duration: 0.52 }; w.tx = f1.x; w.tz = f1.z; setWorkerTool(w.rig, 'hoe'); return true; }
                const f2 = tw.footings.find(f => f.dug && !f.hasRebar && !f.res);
                if (f2) { f2.res = true; w.task = { type: 'tw-rebar', item: f2, duration: 0.48 }; w.tx = f2.x; w.tz = f2.z; setWorkerTool(w.rig, 'hammer'); return true; }
                const f3 = tw.footings.find(f => f.hasRebar && !f.concreted && !f.res);
                if (f3) { f3.res = true; w.task = { type: 'tw-pour', item: f3, duration: 0.55 }; w.tx = f3.x; w.tz = f3.z; setWorkerTool(w.rig, 'trowel'); return true; }
            }
            if (state.phase === 2) {
                const t1 = tw.tiers.find(t => !t.hasScaffold && !t.res && (t.id === 0 || tw.tiers[t.id - 1].hasSteel));
                if (t1) { t1.res = true; w.task = { type: 'tw-scaf', item: t1, duration: 0.58 }; w.tx = 1.4; w.tz = TOWER_Z + 1.2; setWorkerTool(w.rig, 'plank'); return true; }
                const t2 = tw.tiers.find(t => t.hasScaffold && !t.hasSteel && !t.res);
                if (t2) { t2.res = true; w.task = { type: 'tw-steel', item: t2, duration: 0.62 }; w.tx = -1.4; w.tz = TOWER_Z + 1.2; setWorkerTool(w.rig, 'hammer'); return true; }
            }
            if (state.phase === 3 && !tw.topInstalled && !tw.topBusy) {
                tw.topBusy = true;
                w.task = { type: 'tw-top', duration: 0.68 }; w.tx = 0; w.tz = TOWER_Z + 1.4; setWorkerTool(w.rig, 'hammer'); return true;
            }
            return false;
        },

        completeWorkerTask(tk) {
            if (tk.type === 'tw-dig') digTowerFooting(tk.item);
            else if (tk.type === 'tw-rebar') rebarTowerFooting(tk.item);
            else if (tk.type === 'tw-pour') concreteTowerFooting(tk.item);
            else if (tk.type === 'tw-scaf') installTierScaffold(tk.item);
            else if (tk.type === 'tw-steel') installTierSteel(tk.item);
            else if (tk.type === 'tw-top') { installTowerTop(); MO.state.tower.topBusy = false; }
        },

        updateAutopilot(dt) {
            const state = MO.state;
            const tw = state.tower;

            if (state.structural.collapsed) {
                state.structural.collapseTimer += dt;
                if (state.structural.collapseTimer > 3.2) {
                    MO.resetStructuralState();
                    state.structural.repairedOnce = true;
                    state.structural.integrity = 100;
                    if (tw.towerPivot) tw.towerPivot.rotation.z = 0;
                    tw.windPassed = false;
                    MO.showToast('🔧 Equipe reforçou a base da torre e reiniciou o Teste de Vento!', '🔧');
                    MO.runTowerWindTest();
                }
                return false;
            }

            if (state.phase === 0) {
                if (state.weeds.every(w => w.cleared) && MO.computeLotLevelProgress() >= 90) {
                    MO.modes.tower.onStartPhase1();
                }
            } else if (state.phase === 1) {
                if (tw.footings.every(f => f.concreted)) MO.advanceTowerPhase2();
            } else if (state.phase === 2) {
                if (tw.tiers.every(t => t.hasSteel)) MO.advanceTowerPhase3();
            } else if (state.phase === 3) {
                if (tw.topInstalled) {
                    if (!tw.windTesting && !tw.windPassed) MO.runTowerWindTest();
                    if (tw.windPassed) return true;
                }
            }
            return false;
        }
    };

    MO.advanceTowerPhase2 = MO.advanceTowerPhase2;
    MO.advanceTowerPhase3 = MO.advanceTowerPhase3;
    MO.runTowerWindTest = MO.runTowerWindTest;
    MO.installTowerTop = installTowerTop;
})(window.MO = window.MO || {});

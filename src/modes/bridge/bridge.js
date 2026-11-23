// =========================================================================
// MODO 2: PONTE SOBRE O RIO (VARIANTES ESTAIADA/ARCO/VIGA & COLAPSO DE CARGA)
// =========================================================================
(function(MO) {
    const BRIDGE_Y = 1.05;
    const SPAN_X = [-4.2, -1.8, 1.8, 4.2];

    function buildBridgeSceneMarkers() {
        const bg = MO.groups.bridge;
        const br = MO.state.bridge;
        while (bg.children.length > 0) bg.remove(bg.children[0]);

        const variants = ['girder', 'cable-stayed', 'arch'];
        MO.state.variant = variants[MO.state.seed % variants.length];

        br.abutments = [];
        br.piers = [];
        br.girders = [];
        br.decks = [];
        br.rails = [];
        br.lamps = [];
        br.truck = null;
        br.truckTesting = false;
        br.truckProgress = 0;
        br.loadPassed = false;

        [-4.2, 4.2].forEach((ax, idx) => {
            const ty = MO.getTerrainHeight(ax, 0);
            const g = new THREE.Group();
            g.position.set(ax, ty, 0);

            const guide = new THREE.Mesh(
                new THREE.BoxGeometry(0.95, 0.12, 2.2),
                new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35 })
            );
            guide.position.y = 0.08;
            g.add(guide);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 2.3), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.y = 0.6;
            const ab = { id: idx, x: ax, z: 0, built: false, res: false, group: g, guide, hitbox: hit };
            hit.userData = { bridgeItem: ab, kind: 'abutment' };
            g.add(hit);
            bg.add(g);
            br.abutments.push(ab);
        });

        [-1.8, 1.8].forEach((px, idx) => {
            const bedY = MO.getTerrainHeight(px, 0);
            const g = new THREE.Group();
            g.position.set(px, 0, 0);

            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.45, 0.62, 16),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = MO.WATER_LEVEL + 0.04;
            g.add(ring);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 2.2), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.y = 0.4;
            const pier = {
                id: idx, x: px, z: 0, bedY,
                piled: false, hasCofferdam: false, concreted: false, res: false,
                group: g, ring, hitbox: hit, cofferMesh: null, concreteMesh: null
            };
            hit.userData = { bridgeItem: pier, kind: 'pier' };
            g.add(hit);
            bg.add(g);
            br.piers.push(pier);
        });

        for (let s = 0; s < 3; s++) {
            const x1 = SPAN_X[s];
            const x2 = SPAN_X[s + 1];
            const cx = (x1 + x2) / 2;
            const len = x2 - x1;

            const spanGrp = new THREE.Group();
            bg.add(spanGrp);

            const guide = new THREE.Mesh(
                new THREE.BoxGeometry(len - 0.15, 0.10, 1.9),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, depthWrite: false })
            );
            guide.position.set(cx, BRIDGE_Y, 0);
            guide.visible = false;
            spanGrp.add(guide);

            const hit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 2.1), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.set(cx, BRIDGE_Y + 0.1, 0);

            const spanObj = {
                id: s, x1, x2, cx, len,
                hasGirder: false, hasDeck: false, hasRails: false, res: false,
                spanGrp, guide, hitbox: hit, girderGroup: null, deckMesh: null, railsGroup: null
            };
            hit.userData = { bridgeItem: spanObj, kind: 'span' };
            spanGrp.add(hit);
            br.girders.push(spanObj);
        }

        br.truck = createBridgeTruckMesh();
        br.truck.visible = false;
        bg.add(br.truck);
    }

    function createBridgeTruckMesh() {
        const truck = new THREE.Group();
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.18, 0.56), MO.mats.steel);
        chassis.position.y = 0.22; chassis.castShadow = true;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.54), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.45 }));
        cab.position.set(0.36, 0.48, 0); cab.castShadow = true;
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.20, 0.46), MO.mats.glass);
        windshield.position.set(0.56, 0.54, 0);
        const bed = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.56), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 }));
        bed.position.set(-0.22, 0.46, 0); bed.castShadow = true;

        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
        [[-0.35, -0.28], [-0.35, 0.28], [0.35, -0.28], [0.35, 0.28]].forEach(([wx, wz]) => {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.10, 12), wheelMat);
            w.rotation.x = Math.PI / 2; w.position.set(wx, 0.14, wz);
            truck.add(w);
        });

        const headMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfbbf24, emissiveIntensity: 1.4 });
        [-0.18, 0.18].forEach(hz => {
            const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.08), headMat);
            hl.position.set(0.58, 0.30, hz);
            truck.add(hl);
        });

        truck.add(chassis, cab, windshield, bed);
        return truck;
    }

    function createCableMesh(p1, p2, r, mat) {
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 6), mat);
        m.position.copy(p1).addScaledVector(dir, 0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        return m;
    }

    function buildAbutment(ab) {
        if (ab.built) return;
        ab.built = true; ab.res = false;
        ab.guide.visible = false;
        const ty = MO.getTerrainHeight(ab.x, 0);
        const h = Math.max(0.65, BRIDGE_Y - ty + 0.15);
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.95, h, 2.2), MO.mats.concrete);
        block.position.y = h / 2 - 0.15;
        block.castShadow = true; block.receiveShadow = true;
        ab.group.add(block);

        const dir = ab.x < 0 ? -1 : 1;
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 2.0), MO.mats.concreteDark);
        ramp.position.set(dir * 1.1, BRIDGE_Y - ty - 0.12, 0);
        ramp.rotation.z = dir * -0.18;
        ramp.receiveShadow = true;
        ab.group.add(ramp);

        MO.spawnBurst(ab.x, BRIDGE_Y, 0, 0x94a3b8, 10);
        MO.SoundFX.playMortarSquish();
    }

    function drivePierPiles(pier) {
        if (pier.piled) return;
        pier.piled = true; pier.res = false;
        const h = BRIDGE_Y - pier.bedY + 0.2;
        [-0.65, 0.65].forEach(pz => {
            const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, h, 10), MO.mats.steel);
            pile.position.set(0, pier.bedY + h / 2 - 0.2, pz);
            pile.castShadow = true;
            pier.group.add(pile);
        });
        pier.ring.material.color.setHex(0xf59e0b);
        MO.spawnBurst(pier.x, MO.WATER_LEVEL + 0.08, 0, 0xbae6fd, 12, 0.09);
        MO.SoundFX.playMetalClang();
    }

    function buildPierCofferdam(pier) {
        if (!pier.piled || pier.hasCofferdam) return;
        pier.hasCofferdam = true; pier.res = false;
        const h = BRIDGE_Y - MO.WATER_LEVEL + 0.1;
        const cf = new THREE.Group();
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, h, 0.05), MO.mats.formwork); b1.position.set(0, MO.WATER_LEVEL + h / 2, 0.98);
        const b2 = b1.clone(); b2.position.z = -0.98;
        const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 1.96), MO.mats.formwork); b3.position.set(0.36, MO.WATER_LEVEL + h / 2, 0);
        const b4 = b3.clone(); b4.position.x = -0.36;
        [b1, b2, b3, b4].forEach(m => { m.castShadow = true; cf.add(m); });
        pier.cofferMesh = cf;
        pier.group.add(cf);
        MO.SoundFX.playHammerWood();
    }

    function concreteBridgePier(pier) {
        if (!pier.hasCofferdam || pier.concreted) return;
        pier.concreted = true; pier.res = false;
        if (pier.cofferMesh) pier.cofferMesh.visible = false;
        pier.ring.visible = false;

        const h = BRIDGE_Y - pier.bedY;
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.62, h, 1.85), MO.mats.concrete);
        col.position.set(0, pier.bedY + h / 2 - 0.1, 0);
        col.castShadow = true; col.receiveShadow = true;

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 2.15), MO.mats.concreteDark);
        cap.position.set(0, BRIDGE_Y - 0.12, 0);
        cap.castShadow = true;
        pier.group.add(col, cap);

        // Se variante for Ponte Estaiada, ergue os pilones brancos sobre os pilares
        if (MO.state.variant === 'cable-stayed') {
            const pMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55 });
            [-0.95, 0.95].forEach(pz => {
                const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.45, 0.24), pMat);
                pylon.position.set(0, BRIDGE_Y + 1.22, pz);
                pylon.castShadow = true;
                pier.group.add(pylon);
            });
            const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 2.1), pMat);
            cross.position.set(0, BRIDGE_Y + 2.2, 0);
            pier.group.add(cross);
        }

        MO.spawnBurst(pier.x, BRIDGE_Y, 0, 0x94a3b8, 12);
        MO.SoundFX.playMortarSquish();
    }

    function installBridgeGirder(span) {
        if (span.hasGirder) return;
        span.hasGirder = true; span.res = false;
        const g = new THREE.Group();
        [-0.68, 0, 0.68].forEach(gz => {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(span.len, 0.24, 0.16), MO.mats.steel);
            beam.position.set(span.cx, BRIDGE_Y - 0.08, gz);
            beam.castShadow = true;
            g.add(beam);
        });

        // Variante em Arco no vão central
        if (MO.state.variant === 'arch' && span.id === 1) {
            const archMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.55, roughness: 0.4 });
            [-0.96, 0.96].forEach(az => {
                const segs = 7;
                for (let i = 0; i < segs; i++) {
                    const t0 = i / segs, t1 = (i + 1) / segs;
                    const xA = span.x1 + t0 * span.len, xB = span.x1 + t1 * span.len;
                    const yA = BRIDGE_Y + Math.sin(t0 * Math.PI) * 1.45;
                    const yB = BRIDGE_Y + Math.sin(t1 * Math.PI) * 1.45;
                    g.add(createCableMesh(new THREE.Vector3(xA, yA, az), new THREE.Vector3(xB, yB, az), 0.055, archMat));
                    if (i > 0) {
                        g.add(createCableMesh(new THREE.Vector3(xA, BRIDGE_Y + 0.1, az), new THREE.Vector3(xA, yA, az), 0.02, MO.mats.steel));
                    }
                }
            });
        }

        span.girderGroup = g;
        span.spanGrp.add(g);
        if (MO.spawnWeldSparks) MO.spawnWeldSparks(span.cx, BRIDGE_Y, 0);
        else MO.SoundFX.playMetalClang();
    }

    function installBridgeDeck(span) {
        if (!span.hasGirder || span.hasDeck) return;
        span.hasDeck = true; span.res = false;
        span.guide.visible = false;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(span.len + 0.04, 0.14, 2.15), MO.mats.concreteDark);
        deck.position.set(span.cx, BRIDGE_Y + 0.10, 0);
        deck.castShadow = true; deck.receiveShadow = true;
        span.deckMesh = deck;
        span.spanGrp.add(deck);

        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(span.len * 0.75, 0.015, 0.08),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 })
        );
        stripe.position.set(span.cx, BRIDGE_Y + 0.175, 0);
        span.spanGrp.add(stripe);

        // Estais (cabos de aço diagonais) na variante Estaiada
        if (MO.state.variant === 'cable-stayed') {
            const cableMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.3 });
            const anchorX = span.id === 0 ? -1.8 : (span.id === 2 ? 1.8 : (span.cx < 0 ? -1.8 : 1.8));
            [-0.95, 0.95].forEach(cz => {
                [0.25, 0.55, 0.85].forEach(frac => {
                    const dx = span.id === 1
                        ? (frac < 0.5 ? -1.8 : 1.8)
                        : anchorX;
                    const px = span.x1 + frac * span.len;
                    span.spanGrp.add(createCableMesh(
                        new THREE.Vector3(dx, BRIDGE_Y + 2.25, cz),
                        new THREE.Vector3(px, BRIDGE_Y + 0.16, cz),
                        0.016,
                        cableMat
                    ));
                });
            });
        }

        MO.spawnBurst(span.cx, BRIDGE_Y + 0.15, 0, 0x94a3b8, 10);
        MO.SoundFX.playMortarSquish();
    }

    function installBridgeRails(span) {
        if (!span.hasDeck || span.hasRails) return;
        span.hasRails = true; span.res = false;
        const g = new THREE.Group();
        [-0.98, 0.98].forEach(rz => {
            const railTop = new THREE.Mesh(new THREE.BoxGeometry(span.len, 0.06, 0.06), MO.mats.steel);
            railTop.position.set(span.cx, BRIDGE_Y + 0.54, rz);
            const railMid = railTop.clone(); railMid.position.y = BRIDGE_Y + 0.34;
            g.add(railTop, railMid);

            for (let p = -1; p <= 1; p++) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), MO.mats.steel);
                post.position.set(span.cx + p * (span.len * 0.35), BRIDGE_Y + 0.36, rz);
                g.add(post);
            }
        });

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 8), MO.mats.steel);
        pole.position.set(span.cx, BRIDGE_Y + 0.82, -1.0);
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfbbf24, emissiveIntensity: MO.state.isNight ? 1.8 : 0.2 })
        );
        bulb.position.set(span.cx, BRIDGE_Y + 1.50, -0.9);
        const pLight = new THREE.PointLight(0xffd28a, MO.state.isNight ? 1.8 : 0, 5.5);
        pLight.position.set(span.cx, BRIDGE_Y + 1.4, -0.7);
        g.add(pole, bulb, pLight);
        MO.state.bridge.lamps.push({ bulb, light: pLight });

        span.railsGroup = g;
        span.spanGrp.add(g);
        MO.SoundFX.playHammerWood();
    }

    MO.advanceBridgePhase2 = function() {
        const br = MO.state.bridge;
        const ready = br.abutments.every(a => a.built) && br.piers.every(p => p.concreted);
        if (!ready && !MO.state.screensaver) {
            MO.showToast('Conclua as 2 cabeceiras e os 2 pilares submersos antes das vigas!', '⚠️');
            return;
        }
        MO.state.phase = 2;
        br.girders.forEach(s => { s.guide.visible = true; });
        MO.syncPhaseUI();
        MO.selectTool('bridge-girder');
        if (MO.triggerDeliveryTruck) MO.triggerDeliveryTruck();
        MO.showToast('Fase 2: Lance as vigas longarinas sobre o rio e concrete o tabuleiro!', '🌉');
    };

    MO.advanceBridgePhase3 = function() {
        const br = MO.state.bridge;
        if (!br.girders.every(s => s.hasDeck) && !MO.state.screensaver) {
            MO.showToast('Conclua o tabuleiro em todos os 3 vãos primeiro!', '⚠️');
            return;
        }
        MO.state.phase = 3;
        MO.syncPhaseUI();
        MO.selectTool('bridge-rail');
        MO.showToast('Fase 3: Instale guarda-corpos, postes e faça o Teste de Carga!', '🚚');
    };

    MO.runBridgeLoadTest = function() {
        const br = MO.state.bridge;
        if (!br.girders.every(s => s.hasDeck)) {
            MO.showToast('⚠️ A ponte ainda não tem tabuleiro completo para o caminhão cruzar!', '⚠️');
            return;
        }
        if (br.truckTesting) return;
        br.truckTesting = true;
        br.truckProgress = 0;
        br.truck.visible = true;
        br.truck.rotation.z = 0;
        br.truck.position.set(-5.2, BRIDGE_Y + 0.17, 0);
        MO.SoundFX.playTruckHorn();
        MO.showToast('🚚 Teste de Carga em andamento — caminhão pesado atravessando!', '🚚');
    };

    MO.updateBridgeSimulation = function(dt) {
        const state = MO.state;
        const br = state.bridge;
        if (!br.truckTesting || !br.truck) return;

        br.truckProgress += dt * 0.24;
        const x = -5.2 + br.truckProgress * 10.4;
        const wobble = Math.sin(br.truckProgress * 45) * 0.008;

        // Verifica se a ponte deve ceder no centro (pilares incompletos OU falha estrutural realista)
        const piersOk = br.piers.every(p => p.concreted);
        const shouldFail = !piersOk || (state.riskProfile === 'realistic' && state.structural.integrity < 72 && !state.structural.repairedOnce);

        if (shouldFail && br.truckProgress >= 0.45 && !state.structural.collapsed) {
            br.truckTesting = false;
            const centerSpan = br.girders[1];
            if (centerSpan && centerSpan.spanGrp) {
                centerSpan.spanGrp.position.y = -0.78;
                centerSpan.spanGrp.rotation.z = -0.14;
            }
            br.truck.position.set(0, MO.WATER_LEVEL + 0.22, 0);
            br.truck.rotation.z = -0.35;
            MO.spawnBurst(0, MO.WATER_LEVEL + 0.15, 0, 0xbae6fd, 22, 0.16);
            if (MO.spawnWaterRipple) MO.spawnWaterRipple(0, 0, 2.2, true);
            MO.triggerStructuralCollapse(!piersOk ? 'PILARES SUBMERSOS INCOMPLETOS' : 'LOTE DE CONCRETO CEDEU NO VÃO CENTRAL', { x: 0, y: BRIDGE_Y, z: 0 });
            return;
        }

        br.truck.position.set(x, BRIDGE_Y + 0.17 + wobble, 0);
        if (br.truckProgress >= 1) {
            br.truckTesting = false;
            br.loadPassed = true;
            MO.approveStructure('✅ TESTE DE CARGA APROVADO · PONTE LIBERADA');
            MO.showToast('✅ Teste de Carga APROVADO! Ponte liberada ao tráfego!', '🏆');
        }
    };

    MO.modes.bridge = {
        id: 'bridge',
        label: 'Ponte sobre o Rio',

        onInit() {
            MO.state.phase = 0;
            buildBridgeSceneMarkers();
            MO.selectTool('clear-weeds');
        },

        onStartPhase1() {
            MO.state.phase = 1;
            MO.syncPhaseUI();
            MO.selectTool('bridge-pile');
            const vNames = { girder: 'Viga Reta', 'cable-stayed': 'Ponte Estaiada', arch: 'Ponte em Arco' };
            MO.showToast(`Fase 1 (${vNames[MO.state.variant]}): Crave estacas submersas e erga as cabeceiras!`, '🌊');
        },

        updateSimulation(dt) {
            MO.updateBridgeSimulation(dt);
        },

        handlePointerDown(raycaster) {
            const state = MO.state;
            if (state.phase < 1) return false;
            const hits = raycaster.intersectObjects(MO.groups.bridge.children, true);
            for (let h of hits) {
                const item = h.object.userData.bridgeItem;
                const kind = h.object.userData.kind;
                if (!item) continue;

                if (state.phase === 1) {
                    if (kind === 'abutment' && !item.built) { buildAbutment(item); return true; }
                    if (kind === 'pier') {
                        if (state.tool === 'bridge-pile' && !item.piled) { drivePierPiles(item); return true; }
                        if (state.tool === 'bridge-coffer' && item.piled && !item.hasCofferdam) { buildPierCofferdam(item); return true; }
                        if (state.tool === 'bridge-pour' && item.hasCofferdam && !item.concreted) { concreteBridgePier(item); return true; }
                    }
                } else if (state.phase === 2 && kind === 'span') {
                    if (state.tool === 'bridge-girder' && !item.hasGirder) { installBridgeGirder(item); return true; }
                    if (state.tool === 'bridge-deck' && item.hasGirder && !item.hasDeck) { installBridgeDeck(item); return true; }
                } else if (state.phase === 3 && kind === 'span') {
                    if (state.tool === 'bridge-rail' && !item.hasRails) { installBridgeRails(item); return true; }
                }
            }
            return false;
        },

        assignWorkerTask(w, setWorkerTool) {
            const state = MO.state;
            const br = state.bridge;

            if (state.phase === 1) {
                const ab = br.abutments.find(a => !a.built && !a.res);
                if (ab) { ab.res = true; w.task = { type: 'br-abut', item: ab, duration: 0.6 }; w.tx = ab.x; w.tz = 0.8; setWorkerTool(w.rig, 'trowel'); return true; }
                const p1 = br.piers.find(p => !p.piled && !p.res);
                if (p1) { p1.res = true; w.task = { type: 'br-pile', item: p1, duration: 0.65 }; w.tx = p1.x < 0 ? -3.1 : 3.1; w.tz = 0; setWorkerTool(w.rig, 'hammer'); return true; }
                const p2 = br.piers.find(p => p.piled && !p.hasCofferdam && !p.res);
                if (p2) { p2.res = true; w.task = { type: 'br-coffer', item: p2, duration: 0.6 }; w.tx = p2.x < 0 ? -3.1 : 3.1; w.tz = 0.7; setWorkerTool(w.rig, 'plank'); return true; }
                const p3 = br.piers.find(p => p.hasCofferdam && !p.concreted && !p.res);
                if (p3) { p3.res = true; w.task = { type: 'br-pour', item: p3, duration: 0.6 }; w.tx = p3.x < 0 ? -3.1 : 3.1; w.tz = -0.7; setWorkerTool(w.rig, 'trowel'); return true; }
            }
            if (state.phase === 2) {
                const g1 = br.girders.find(s => !s.hasGirder && !s.res);
                if (g1) { g1.res = true; w.task = { type: 'br-girder', item: g1, duration: 0.7 }; w.tx = g1.x1; w.tz = 0.9; setWorkerTool(w.rig, 'hammer'); return true; }
                const d1 = br.girders.find(s => s.hasGirder && !s.hasDeck && !s.res);
                if (d1) { d1.res = true; w.task = { type: 'br-deck', item: d1, duration: 0.65 }; w.tx = d1.cx < 0 ? -3.3 : 3.3; w.tz = 0; setWorkerTool(w.rig, 'trowel'); return true; }
            }
            if (state.phase === 3) {
                const r1 = br.girders.find(s => s.hasDeck && !s.hasRails && !s.res);
                if (r1) { r1.res = true; w.task = { type: 'br-rail', item: r1, duration: 0.55 }; w.tx = r1.cx < 0 ? -3.4 : 3.4; w.tz = 0.8; setWorkerTool(w.rig, 'hammer'); return true; }
            }
            return false;
        },

        completeWorkerTask(tk) {
            if (tk.type === 'br-abut') buildAbutment(tk.item);
            else if (tk.type === 'br-pile') drivePierPiles(tk.item);
            else if (tk.type === 'br-coffer') buildPierCofferdam(tk.item);
            else if (tk.type === 'br-pour') concreteBridgePier(tk.item);
            else if (tk.type === 'br-girder') installBridgeGirder(tk.item);
            else if (tk.type === 'br-deck') installBridgeDeck(tk.item);
            else if (tk.type === 'br-rail') installBridgeRails(tk.item);
        },

        updateAutopilot(dt) {
            const state = MO.state;
            const br = state.bridge;

            if (state.structural.collapsed) {
                state.structural.collapseTimer += dt;
                if (state.structural.collapseTimer > 3.2) {
                    MO.resetStructuralState();
                    state.structural.repairedOnce = true;
                    state.structural.integrity = 100;
                    const centerSpan = br.girders[1];
                    if (centerSpan && centerSpan.spanGrp) {
                        centerSpan.spanGrp.position.y = 0;
                        centerSpan.spanGrp.rotation.z = 0;
                    }
                    br.loadPassed = false;
                    MO.showToast('🔧 Equipe reforçou o vão central e reiniciou o Teste de Carga!', '🔧');
                    MO.runBridgeLoadTest();
                }
                return false;
            }

            if (state.phase === 0) {
                if (state.weeds.every(w => w.cleared) && MO.computeLotLevelProgress() >= 90) {
                    MO.modes.bridge.onStartPhase1();
                }
            } else if (state.phase === 1) {
                if (br.abutments.every(a => a.built) && br.piers.every(p => p.concreted)) {
                    MO.advanceBridgePhase2();
                }
            } else if (state.phase === 2) {
                if (br.girders.every(s => s.hasDeck)) {
                    MO.advanceBridgePhase3();
                }
            } else if (state.phase === 3) {
                if (br.girders.every(s => s.hasRails)) {
                    if (!br.truckTesting && !br.loadPassed) {
                        MO.runBridgeLoadTest();
                    }
                    if (br.loadPassed) return true;
                }
            }
            return false;
        }
    };

    MO.advanceBridgePhase2 = MO.advanceBridgePhase2;
    MO.advanceBridgePhase3 = MO.advanceBridgePhase3;
    MO.runBridgeLoadTest = MO.runBridgeLoadTest;
})(window.MO = window.MO || {});

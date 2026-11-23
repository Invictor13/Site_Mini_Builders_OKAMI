// =========================================================================
// ENTITIES: ÁREA DE VIVÊNCIA (BARRACAS, REFEITÓRIO, BEBEDOURO & REFLETORES)
// =========================================================================
(function(MO) {
    function findDrySpot(baseX, baseZ) {
        const candidates = [
            [0, 0], [0.6, 0], [-0.6, 0], [0, -0.6], [0, 0.6],
            [1.1, -0.6], [-1.1, -0.6], [0.8, 0.8], [-0.8, 0.8]
        ];
        for (let i = 0; i < candidates.length; i++) {
            const x = Math.max(-8.1, Math.min(8.1, baseX + candidates[i][0]));
            const z = Math.max(-7.6, Math.min(6.8, baseZ + candidates[i][1]));
            const y = MO.getTerrainHeight(x, z);
            if (y > MO.WATER_LEVEL + 0.16) {
                return { x, y, z };
            }
        }
        return { x: baseX, y: Math.max(MO.WATER_LEVEL + 0.2, MO.getTerrainHeight(baseX, baseZ)), z: baseZ };
    }

    function createTent(idx, baseX, baseZ, colorHex) {
        const spot = findDrySpot(baseX, baseZ);
        const group = new THREE.Group();
        group.position.set(spot.x, spot.y, spot.z);
        group.rotation.y = -0.55 + idx * 0.18;
        group.userData = { interactiveKind: 'camp-tent', tentIdx: idx };

        // Marcador inicial (estacas antes de armar a barraca)
        const markerGroup = new THREE.Group();
        const stakeGeo = new THREE.CylinderGeometry(0.018, 0.012, 0.22, 6);
        [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].forEach(([sx, sz]) => {
            const st = new THREE.Mesh(stakeGeo, MO.mats.wood);
            st.position.set(sx, 0.08, sz);
            markerGroup.add(st);
        });
        const guideRing = new THREE.Mesh(
            new THREE.RingGeometry(0.45, 0.52, 4),
            new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
        );
        guideRing.rotation.x = -Math.PI / 2;
        guideRing.rotation.z = Math.PI / 4;
        guideRing.position.y = 0.02;
        markerGroup.add(guideRing);

        // Barraca montada (A-frame aconchegante + colchonete + lampião interno)
        const builtGroup = new THREE.Group();
        builtGroup.visible = false;

        const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
        const floor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 1.15), floorMat);
        floor.position.y = 0.02;
        builtGroup.add(floor);

        const fabricMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: 0xd97706,
            emissiveIntensity: 0,
            roughness: 0.85,
            side: THREE.DoubleSide
        });

        const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.86, 1.14), fabricMat);
        wallL.position.set(-0.24, 0.36, 0);
        wallL.rotation.z = -0.58;
        wallL.castShadow = true;

        const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.86, 1.14), fabricMat);
        wallR.position.set(0.24, 0.36, 0);
        wallR.rotation.z = 0.58;
        wallR.castShadow = true;

        const backPanel = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.72, 3), fabricMat);
        backPanel.rotation.y = Math.PI;
        backPanel.scale.set(0.95, 1, 0.08);
        backPanel.position.set(0, 0.36, -0.54);

        const ridgePole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.24, 6), MO.mats.wood);
        ridgePole.rotation.x = Math.PI / 2;
        ridgePole.position.set(0, 0.72, 0);

        // Colchonete & travesseiro lá dentro
        const matMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.06, 0.82),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 })
        );
        matMesh.position.set(0, 0.07, -0.05);
        const pillow = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.07, 0.16),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 })
        );
        pillow.position.set(0, 0.11, -0.35);

        // Lampião interno
        const lanternMat = new THREE.MeshStandardMaterial({
            color: 0xfef3c7,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.1
        });
        const lanternOrb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), lanternMat);
        lanternOrb.position.set(0, 0.58, 0.18);

        builtGroup.add(wallL, wallR, backPanel, ridgePole, matMesh, pillow, lanternOrb);
        group.add(markerGroup, builtGroup);
        MO.groups.camp.add(group);

        return {
            id: idx,
            x: spot.x,
            y: spot.y,
            z: spot.z,
            group,
            markerGroup,
            builtGroup,
            fabricMat,
            lanternMat,
            built: false,
            reserved: false,
            occupiedBy: null
        };
    }

    function createMessHall() {
        const spot = findDrySpot(-6.0, -2.7);
        const group = new THREE.Group();
        group.position.set(spot.x, spot.y, spot.z);
        group.rotation.y = 0.25;
        group.userData = { interactiveKind: 'camp-mess' };

        const markerGroup = new THREE.Group();
        const padOutline = new THREE.Mesh(
            new THREE.RingGeometry(1.05, 1.15, 4),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
        );
        padOutline.rotation.x = -Math.PI / 2;
        padOutline.rotation.z = Math.PI / 4;
        padOutline.position.y = 0.02;
        markerGroup.add(padOutline);

        const builtGroup = new THREE.Group();
        builtGroup.visible = false;

        // 4 postes de madeira + cobertura listrada de lona (abrigo contra chuva/sol)
        [[-0.85, -0.65], [0.85, -0.65], [-0.85, 0.65], [0.85, 0.65]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.35, 6), MO.mats.wood);
            post.position.set(px, 0.675, pz);
            post.castShadow = true;
            builtGroup.add(post);
        });

        const tarpMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.72, side: THREE.DoubleSide });
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.05, 1.56), tarpMat);
        roof.position.set(0, 1.36, 0);
        roof.rotation.z = -0.06;
        roof.castShadow = true;
        builtGroup.add(roof);

        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(1.98, 0.056, 0.46),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.75 })
        );
        stripe.position.set(0, 1.362, 0);
        stripe.rotation.z = -0.06;
        builtGroup.add(stripe);

        // Mesa e bancos de madeira
        const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.05, 0.54), MO.mats.wood);
        tableTop.position.set(-0.08, 0.46, 0);
        tableTop.castShadow = true;
        const legL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.44), MO.mats.wood);
        legL.position.set(-0.50, 0.22, 0);
        const legR = legL.clone();
        legR.position.x = 0.34;
        const bench1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.20), MO.mats.wood);
        bench1.position.set(-0.08, 0.24, 0.44);
        const bench2 = bench1.clone();
        bench2.position.z = -0.44;
        builtGroup.add(tableTop, legL, legR, bench1, bench2);

        // Marmitas e canecas em cima da mesa
        [[-0.36, 0.08, 0xef4444], [-0.08, -0.06, 0x22c55e], [0.22, 0.06, 0xf59e0b]].forEach(([mx, mz, col]) => {
            const pot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.065, 0.065, 0.06, 8),
                new THREE.MeshStandardMaterial({ color: col, metalness: 0.4, roughness: 0.4 })
            );
            pot.position.set(mx, 0.515, mz);
            builtGroup.add(pot);
        });

        // Bebedouro com galão de água azul 20L na ponta direita do refeitório
        const coolerGroup = new THREE.Group();
        coolerGroup.position.set(0.76, 0, 0.46);
        coolerGroup.userData = { interactiveKind: 'camp-cooler' };
        const stand = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.46, 0.24),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 })
        );
        stand.position.y = 0.23;
        const jug = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.11, 0.30, 10),
            new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.78, roughness: 0.2 })
        );
        jug.position.y = 0.61;
        coolerGroup.add(stand, jug);
        builtGroup.add(coolerGroup);

        // Fogareiro / panelinha com brasa suave ao lado esquerdo
        const stoveGroup = new THREE.Group();
        stoveGroup.position.set(-0.78, 0, -0.48);
        const stoneRing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.25, 0.08, 8),
            MO.mats.stone
        );
        stoneRing.position.y = 0.04;
        const emberMat = new THREE.MeshStandardMaterial({
            color: 0xf97316,
            emissive: 0xea580c,
            emissiveIntensity: 0.45
        });
        const embers = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), emberMat);
        embers.scale.set(1.2, 0.45, 1.2);
        embers.position.y = 0.07;
        const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.09, 0.12, 10),
            MO.mats.steel
        );
        pot.position.y = 0.16;
        stoveGroup.add(stoneRing, embers, pot);
        builtGroup.add(stoveGroup);

        // Luz acolhedora compartilhada do acampamento (acende à noite)
        const campLight = new THREE.PointLight(0xffa94d, 0, 8.5, 1.6);
        campLight.position.set(0, 1.15, 0);
        builtGroup.add(campLight);

        group.add(markerGroup, builtGroup);
        MO.groups.camp.add(group);

        // Calcula posições mundiais aproximadas dos assentos e bebedouro
        const cosR = Math.cos(group.rotation.y);
        const sinR = Math.sin(group.rotation.y);
        function toWorld(lx, lz) {
            return {
                x: spot.x + lx * cosR + lz * sinR,
                z: spot.z - lx * sinR + lz * cosR
            };
        }

        const waterPos = toWorld(0.76, 0.85);
        const seats = [toWorld(-0.36, 0.56), toWorld(0.14, 0.56), toWorld(-0.10, -0.56)];
        const shelterSpots = [toWorld(-0.35, 0.15), toWorld(0.15, 0.15), toWorld(0.35, -0.25)];
        const stovePos = toWorld(-0.78, -0.48);

        return {
            x: spot.x,
            y: spot.y,
            z: spot.z,
            group,
            markerGroup,
            builtGroup,
            emberMat,
            campLight,
            waterSpot: waterPos,
            seats,
            shelterSpots,
            stoveSpot: stovePos,
            built: false,
            reserved: false
        };
    }

    function createFloodlight(idx, baseX, baseZ) {
        const spot = findDrySpot(baseX, baseZ);
        const group = new THREE.Group();
        group.position.set(spot.x, spot.y, spot.z);
        // Aponta para o centro da obra (0, 0.6, -0.5)
        const aimAngle = Math.atan2(0 - spot.x, -0.5 - spot.z);
        group.rotation.y = aimAngle;
        group.userData = { interactiveKind: 'camp-floodlight', lightIdx: idx };

        const markerGroup = new THREE.Group();
        const kit = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.14, 0.24),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 })
        );
        kit.position.y = 0.07;
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.28, 0.35, 12),
            new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        markerGroup.add(kit, ring);

        const builtGroup = new THREE.Group();
        builtGroup.visible = false;

        const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.3 });
        // Pernas do tripé
        for (let l = 0; l < 3; l++) {
            const ang = (l / 3) * Math.PI * 2;
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 6), yellowMat);
            leg.position.set(Math.sin(ang) * 0.20, 0.28, Math.cos(ang) * 0.20);
            leg.rotation.z = -Math.sin(ang) * 0.45;
            leg.rotation.x = Math.cos(ang) * 0.45;
            builtGroup.add(leg);
        }
        // Mastro telescópico
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 1.85, 8), MO.mats.steel);
        mast.position.y = 1.15;
        mast.castShadow = true;
        builtGroup.add(mast);

        // Cabeçote duplo de LED
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 2.08, 0);
        headGroup.rotation.x = 0.32; // Inclina levemente para o canteiro

        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.14), yellowMat);
        const lensMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xfef9c3,
            emissiveIntensity: 0.15
        });
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.11, 0.03), lensMat);
        lens.position.z = 0.075;

        // Cone volumétrico suave de luz quando ligado à noite
        const coneMat = new THREE.MeshBasicMaterial({
            color: 0xfef9c3,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.85, 5.2, 12, 1, true), coneMat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = 2.65;
        cone.visible = false;

        headGroup.add(housing, lens, cone);
        builtGroup.add(headGroup);

        // Luz real projetada na direção da obra
        const pointLight = new THREE.PointLight(0xfff4d6, 0, 15, 1.45);
        pointLight.position.set(0, 2.05, 1.5);
        builtGroup.add(pointLight);

        group.add(markerGroup, builtGroup);
        MO.groups.camp.add(group);

        return {
            id: idx,
            x: spot.x,
            y: spot.y,
            z: spot.z,
            group,
            markerGroup,
            builtGroup,
            lensMat,
            coneMat,
            cone,
            pointLight,
            built: false,
            reserved: false,
            manualOn: false
        };
    }

    MO.rebuildCamp = function() {
        while (MO.groups.camp.children.length > 0) {
            MO.groups.camp.remove(MO.groups.camp.children[0]);
        }
        const camp = MO.state.camp;
        camp.tents = [
            createTent(0, 5.8, -3.6, 0x3b82f6),
            createTent(1, 6.7, -2.6, 0xd97706),
            createTent(2, 5.5, -2.3, 0x15803d)
        ];
        camp.messHall = createMessHall();
        camp.waterCooler = camp.messHall.waterSpot;
        camp.stoveSpot = camp.messHall.stoveSpot;
        camp.campLight = camp.messHall.campLight;
        camp.floodlights = [
            createFloodlight(0, -4.3, 2.3),
            createFloodlight(1, 4.4, -2.7)
        ];
        camp.steamTimer = 0;
    };

    MO.completeTentBuild = function(tent) {
        if (!tent || tent.built) return;
        tent.built = true;
        tent.reserved = false;
        tent.markerGroup.visible = false;
        tent.builtGroup.visible = true;
        MO.spawnBurst(tent.x, tent.y + 0.4, tent.z, 0xfbbf24, 8, 0.06);
        MO.SoundFX.playHammerWood();
    };

    MO.completeMessBuild = function() {
        const mh = MO.state.camp.messHall;
        if (!mh || mh.built) return;
        mh.built = true;
        mh.reserved = false;
        mh.markerGroup.visible = false;
        mh.builtGroup.visible = true;
        MO.spawnBurst(mh.x, mh.y + 0.7, mh.z, 0x38bdf8, 12, 0.08);
        MO.SoundFX.playHammerWood();
        MO.showToast('Refeitório, bebedouro e fogareiro montados!', '🍲');
    };

    MO.completeFloodlightBuild = function(fl) {
        if (!fl || fl.built) return;
        fl.built = true;
        fl.reserved = false;
        fl.markerGroup.visible = false;
        fl.builtGroup.visible = true;
        MO.spawnBurst(fl.x, fl.y + 1.2, fl.z, 0xfef08a, 10, 0.08);
        MO.SoundFX.playElectricSwitch();
        MO.showToast(`Torre de Refletor #${fl.id + 1} armada e pronta para a noite!`, '💡');
    };

    MO.areFloodlightsReady = function() {
        const fls = MO.state.camp.floodlights;
        return fls && fls.some(fl => fl.built);
    };

    MO.toggleCampNightMode = function() {
        const camp = MO.state.camp;
        camp.nightMode = camp.nightMode === 'rotate' ? 'sleep' : 'rotate';
        const btn = document.getElementById('btn-camp-shift');
        if (btn) {
            btn.textContent = camp.nightMode === 'rotate' ? '🔄 Turno' : '⛺ Dormir';
            btn.classList.toggle('active', camp.nightMode === 'rotate');
        }
        MO.showToast(
            camp.nightMode === 'rotate'
                ? '🔄 Turno Noturno: equipe se reveza nas barracas com refletores e lanternas!'
                : '⛺ Turno Diurno: todos dormem nas barracas à noite (tempo noturno acelerado).',
            '🏕️'
        );
    };

    MO.updateCamp = function(dt, t) {
        const state = MO.state;
        const camp = state.camp;
        const isNight = state.isNight;

        // Atualiza refletores portáteis
        camp.floodlights.forEach(fl => {
            if (!fl.built) return;
            const on = isNight || fl.manualOn;
            const targetInt = on ? 2.15 : 0;
            fl.pointLight.intensity += (targetInt - fl.pointLight.intensity) * Math.min(1, dt * 4);
            fl.lensMat.emissiveIntensity = on ? 2.2 : 0.1;
            fl.cone.visible = on;
            fl.coneMat.opacity = on ? (0.095 + Math.sin(t * 14 + fl.id) * 0.008) : 0;
        });

        // Atualiza barracas (luz quente quando há ajudante dormindo dentro à noite)
        camp.tents.forEach(tent => {
            if (!tent.built) return;
            const occupied = tent.occupiedBy !== null;
            const glow = occupied ? (isNight ? 0.42 : 0.16) : (isNight ? 0.08 : 0);
            tent.fabricMat.emissiveIntensity += (glow - tent.fabricMat.emissiveIntensity) * Math.min(1, dt * 3.5);
            tent.lanternMat.emissiveIntensity = occupied ? 1.8 : (isNight ? 0.55 : 0.05);
        });

        // Atualiza refeitório, brasa do fogareiro e fumacinha da panela
        const mh = camp.messHall;
        if (mh && mh.built) {
            const flicker = 0.85 + Math.sin(t * 9.5) * 0.15;
            mh.emberMat.emissiveIntensity = (isNight ? 1.45 : 0.55) * flicker;
            const targetCampInt = isNight ? (1.35 * flicker) : 0;
            mh.campLight.intensity += (targetCampInt - mh.campLight.intensity) * Math.min(1, dt * 3);

            camp.steamTimer += dt;
            if (camp.steamTimer > 0.75) {
                camp.steamTimer = 0;
                MO.spawnBurst(mh.stoveSpot.x, mh.y + 0.25, mh.stoveSpot.z, isNight ? 0xfb923c : 0xe2e8f0, 2, 0.025);
            }
        }
    };
})(window.MO = window.MO || {});

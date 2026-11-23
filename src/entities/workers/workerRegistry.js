// =========================================================================
// ENTITIES / WORKERS: PERFIS (1 SUPERVISOR + 10 AJUDANTES) & RIG COMPARTILHADO
// =========================================================================
(function(MO) {
    const SUPERVISOR_PROFILE = {
        helmet: 0xf8fafc,
        vest: 0xf59e0b,
        name: 'Supervisor Beto',
        role: 'supervisor',
        specialty: 'supervisor',
        speed: 3.35
    };

    const HELPER_PROFILES = [
        { helmet: 0xfacc15, vest: 0xd97706, name: 'Pedreiro Zé', role: 'builder', specialty: 'mason', speed: 2.85 },
        { helmet: 0xe2e8f0, vest: 0x334155, name: 'Servente Léo', role: 'helper', specialty: 'earthwork', speed: 2.95 },
        { helmet: 0x38bdf8, vest: 0x0369a1, name: 'Carpinteiro Tito', role: 'carpenter', specialty: 'carpenter', speed: 2.90 },
        { helmet: 0xfbbf24, vest: 0x475569, name: 'Masseiro Caio', role: 'helper', specialty: 'logistics', speed: 3.00 },
        { helmet: 0xa3e635, vest: 0x3f6212, name: 'Peão Duda', role: 'helper', specialty: 'earthwork', speed: 2.88 },
        { helmet: 0xf97316, vest: 0x7c2d12, name: 'Pedreiro Chico', role: 'builder', specialty: 'mason', speed: 2.82 },
        { helmet: 0x2dd4bf, vest: 0x115e59, name: 'Carpinteiro Rui', role: 'carpenter', specialty: 'carpenter', speed: 2.92 },
        { helmet: 0xf472b6, vest: 0x831843, name: 'Servente Nina', role: 'helper', specialty: 'logistics', speed: 3.05 },
        { helmet: 0xc084fc, vest: 0x581c87, name: 'Peão Guga', role: 'builder', specialty: 'mason', speed: 2.86 },
        { helmet: 0x60a5fa, vest: 0x1e3a8a, name: 'Servente Manu', role: 'helper', specialty: 'earthwork', speed: 2.98 }
    ];

    MO.SUPERVISOR_PROFILE = SUPERVISOR_PROFILE;
    MO.HELPER_PROFILES = HELPER_PROFILES;
    MO.WORKER_PROFILES = HELPER_PROFILES;
    MO.MAX_WORKERS = (MO.MAX_SUPERVISORS || 1) + (MO.MAX_HELPERS || 10);

    // Geometrias e materiais comuns compartilhados entre até 11 NPCs (protegidos contra descarte)
    let sharedRigAssets = null;
    const cachedRoleMats = new Map();

    function getSharedRigAssets() {
        if (sharedRigAssets) return sharedRigAssets;
        sharedRigAssets = {
            legGeo: new THREE.BoxGeometry(0.10, 0.26, 0.10),
            torsoGeo: new THREE.BoxGeometry(0.26, 0.32, 0.16),
            ponchoGeo: new THREE.BoxGeometry(0.30, 0.33, 0.20),
            armGeo: new THREE.BoxGeometry(0.08, 0.24, 0.08),
            headGeo: new THREE.SphereGeometry(0.12, 10, 8),
            helmetGeo: new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
            mountGeo: new THREE.BoxGeometry(0.08, 0.045, 0.05),
            lensGeo: new THREE.BoxGeometry(0.06, 0.03, 0.02),
            coneGeo: new THREE.ConeGeometry(0.42, 1.55, 10, 1, true),
            brickGeo: new THREE.BoxGeometry(0.26, 0.13, 0.12),
            plankGeo: new THREE.BoxGeometry(0.54, 0.11, 0.05),
            beamGeo: new THREE.BoxGeometry(0.76, 0.12, 0.13),
            bkBodyGeo: new THREE.CylinderGeometry(0.11, 0.085, 0.18, 10),
            bkMortarGeo: new THREE.CylinderGeometry(0.10, 0.10, 0.03, 10),
            sackGeo: new THREE.BoxGeometry(0.28, 0.16, 0.22),
            rebarBarGeo: new THREE.CylinderGeometry(0.012, 0.012, 0.72, 6),
            wbTubGeo: new THREE.BoxGeometry(0.32, 0.16, 0.36),
            wbConcreteGeo: new THREE.BoxGeometry(0.28, 0.05, 0.30),
            wbWheelGeo: new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10),
            hoeShaftGeo: new THREE.CylinderGeometry(0.015, 0.015, 0.58, 6),
            hoeBladeGeo: new THREE.BoxGeometry(0.18, 0.12, 0.025),
            hammerShaftGeo: new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6),
            hammerHeadGeo: new THREE.BoxGeometry(0.11, 0.045, 0.045),
            trowelGeo: new THREE.BoxGeometry(0.10, 0.02, 0.16),
            cupGeo: new THREE.CylinderGeometry(0.04, 0.032, 0.09, 8),
            lunchGeo: new THREE.BoxGeometry(0.15, 0.06, 0.12),
            clipboardGeo: new THREE.BoxGeometry(0.14, 0.02, 0.19),
            sawBladeGeo: new THREE.BoxGeometry(0.02, 0.07, 0.34),

            legMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }),
            ponchoMat: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 }),
            skinMat: new THREE.MeshStandardMaterial({ color: 0xfdba74, roughness: 0.7 }),
            mountMat: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }),
            bucketMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }),
            sackMat: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 }),
            wbTubMat: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 }),
            cupMat: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 }),
            lunchMat: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 }),
            clipboardMat: new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 })
        };

        if (MO.resources) {
            MO.resources.protect(...Object.values(sharedRigAssets));
        }
        return sharedRigAssets;
    }

    function getColoredStandardMat(key, hex, roughness = 0.75) {
        const k = `${key}:${hex}`;
        if (!cachedRoleMats.has(k)) {
            const mat = new THREE.MeshStandardMaterial({ color: hex, roughness });
            cachedRoleMats.set(k, mat);
            if (MO.resources) MO.resources.protect(mat);
        }
        return cachedRoleMats.get(k);
    }

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
        const S = getSharedRigAssets();
        const g = new THREE.Group();
        const legL = new THREE.Mesh(S.legGeo, S.legMat); legL.position.set(-0.07, 0.13, 0);
        const legR = new THREE.Mesh(S.legGeo, S.legMat); legR.position.set(0.07, 0.13, 0);

        const torsoPivot = new THREE.Group();
        torsoPivot.position.set(0, 0.26, 0);

        const torso = new THREE.Mesh(S.torsoGeo, getColoredStandardMat('vest', vestHex, 0.75));
        torso.position.y = 0.16; torso.castShadow = true;

        const rainPoncho = new THREE.Mesh(S.ponchoGeo, S.ponchoMat);
        rainPoncho.position.y = 0.17;
        rainPoncho.visible = false;

        const armL = new THREE.Mesh(S.armGeo, S.skinMat); armL.position.set(-0.18, 0.16, 0);
        const armR = new THREE.Mesh(S.armGeo, S.skinMat); armR.position.set(0.18, 0.16, 0);

        const head = new THREE.Mesh(S.headGeo, S.skinMat); head.position.y = 0.43;
        const helmet = new THREE.Mesh(S.helmetGeo, getColoredStandardMat('helmet', helmetHex, 0.35));
        helmet.position.y = 0.47; helmet.castShadow = true;

        // Lanterna frontal no capacete
        const headlampMount = new THREE.Mesh(S.mountGeo, S.mountMat);
        headlampMount.position.set(0, 0.50, 0.13);
        const headlampLensMat = new THREE.MeshStandardMaterial({
            color: 0xfef9c3,
            emissive: 0xfef08a,
            emissiveIntensity: 0.0
        });
        const headlampLens = new THREE.Mesh(S.lensGeo, headlampLensMat);
        headlampLens.position.set(0, 0.50, 0.156);

        const headlampConeMat = new THREE.MeshBasicMaterial({
            color: 0xfef9c3,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const headlampCone = new THREE.Mesh(S.coneGeo, headlampConeMat);
        headlampCone.rotation.x = -Math.PI / 2 + 0.26;
        headlampCone.position.set(0, 0.34, 0.90);
        headlampCone.visible = false;

        const headlampLight = new THREE.PointLight(0xfef9c3, 0, 5.0, 1.7);
        headlampLight.position.set(0, 0.48, 0.85);

        const carryBrick = new THREE.Mesh(S.brickGeo, MO.mats.brickCeramic);
        carryBrick.position.set(0, 0.18, 0.20); carryBrick.visible = false;

        const carryPlank = new THREE.Mesh(S.plankGeo, MO.mats.formwork);
        carryPlank.position.set(0, 0.22, 0.22); carryPlank.visible = false;

        const carryBeam = new THREE.Mesh(S.beamGeo, MO.mats.steel);
        carryBeam.position.set(0, 0.28, 0.22); carryBeam.visible = false;

        const carryBucket = new THREE.Group();
        const bkBody = new THREE.Mesh(S.bkBodyGeo, S.bucketMat);
        const bkMortar = new THREE.Mesh(S.bkMortarGeo, MO.mats.concrete);
        bkMortar.position.y = 0.085;
        carryBucket.add(bkBody, bkMortar);
        carryBucket.position.set(0, 0.12, 0.23);
        carryBucket.visible = false;

        const carrySack = new THREE.Mesh(S.sackGeo, S.sackMat);
        carrySack.position.set(0, 0.20, 0.22);
        carrySack.visible = false;

        const carryRebar = new THREE.Group();
        [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]].forEach(([rx, rz]) => {
            const bar = new THREE.Mesh(S.rebarBarGeo, MO.mats.steel);
            bar.position.set(rx, 0, rz);
            carryRebar.add(bar);
        });
        carryRebar.rotation.x = 0.42;
        carryRebar.position.set(0, 0.24, 0.24);
        carryRebar.visible = false;

        const carryWheelbarrow = new THREE.Group();
        const wbTub = new THREE.Mesh(S.wbTubGeo, S.wbTubMat);
        wbTub.position.set(0, 0.02, 0.42);
        const wbConcrete = new THREE.Mesh(S.wbConcreteGeo, MO.mats.concrete);
        wbConcrete.position.set(0, 0.09, 0.42);
        const wbWheel = new THREE.Mesh(S.wbWheelGeo, MO.mats.steel);
        wbWheel.rotation.z = Math.PI / 2;
        wbWheel.position.set(0, -0.06, 0.62);
        carryWheelbarrow.add(wbTub, wbConcrete, wbWheel);
        carryWheelbarrow.visible = false;

        const toolHoe = new THREE.Group();
        const hShaft = new THREE.Mesh(S.hoeShaftGeo, MO.mats.wood);
        hShaft.rotation.x = Math.PI / 2; hShaft.position.set(0, -0.08, 0.22);
        const hBlade = new THREE.Mesh(S.hoeBladeGeo, MO.mats.steel);
        hBlade.position.set(0, -0.12, 0.48);
        toolHoe.add(hShaft, hBlade); toolHoe.visible = false;
        armR.add(toolHoe);

        const toolHammer = new THREE.Group();
        const mShaft = new THREE.Mesh(S.hammerShaftGeo, MO.mats.wood);
        mShaft.rotation.x = Math.PI / 2; mShaft.position.set(0, -0.08, 0.14);
        const mHead = new THREE.Mesh(S.hammerHeadGeo, MO.mats.steel);
        mHead.position.set(0, -0.08, 0.26);
        toolHammer.add(mShaft, mHead); toolHammer.visible = false;
        armR.add(toolHammer);

        const toolTrowel = new THREE.Group();
        const tPlate = new THREE.Mesh(S.trowelGeo, MO.mats.steel);
        tPlate.position.set(0, -0.10, 0.15);
        toolTrowel.add(tPlate); toolTrowel.visible = false;
        armR.add(toolTrowel);

        const toolSaw = new THREE.Group();
        const sawBlade = new THREE.Mesh(S.sawBladeGeo, MO.mats.steel);
        sawBlade.position.set(0, -0.10, 0.22);
        toolSaw.add(sawBlade); toolSaw.visible = false;
        armR.add(toolSaw);

        const propCup = new THREE.Mesh(S.cupGeo, S.cupMat);
        propCup.position.set(0, -0.10, 0.09);
        propCup.visible = false;
        armR.add(propCup);

        const propLunch = new THREE.Mesh(S.lunchGeo, S.lunchMat);
        propLunch.position.set(0, -0.10, 0.11);
        propLunch.visible = false;
        armR.add(propLunch);

        const propClipboard = new THREE.Mesh(S.clipboardGeo, S.clipboardMat);
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
            toolHoe, toolHammer, toolTrowel, toolSaw,
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
        if (rig.toolSaw) rig.toolSaw.visible = toolName === 'saw';
        rig.propCup.visible = toolName === 'cup';
        rig.propLunch.visible = toolName === 'lunch';
        rig.propClipboard.visible = toolName === 'clipboard';
    }

    function setBodyVisible(w, visible) {
        w.rig.legL.visible = visible;
        w.rig.legR.visible = visible;
        w.rig.torsoPivot.visible = visible;
    }

    function getNpcCounts() {
        const workers = MO.state && Array.isArray(MO.state.workers) ? MO.state.workers : [];
        let supervisors = 0;
        let helpers = 0;
        for (let i = 0; i < workers.length; i++) {
            if (workers[i].role === 'supervisor') supervisors++;
            else helpers++;
        }
        return {
            supervisors,
            helpers,
            total: workers.length,
            maxSupervisors: MO.MAX_SUPERVISORS || 1,
            maxHelpers: MO.MAX_HELPERS || 10
        };
    }

    function resolveProfile(idx, customProfile, kind = 'helper', helperIndex = 0) {
        if (kind === 'supervisor' && !customProfile) {
            return { ...SUPERVISOR_PROFILE };
        }
        const base = HELPER_PROFILES[helperIndex % HELPER_PROFILES.length];
        if (!customProfile) {
            return {
                helmet: base.helmet,
                vest: base.vest,
                name: helperIndex < HELPER_PROFILES.length ? base.name : `${base.name} #${helperIndex + 1}`,
                role: base.role,
                specialty: base.specialty,
                speed: base.speed
            };
        }
        return {
            helmet: customProfile.helmet ?? customProfile.h ?? base.helmet,
            vest: customProfile.vest ?? customProfile.v ?? base.vest,
            name: customProfile.name ?? customProfile.n ?? `${base.name} #${helperIndex + 1}`,
            role: customProfile.role ?? base.role,
            specialty: customProfile.specialty ?? base.specialty,
            speed: customProfile.speed ?? base.speed
        };
    }

    function createWorkerEntity(idx, options = {}) {
        const state = MO.state;
        const kind = options.kind || (options.profile && options.profile.role === 'supervisor' ? 'supervisor' : 'helper');
        const counts = getNpcCounts();
        const profile = resolveProfile(idx, options.profile, kind, counts.helpers);
        const rig = createWorkerMesh(profile.helmet, profile.vest, idx);

        const tb = MO.STATION_TOOLBOX || { x: -10.8, z: 4.2 };
        const angle = (idx % 10) * 0.65;
        const sx = options.x !== undefined
            ? options.x
            : (state.unifiedVillage ? (tb.x + Math.cos(angle) * 0.9) : (-1.6 + (idx % 3) * 1.4));
        const sz = options.z !== undefined
            ? options.z
            : (state.unifiedVillage ? (tb.z + Math.sin(angle) * 0.9) : 2.4);
        const sy = MO.getTerrainHeight ? MO.getTerrainHeight(sx, sz) : 0;
        rig.group.position.set(sx, sy, sz);

        return {
            id: idx,
            name: profile.name,
            role: profile.role,
            specialty: profile.specialty || 'mason',
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
            speed: profile.speed,
            energy: options.energy !== undefined ? options.energy : (95 - (idx % 4) * 5),
            hydration: options.hydration !== undefined ? options.hydration : (92 - (idx % 4) * 6),
            hunger: options.hunger !== undefined ? options.hunger : (90 - (idx % 4) * 7),
            sleepingInside: false,
            statusText: profile.role === 'supervisor' ? 'Analisando o terreno' : 'Aguardando na Caixa de Ferramentas'
        };
    }

    function syncNpcUI() {
        const counts = getNpcCounts();
        const npcBtnLbl = document.getElementById('npc-btn-label');
        if (npcBtnLbl) {
            npcBtnLbl.textContent = `NPCs (${counts.total}/${counts.maxTotal})`;
        }
        const lbl = document.getElementById('worker-btn-label');
        if (lbl) {
            lbl.textContent = `NPCs (${counts.supervisors}/${counts.maxSupervisors} · ${counts.helpers}/${counts.maxHelpers})`;
        }
        const supEl = document.getElementById('sup-count-label');
        const hlpEl = document.getElementById('help-count-label');
        if (supEl) supEl.textContent = `Sup (${counts.supervisors}/${counts.maxSupervisors})`;
        if (hlpEl) hlpEl.textContent = `+1 Ajud (${counts.helpers}/${counts.maxHelpers})`;
        if (MO.renderNpcRosterUI) MO.renderNpcRosterUI();
    }

    function hireSupervisor(options = {}) {
        const counts = getNpcCounts();
        if (counts.supervisors >= counts.maxSupervisors) {
            if (!options.silent && MO.showToast) {
                MO.showToast('Já existe 1 Supervisor ativo no mapa!', '📋');
            }
            return null;
        }
        const state = MO.state;
        const worker = createWorkerEntity(state.workers.length, { ...options, kind: 'supervisor' });
        if (MO.groups && MO.groups.workers) MO.groups.workers.add(worker.rig.group);
        state.workers.push(worker);
        syncNpcUI();
        if (!options.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            if (MO.showToast) MO.showToast(`${worker.name} chegou para demarcar estradas e estações!`, '📋');
        }
        return worker;
    }

    function hireHelper(options = {}) {
        const counts = getNpcCounts();
        const maxHelpers = options.maxHelpers !== undefined
            ? options.maxHelpers
            : (options.maxWorkers !== undefined ? options.maxWorkers : counts.maxHelpers);
        if (counts.helpers >= maxHelpers) {
            if (!options.silent && MO.showToast) {
                MO.showToast(`Equipe completa (${maxHelpers}/${maxHelpers} ajudantes no mapa)!`, '👷');
            }
            return null;
        }
        const state = MO.state;
        const worker = createWorkerEntity(state.workers.length, { ...options, kind: 'helper' });
        if (MO.groups && MO.groups.workers) MO.groups.workers.add(worker.rig.group);
        state.workers.push(worker);
        syncNpcUI();
        if (!options.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            if (MO.showToast) MO.showToast(`${worker.name} (${worker.specialty}) entrou no canteiro!`, '👷');
        }
        return worker;
    }

    function hireWorker(options = {}) {
        if (options.kind === 'supervisor' || (options.profile && options.profile.role === 'supervisor')) {
            return hireSupervisor(options);
        }
        return hireHelper(options);
    }

    function hireCrew(helperCount = 4, includeSupervisor = true) {
        if (includeSupervisor) hireSupervisor({ silent: true });
        for (let i = 0; i < helperCount; i++) {
            hireHelper({ silent: true });
        }
        syncNpcUI();
        if (MO.showToast) {
            const c = getNpcCounts();
            MO.showToast(`Equipe pronta: ${c.supervisors} Supervisor e ${c.helpers} Ajudantes!`, '👷');
        }
    }

    MO.workerFactory = {
        SUPERVISOR_PROFILE,
        HELPER_PROFILES,
        DEFAULT_PROFILES: HELPER_PROFILES,
        createWorkerMesh,
        createWorkerEntity,
        hireSupervisor,
        hireHelper,
        hireWorker,
        hireCrew,
        getNpcCounts,
        syncNpcUI,
        setWorkerTool,
        setBodyVisible
    };
})(window.MO = window.MO || {});

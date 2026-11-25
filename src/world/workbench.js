// =========================================================================
// WORLD: CAIXA DE FERRAMENTAS (PONTO ZERO) & BANCADA DE CARPINTARIA
// =========================================================================
(function(MO) {
    let sawGroup = null;
    let rawTimberGroup = null;
    let cutLumberGroup = null;
    let workbenchBuiltGroup = null;
    let activeRawLogMesh = null;
    let wbProgressBg = null;
    let wbProgressFill = null;

    MO.initToolbox = function() {
        const grp = MO.groups && MO.groups.toolbox;
        if (!grp) return;
        MO.resources.clearGroup(grp);

        if (MO.state && MO.state.site) {
            MO.state.site.toolboxLight = null;
            MO.state.site.toolboxLanternMat = null;
            MO.state.site.toolboxFireLight = null;
            MO.state.site.toolboxEmberMat = null;
            MO.state.site.toolboxEmbers = null;
        }

        // No Modo Cidade, o mapa começa 100% limpo (apenas natureza e NPCs — sem caixa no chão)
        if (MO.state && MO.state.cityMode) {
            return;
        }

        const pos = MO.STATION_TOOLBOX || { x: -10.8, z: 4.2 };
        const y = Math.max(MO.WATER_LEVEL + 0.16, MO.getTerrainHeight ? MO.getTerrainHeight(pos.x, pos.z) : 0.28);

        const chest = new THREE.Group();
        chest.position.set(pos.x, y, pos.z);
        chest.rotation.y = 0.35;

        const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.42, metalness: 0.25 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.38, 0.46), redMat);
        body.position.y = 0.19;
        body.castShadow = true;
        body.receiveShadow = true;

        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.48), redMat);
        lid.position.set(0, 0.42, -0.02);
        lid.rotation.x = -0.28;
        lid.castShadow = true;

        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.36), MO.mats.steel);
        tray.position.y = 0.36;

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.15, 6), MO.mats.wood);
        post.position.set(-0.62, 0.57, 0);
        post.castShadow = true;

        const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.22, 0.03),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 })
        );
        flag.position.set(-0.40, 1.02, 0);
        flag.castShadow = true;

        // Lanterna discreta + pequena fogueira de expedição e prancheta de campo no Ponto Zero
        const lanternMat = new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.25,
            roughness: 0.3
        });
        const lanternBulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), lanternMat);
        lanternBulb.position.set(-0.62, 1.24, 0);
        const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.09, 6), MO.mats.steel);
        lanternCap.position.set(-0.62, 1.32, 0);
        const lanternLight = new THREE.PointLight(0xfbbf24, MO.state && MO.state.isNight ? 1.85 : 0.0, 14);
        lanternLight.position.set(-0.62, 1.35, 0.15);

        // Caixote de expedição com mapa topográfico
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.44), MO.mats.wood);
        crate.position.set(0.86, 0.17, 0.14);
        crate.rotation.y = -0.22;
        crate.castShadow = true;
        const mapSheet = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.02, 0.32),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 })
        );
        mapSheet.position.set(0.86, 0.35, 0.14);
        mapSheet.rotation.y = -0.18;

        // Pequena fogueira de campo com pedras (acende acolhedora ao anoitecer)
        const fireGroup = new THREE.Group();
        fireGroup.position.set(0.15, 0, 1.15);
        for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2;
            const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), MO.mats.stone);
            st.position.set(Math.cos(ang) * 0.26, 0.06, Math.sin(ang) * 0.26);
            st.scale.set(1.2, 0.7, 1.0);
            fireGroup.add(st);
        }
        const log1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 5), MO.mats.trunkWood);
        log1.rotation.z = Math.PI / 2;
        log1.rotation.y = 0.4;
        log1.position.y = 0.06;
        const log2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 5), MO.mats.trunkWood);
        log2.rotation.z = Math.PI / 2;
        log2.rotation.y = -0.8;
        log2.position.y = 0.08;
        const emberMat = new THREE.MeshStandardMaterial({
            color: 0xfb923c,
            emissive: 0xea580c,
            emissiveIntensity: MO.state && MO.state.isNight ? 1.8 : 0.35,
            roughness: 0.5
        });
        const embers = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.20, 5), emberMat);
        embers.position.y = 0.14;
        const fireLight = new THREE.PointLight(0xff8c42, MO.state && MO.state.isNight ? 1.45 : 0.0, 10, 1.5);
        fireLight.position.set(0, 0.38, 0);
        fireGroup.add(log1, log2, embers, fireLight);

        if (MO.state && MO.state.site) {
            MO.state.site.toolboxLight = lanternLight;
            MO.state.site.toolboxLanternMat = lanternMat;
            MO.state.site.toolboxFireLight = fireLight;
            MO.state.site.toolboxEmberMat = emberMat;
            MO.state.site.toolboxEmbers = embers;
        }

        chest.add(body, lid, tray, post, flag, lanternBulb, lanternCap, lanternLight, crate, mapSheet, fireGroup);
        grp.add(chest);
    };

    MO.initWorkbench = function() {
        const grp = MO.groups && MO.groups.workbench;
        if (!grp) return;
        MO.resources.clearGroup(grp);

        const pos = MO.STATION_WORKBENCH || { x: -8.6, z: -2.2 };
        const y = Math.max(MO.WATER_LEVEL + 0.16, MO.getTerrainHeight ? MO.getTerrainHeight(pos.x, pos.z) : 0.28);

        const root = new THREE.Group();
        root.position.set(pos.x, y, pos.z);

        workbenchBuiltGroup = new THREE.Group();
        workbenchBuiltGroup.visible = Boolean(MO.state.villageInfra && MO.state.villageInfra.workbenchBuilt);

        // Mesa robusta de carpintaria
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.09, 0.86), MO.mats.wood);
        top.position.y = 0.72;
        top.castShadow = true;
        top.receiveShadow = true;
        workbenchBuiltGroup.add(top);

        [[-0.76, -0.34], [0.76, -0.34], [-0.76, 0.34], [0.76, 0.34]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.09), MO.mats.trunkWood);
            leg.position.set(lx, 0.36, lz);
            leg.castShadow = true;
            workbenchBuiltGroup.add(leg);
        });

        // Torno/Morsa metálica + tábua sendo serrada
        const vise = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.20), MO.mats.steel);
        vise.position.set(-0.45, 0.78, 0.38);
        workbenchBuiltGroup.add(vise);

        const workPlank = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.045, 0.20), MO.mats.formwork);
        workPlank.position.set(0.05, 0.79, 0.05);
        workPlank.castShadow = true;
        workbenchBuiltGroup.add(workPlank);

        // Tora bruta em cima da bancada durante o corte florestal + barra de progresso 3D
        activeRawLogMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.115, 0.76, 8),
            MO.mats.trunkWood
        );
        activeRawLogMesh.rotation.z = Math.PI / 2;
        activeRawLogMesh.position.set(0, 0.87, 0);
        activeRawLogMesh.visible = false;
        workbenchBuiltGroup.add(activeRawLogMesh);

        wbProgressBg = new THREE.Mesh(
            new THREE.BoxGeometry(1.02, 0.10, 0.03),
            new THREE.MeshBasicMaterial({ color: 0x0f172a })
        );
        wbProgressBg.position.set(0, 1.42, 0);
        wbProgressBg.visible = false;
        wbProgressFill = new THREE.Mesh(
            new THREE.BoxGeometry(0.94, 0.06, 0.04),
            new THREE.MeshBasicMaterial({ color: 0x34d399 })
        );
        wbProgressFill.position.set(0, 1.42, 0.01);
        wbProgressFill.visible = false;
        workbenchBuiltGroup.add(wbProgressBg, wbProgressFill);

        // Serrote animado
        sawGroup = new THREE.Group();
        sawGroup.position.set(0.28, 0.86, 0.05);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.44), MO.mats.steel);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.12), MO.mats.doorWood);
        handle.position.set(0, 0.04, 0.24);
        sawGroup.add(blade, handle);
        sawGroup.visible = false;
        workbenchBuiltGroup.add(sawGroup);

        // Pilha de madeira bruta (à esquerda) e peças cortadas prontas (à direita)
        rawTimberGroup = new THREE.Group();
        rawTimberGroup.position.set(-1.35, 0, 0);
        for (let i = 0; i < 6; i++) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.15, 7), MO.mats.trunkWood);
            log.rotation.x = Math.PI / 2;
            log.position.set((i % 3) * 0.18 - 0.18, 0.09 + Math.floor(i / 3) * 0.15, 0);
            log.castShadow = true;
            log.visible = false;
            rawTimberGroup.add(log);
        }
        workbenchBuiltGroup.add(rawTimberGroup);

        cutLumberGroup = new THREE.Group();
        cutLumberGroup.position.set(1.35, 0, 0);
        for (let i = 0; i < 8; i++) {
            const plank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.18), MO.mats.formwork);
            plank.position.set((i % 2) * 0.24 - 0.12, 0.06 + Math.floor(i / 2) * 0.065, 0);
            plank.castShadow = true;
            plank.visible = false;
            cutLumberGroup.add(plank);
        }
        workbenchBuiltGroup.add(cutLumberGroup);

        root.add(workbenchBuiltGroup);
        grp.add(root);
        MO.updateWorkbenchVisuals();
    };

    MO.setWorkbenchBuilt = function(built) {
        if (MO.state && MO.state.villageInfra) {
            MO.state.villageInfra.workbenchBuilt = Boolean(built);
        }
        if (workbenchBuiltGroup) {
            workbenchBuiltGroup.visible = Boolean(built);
        }
        MO.updateWorkbenchVisuals();
    };

    MO.updateWorkbenchVisuals = function() {
        const wb = MO.state && MO.state.workbench;
        if (!wb) return;
        if (rawTimberGroup) {
            const visRaw = Math.min(rawTimberGroup.children.length, Math.ceil(wb.rawWood / 2));
            rawTimberGroup.children.forEach((c, idx) => { c.visible = idx < visRaw; });
        }
        if (cutLumberGroup) {
            const visCut = Math.min(cutLumberGroup.children.length, Math.ceil(wb.cutWood / 2));
            cutLumberGroup.children.forEach((c, idx) => { c.visible = idx < visCut; });
        }
    };

    MO.animateWorkbenchSaw = function(active, t, progress = null) {
        if (sawGroup) {
            sawGroup.visible = Boolean(active);
            if (active) {
                sawGroup.position.z = 0.05 + Math.sin(t * 22) * 0.14;
                sawGroup.rotation.x = Math.sin(t * 22) * 0.10;
            }
        }
        if (activeRawLogMesh) {
            activeRawLogMesh.visible = Boolean(active && progress !== null);
        }
        if (wbProgressBg && wbProgressFill) {
            const showBar = Boolean(active && typeof progress === 'number');
            wbProgressBg.visible = showBar;
            wbProgressFill.visible = showBar;
            if (showBar) {
                const p = Math.max(0.02, Math.min(1, progress));
                wbProgressFill.scale.x = p;
                wbProgressFill.position.x = -0.47 * (1 - p);
                if (MO.camera && wbProgressBg.lookAt) {
                    wbProgressBg.lookAt(MO.camera.position);
                    wbProgressFill.lookAt(MO.camera.position);
                }
            }
        }
    };

    MO.deliverRawWood = function(amount = 8) {
        const wb = MO.state && MO.state.workbench;
        if (!wb) return 0;
        wb.rawWood += amount;
        MO.updateWorkbenchVisuals();
        return wb.rawWood;
    };

    MO.completeWoodSawing = function() {
        const wb = MO.state && MO.state.workbench;
        if (!wb || wb.rawWood <= 0) return false;
        wb.rawWood = Math.max(0, wb.rawWood - 1);
        wb.cutWood += 3;
        wb.cutBreakdown.formwork += 1;
        wb.cutBreakdown.props += 1;
        wb.cutBreakdown.scaffolds += 1;
        wb.cutBreakdown.roof += 1;
        MO.animateWorkbenchSaw(false, 0);
        MO.updateWorkbenchVisuals();
        if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
        return true;
    };

    MO.consumeCutWood = function(amount = 1) {
        const wb = MO.state && MO.state.workbench;
        if (!wb) return true;
        if (wb.cutWood < amount) return false;
        wb.cutWood -= amount;
        MO.updateWorkbenchVisuals();
        return true;
    };
})(window.MO = window.MO || {});

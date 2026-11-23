// =========================================================================
// WORLD: CAIXA DE FERRAMENTAS (PONTO ZERO) & BANCADA DE CARPINTARIA
// =========================================================================
(function(MO) {
    let sawGroup = null;
    let rawTimberGroup = null;
    let cutLumberGroup = null;
    let workbenchBuiltGroup = null;

    MO.initToolbox = function() {
        const grp = MO.groups && MO.groups.toolbox;
        if (!grp) return;
        MO.resources.clearGroup(grp);

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

        chest.add(body, lid, tray, post, flag);
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

    MO.animateWorkbenchSaw = function(active, t) {
        if (!sawGroup) return;
        sawGroup.visible = Boolean(active);
        if (active) {
            sawGroup.position.z = 0.05 + Math.sin(t * 22) * 0.14;
            sawGroup.rotation.x = Math.sin(t * 22) * 0.10;
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

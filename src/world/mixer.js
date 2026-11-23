// =========================================================================
// WORLD: ESTAÇÃO INTERATIVA DA MASSEIRA, INSUMOS FÍSICOS E BALDE
// =========================================================================
(function(MO) {
    const stationGroup = new THREE.Group();
    MO.scene.add(stationGroup);

    const mBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.1), MO.mats.wood);
    mBase.position.y = 0.04; mBase.castShadow = true;
    const mW1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.36, 0.07), MO.mats.wood); mW1.position.set(0, 0.22, 0.51);
    const mW2 = mW1.clone(); mW2.position.set(0, 0.22, -0.51);
    const mW3 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 1.1), MO.mats.wood); mW3.position.set(0.71, 0.22, 0);
    const mW4 = mW3.clone(); mW4.position.set(-0.71, 0.22, 0);
    stationGroup.add(mBase, mW1, mW2, mW3, mW4);

    const mixerFillMat = new THREE.MeshStandardMaterial({ map: MO.createNoiseTexture('#c99a56', 30), color: 0xc99a56, roughness: 0.94 });
    const mixerFill = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.25, 0.94), mixerFillMat);
    mixerFill.position.y = 0.05; mixerFill.scale.y = 0.01; mixerFill.visible = false;
    stationGroup.add(mixerFill);

    const mixerStirHitbox = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.65, 1.15), new THREE.MeshBasicMaterial({ visible: false }));
    mixerStirHitbox.position.y = 0.3;
    stationGroup.add(mixerStirHitbox);

    const hoeGroup = new THREE.Group();
    const hoeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.03), MO.mats.steel);
    const hoeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), MO.mats.wood);
    hoeHandle.position.set(0, 0.42, 0.18); hoeHandle.rotation.x = -0.45;
    hoeGroup.add(hoeBlade, hoeHandle);
    hoeGroup.position.set(0, 0.32, 0); hoeGroup.visible = false;
    stationGroup.add(hoeGroup);

    const mixerBarGroup = new THREE.Group();
    mixerBarGroup.position.set(0, 0.88, 0);
    const mixerBarBg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.03), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    const mixerBarFill = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
    mixerBarFill.scale.x = 0.001;
    mixerBarGroup.add(mixerBarBg, mixerBarFill);
    mixerBarGroup.visible = false;
    stationGroup.add(mixerBarGroup);

    // Lona azul protetora sobre a masseira (aparece automaticamente em chuva!)
    const tarpMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.56, 0.05, 1.16),
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.55 })
    );
    tarpMesh.position.y = 0.43;
    tarpMesh.visible = false;
    stationGroup.add(tarpMesh);

    MO.mixer = {
        stationGroup,
        mixerFillMat,
        mixerFill,
        mixerStirHitbox,
        hoeGroup,
        mixerBarGroup,
        mixerBarFill,
        tarpMesh,
        bucketObj: null,
        bucketConcreteFill: null
    };

    MO.resetBucketRef = function() {
        MO.mixer.bucketObj = null;
        MO.mixer.bucketConcreteFill = null;
    };

    MO.placeMixerStationOnTerrain = function() {
        const y = MO.getTerrainHeight(MO.STATION_MIXER.x, MO.STATION_MIXER.z);
        stationGroup.position.set(MO.STATION_MIXER.x, y, MO.STATION_MIXER.z);
        if (MO.state && MO.state.unifiedVillage && MO.state.villageInfra) {
            stationGroup.visible = Boolean(MO.state.villageInfra.mixerBuilt);
        } else {
            stationGroup.visible = true;
        }
    };

    MO.setMixerBuilt = function(built) {
        if (MO.state && MO.state.villageInfra) {
            MO.state.villageInfra.mixerBuilt = Boolean(built);
        }
        stationGroup.visible = Boolean(built);
    };

    function createPhysicalSupply(type, x, y, z) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        let mesh;
        if (type === 'sand') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.34), new THREE.MeshStandardMaterial({ map: MO.createNoiseTexture('#cfa05b', 25), roughness: 0.92 }));
            mesh.position.y = 0.1;
        } else if (type === 'cement') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.36), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 }));
            mesh.position.y = 0.1;
        } else if (type === 'water') {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 14), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35 }));
            mesh.position.y = 0.2;
        } else if (type === 'bucket') {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.32, 14), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
            mesh.position.y = 0.16;
            const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.05, 14), MO.mats.concrete);
            fill.position.y = 0.3;
            fill.visible = false;
            g.add(fill);
            MO.mixer.bucketConcreteFill = fill;
        }
        mesh.castShadow = true; mesh.receiveShadow = true;
        g.add(mesh);

        const item = { type, mesh: g, vy: 0, grounded: false, consumed: false, res: false };
        g.traverse(c => c.userData.physicalSupply = item);
        MO.groups.physicsSupplies.add(g);
        MO.state.draggableSupplies.push(item);
        if (type === 'bucket') MO.mixer.bucketObj = item;
        return item;
    }

    MO.restockSupplies = function(quiet) {
        const state = MO.state;
        state.draggableSupplies = state.draggableSupplies.filter(s => {
            if (s.type === 'bucket') return true;
            MO.resources.removeAndDispose(MO.groups.physicsSupplies, s.mesh);
            return false;
        });
        const ix = MO.STATION_MIXER.x, iz = MO.STATION_MIXER.z;
        const baseY = MO.getTerrainHeight(ix - 1.15, iz);
        for (let i = 0; i < 6; i++) {
            createPhysicalSupply('sand', ix - 1.15 - (i >= 3 ? 0.45 : 0), baseY + 0.7 + (i % 3) * 0.32, iz - 0.45);
        }
        createPhysicalSupply('cement', ix - 1.15, baseY + 0.8, iz + 0.18);
        createPhysicalSupply('cement', ix - 1.15, baseY + 1.12, iz + 0.18);
        createPhysicalSupply('water', ix - 1.15, baseY + 0.85, iz + 0.72);
        createPhysicalSupply('water', ix - 1.55, baseY + 0.85, iz + 0.72);
        if (!MO.mixer.bucketObj) {
            createPhysicalSupply('bucket', ix + 0.95, MO.getTerrainHeight(ix + 0.95, iz + 0.6) + 0.6, iz + 0.6);
        }
        if (!quiet) {
            MO.showToast('Insumos entregues na masseira! Arraste ou clique neles para jogar na caixa.', '🚚');
        }
    };

    MO.addIngredient = function(type) {
        const state = MO.state;
        if (state.mortarCharges > 0) {
            MO.showToast('Masseira cheia! Arraste ou clique no Balde para abastecer.', '🪣');
            return false;
        }
        if (type === 'sand' && state.sand < 3) state.sand++;
        else if (type === 'cement' && state.cement < 1) state.cement++;
        else if (type === 'water' && state.water < 1) state.water++;
        else return false;

        state.mixProgress = 0;
        MO.updateMixerVisuals();
        MO.SoundFX.playMortarSquish();
        return true;
    };

    MO.updateMixerVisuals = function() {
        const state = MO.state;
        const total = state.sand + state.cement + state.water;
        if (total === 0 && state.mortarCharges === 0) {
            mixerFill.visible = false;
        } else {
            mixerFill.visible = true;
            const ratio = state.mortarCharges > 0 ? (state.mortarCharges / 12) : (total / 5);
            mixerFill.scale.y = Math.max(0.16, ratio);
            mixerFill.position.y = 0.08 + (0.25 * mixerFill.scale.y) / 2;
            if (state.mortarCharges === 0) {
                mixerFillMat.color.setHex(state.water > 0 ? 0x8d8272 : (state.cement > 0 ? 0xa89b84 : 0xc99a56));
            }
        }
        const elS = document.getElementById('cnt-sand');
        const elC = document.getElementById('cnt-cement');
        const elW = document.getElementById('cnt-water');
        const elM = document.getElementById('cnt-mix');
        if (elS) elS.textContent = `${state.sand}/3`;
        if (elC) elC.textContent = `${state.cement}/1`;
        if (elW) elW.textContent = `${state.water}/1`;
        if (elM) elM.textContent = `${Math.round(state.mixProgress)}%`;
        MO.updateBucketUI();
    };

    MO.fillBucketFromMixer = function() {
        const state = MO.state;
        if (state.mortarCharges <= 0) {
            MO.showToast('Bata massa na masseira primeiro (3 Areia, 1 Cimento, 1 Água)!', '⚠️');
            return;
        }
        if (state.bucketCharges >= 4) return;
        const tr = Math.min(4 - state.bucketCharges, state.mortarCharges);
        state.bucketCharges += tr;
        state.mortarCharges -= tr;
        MO.updateMixerVisuals();
        MO.SoundFX.playMortarSquish();
        MO.showToast(`Balde abastecido (${state.bucketCharges.toFixed(0)}/4 cargas)!`, '🪣');
    };

    MO.updateBucketUI = function() {
        if (MO.mixer.bucketConcreteFill) {
            MO.mixer.bucketConcreteFill.visible = MO.state.bucketCharges > 0;
        }
        const txt = `🪣 ${MO.state.bucketCharges.toFixed(1).replace('.0', '')}/4`;
        const b2 = document.getElementById('bucket-pill-2');
        const b3 = document.getElementById('bucket-pill-3');
        if (b2) b2.textContent = txt;
        if (b3) b3.textContent = txt;
    };
})(window.MO = window.MO || {});

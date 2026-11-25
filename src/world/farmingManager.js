// =========================================================================
// WORLD: FARMING MANAGER — LAVOURA CONTÍGUA ENCAIXADA (12 BLOCOS),
// 5 CULTURAS, POÇO D'ÁGUA, TRIAGEM & CELEIRO COM SILO PEÇA POR PEÇA
// =========================================================================
(function(MO) {
    const TILE_SIZE = 1.65;
    const MAX_DISPLAY_CRATES = 12;
    const HIGHWAY_EXPORT_MULT = 1.35;

    const FIELD_GRID_ORDER = [
        [1, 1], [2, 1], [1, 0], [2, 0],
        [1, 2], [2, 2], [0, 1], [3, 1],
        [0, 0], [3, 0], [0, 2], [3, 2]
    ];

    const CROP_CATALOG = {
        wheat:     { name: 'Trigo Dourado', icon: '🌾', color: 0xeab308, accent: 0xca8a04, growSpeed: 0.022, value: 10, foodGrant: 3 },
        corn:      { name: 'Milho',         icon: '🌽', color: 0xfacc15, accent: 0x4d7c0f, growSpeed: 0.019, value: 13, foodGrant: 4 },
        pumpkin:   { name: 'Abóbora',       icon: '🎃', color: 0xea580c, accent: 0x15803d, growSpeed: 0.015, value: 18, foodGrant: 5 },
        carrot:    { name: 'Cenoura',       icon: '🥕', color: 0xf97316, accent: 0x16a34a, growSpeed: 0.026, value: 9,  foodGrant: 3 },
        sunflower: { name: 'Girassol',      icon: '🌻', color: 0xfbbf24, accent: 0x451a03, growSpeed: 0.018, value: 15, foodGrant: 2 }
    };
    const CROP_KEYS = Object.keys(CROP_CATALOG);

    let farmingGroup = null;
    let plotsGroup = null;
    let bundlesGroup = null;
    let wellRoot = null;
    let benchRoot = null;
    let barnRoot = null;
    let sharedAssets = null;

    const agState = {
        autoMode: true,
        cropPool: ['wheat', 'corn', 'pumpkin'],
        fieldOrigin: null,   // { x, z }
        plots: [],           // overgrown -> cleared -> tilled -> seeded -> growing -> ripe
        harvestBundles: [],  // cestos colhidos no chão com gravidade
        animatingPieces: [], // animação de encaixe do Poço, Triagem e Celeiro
        totalSoldCrates: 0,
        totalSalesCoins: 0,
        well: {
            placed: false, x: 0, z: 0, builtProgress: 0, built: false,
            buildQueue: [], stakes: null
        },
        bench: {
            placed: false, x: 0, z: 0, builtProgress: 0, built: false, busyWorkerId: null,
            buildQueue: [], stakes: null, rawBasketMesh: null, packedCrateMesh: null,
            progressBarBg: null, progressBarFill: null
        },
        barn: {
            placed: false, x: 0, z: 0, builtProgress: 0, completed: false,
            buildQueue: [], displaySlots: [], displayedCrates: [],
            stakes: null, lanternLight: null, lanternBulbMat: null
        }
    };

    function createBarnSignTexture() {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = 512; c.height = 128;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#3f1d14';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, 496, 112);
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 40px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FEIRA & CELEIRO', 256, 66);
        return new THREE.CanvasTexture(c);
    }

    function getSharedAssets() {
        if (sharedAssets) return sharedAssets;
        const signTex = createBarnSignTexture();
        sharedAssets = {
            matSoilDry: new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.96 }),
            matSoilWet: new THREE.MeshStandardMaterial({ color: 0x3b2818, roughness: 0.68 }),
            matTimber: new THREE.MeshStandardMaterial({ color: 0x694528, roughness: 0.84 }),
            matPlankLight: new THREE.MeshStandardMaterial({ color: 0xba8a56, roughness: 0.76 }),
            matBarnRed: new THREE.MeshStandardMaterial({ color: 0x7c2d23, roughness: 0.80 }),
            matRoofSlate: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.25 }),
            matStone: new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.92, flatShading: true }),
            matSteel: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.80, roughness: 0.30 }),
            matWater: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.18, metalness: 0.25 }),
            matPitDark: new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 1.0 }),
            matWeed: new THREE.MeshStandardMaterial({ color: 0x3f5e24, roughness: 0.92, flatShading: true }),
            matLeaf: new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.85 }),
            matSeed: new THREE.MeshBasicMaterial({ color: 0xfde68a }),
            matSign: new THREE.MeshStandardMaterial({ map: signTex || null, color: 0x451a03, roughness: 0.62 }),
            matStakeCyan: new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.65 }),
            matStakeAmber: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
            matStakeBlue: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.65 }),
            matInvisible: new THREE.MeshBasicMaterial({ visible: false }),
            cropMats: {},
            cropAccentMats: {},
            stakeGeo: new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6),
            basketGeo: new THREE.CylinderGeometry(0.19, 0.14, 0.22, 8),
            produceSphereGeo: new THREE.SphereGeometry(0.065, 6, 5),
            crateBoxGeo: new THREE.BoxGeometry(0.36, 0.16, 0.28),
            seedGeo: new THREE.SphereGeometry(0.032, 5, 4),
            signTex
        };
        CROP_KEYS.forEach(k => {
            sharedAssets.cropMats[k] = new THREE.MeshStandardMaterial({ color: CROP_CATALOG[k].color, roughness: 0.68 });
            sharedAssets.cropAccentMats[k] = new THREE.MeshStandardMaterial({ color: CROP_CATALOG[k].accent, roughness: 0.80 });
        });

        if (MO.resources) {
            const list = [];
            Object.values(sharedAssets).forEach(v => {
                if (v && (v.isMaterial || v.isBufferGeometry || v.isTexture)) list.push(v);
                else if (v && typeof v === 'object') Object.values(v).forEach(x => { if (x) list.push(x); });
            });
            MO.resources.protect(...list);
        }
        return sharedAssets;
    }

    function ensureGroups() {
        if (!MO.scene) return;
        if (!farmingGroup) {
            farmingGroup = new THREE.Group();
            farmingGroup.name = 'farming';
            plotsGroup = new THREE.Group();
            bundlesGroup = new THREE.Group();
            wellRoot = new THREE.Group();
            benchRoot = new THREE.Group();
            barnRoot = new THREE.Group();
            farmingGroup.add(plotsGroup, bundlesGroup, wellRoot, benchRoot, barnRoot);
            MO.scene.add(farmingGroup);
        }
    }

    function getGroundY(x, z) {
        if (MO.getTerrainHeight) return MO.getTerrainHeight(x, z);
        if (MO.chunkManager && MO.chunkManager.getHeightAt) return MO.chunkManager.getHeightAt(x, z);
        return MO.PLATEAU_Y || 0.28;
    }

    function createStakeOutline(w, d, mat) {
        const A = getSharedAssets();
        const g = new THREE.Group();
        [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].forEach(([sx, sz]) => {
            const st = new THREE.Mesh(A.stakeGeo, mat);
            st.position.set(sx, 0.19, sz);
            g.add(st);
        });
        const rN = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.025), mat);
        rN.position.set(0, 0.25, -d / 2);
        const rS = rN.clone(); rS.position.z = d / 2;
        const rW = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, d), mat);
        rW.position.set(-w / 2, 0.25, 0);
        const rE = rW.clone(); rE.position.x = w / 2;
        g.add(rN, rS, rW, rE);
        return g;
    }

    function initCropPool(seed) {
        const s = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 4280;
        const picked = [];
        for (let i = 0; i < 3; i++) {
            const key = CROP_KEYS[(s + i * 2) % CROP_KEYS.length];
            if (!picked.includes(key)) picked.push(key);
        }
        agState.cropPool = picked.length >= 2 ? picked : ['wheat', 'corn', 'pumpkin'];
    }

    function pickCropForPlot(index = 0) {
        const pool = agState.cropPool && agState.cropPool.length > 0 ? agState.cropPool : CROP_KEYS;
        return pool[Math.abs(index) % pool.length];
    }

    // =========================================================================
    // 1. LAVOURA CONTÍGUA ENCAIXADA (ATÉ 12 BLOCOS) & 5 CULTURAS 3D
    // =========================================================================
    function createCropVisualGroup(cropKey) {
        const A = getSharedAssets();
        const g = new THREE.Group();
        const matMain = A.cropMats[cropKey] || A.cropMats.wheat;
        const matAcc = A.cropAccentMats[cropKey] || A.cropAccentMats.wheat;

        for (let r = -1; r <= 1; r++) {
            for (let c = -1; c <= 1; c++) {
                const plant = new THREE.Group();
                plant.position.set(c * 0.48, 0, r * 0.48);

                if (cropKey === 'wheat') {
                    for (let s = 0; s < 2; s++) {
                        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.72, 5), matMain);
                        stalk.position.set((s - 0.5) * 0.08, 0.36, 0);
                        stalk.rotation.z = (s - 0.5) * 0.14;
                        stalk.castShadow = true;
                        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.17, 0.05), matAcc);
                        ear.position.set((s - 0.5) * 0.10, 0.72, 0);
                        plant.add(stalk, ear);
                    }
                } else if (cropKey === 'corn') {
                    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.038, 0.96, 6), matAcc);
                    stalk.position.y = 0.48; stalk.castShadow = true;
                    const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.24, 6), matMain);
                    cob.position.set(0.07, 0.55, 0); cob.rotation.z = -0.35;
                    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.08), A.matLeaf);
                    leaf.position.set(-0.11, 0.42, 0); leaf.rotation.z = 0.35;
                    plant.add(stalk, cob, leaf);
                } else if (cropKey === 'pumpkin') {
                    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), matMain);
                    body.scale.set(1.18, 0.78, 1.18);
                    body.position.y = 0.14; body.castShadow = true;
                    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.10, 5), matAcc);
                    stem.position.y = 0.27;
                    plant.add(body, stem);
                } else if (cropKey === 'carrot') {
                    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.14, 6), matMain);
                    tip.rotation.x = Math.PI; tip.position.y = 0.06;
                    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.28, 5), matAcc);
                    frond.position.y = 0.20;
                    plant.add(tip, frond);
                } else {
                    // Girassol
                    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.88, 6), A.matLeaf);
                    stem.position.y = 0.44; stem.castShadow = true;
                    const petals = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 8), matMain);
                    petals.rotation.x = Math.PI / 2 - 0.25; petals.position.set(0, 0.88, 0.03);
                    const center = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 7), matAcc);
                    center.rotation.x = Math.PI / 2 - 0.25; center.position.set(0, 0.88, 0.045);
                    plant.add(stem, petals, center);
                }
                plant.rotation.y = (r * 3 + c) * 0.9;
                g.add(plant);
            }
        }
        return g;
    }

    function createFarmPlot(x, z, cropKey = 'wheat', opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const y = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        const root = new THREE.Group();
        root.position.set(x, y, z);

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 1.35);
            MO.chunkManager.paintLevelArea(x, z, 1.35, 0.88, MO.PLATEAU_Y);
        }

        const soilPlane = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE + 0.02, 0.08, TILE_SIZE + 0.02), A.matSoilDry);
        soilPlane.position.y = 0.035;
        soilPlane.receiveShadow = true;
        soilPlane.visible = false;
        root.add(soilPlane);

        // 1. Mato natural inicial ('overgrown')
        const weedsGroup = new THREE.Group();
        for (let i = 0; i < 8; i++) {
            const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.11 + (i % 2) * 0.03, 0.30, 5), A.matWeed);
            tuft.position.set(-0.52 + (i % 4) * 0.35, 0.16, -0.35 + Math.floor(i / 4) * 0.70);
            tuft.castShadow = true;
            weedsGroup.add(tuft);
        }
        root.add(weedsGroup);

        // 2. Sulcos contínuos arados ('tilled')
        const furrowsGroup = new THREE.Group();
        for (let r = -1; r <= 1; r++) {
            const ridge = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE + 0.01, 0.075, 0.28), A.matSoilDry);
            ridge.position.set(0, 0.09, r * 0.48);
            ridge.receiveShadow = true;
            furrowsGroup.add(ridge);
        }
        furrowsGroup.visible = false;
        root.add(furrowsGroup);

        // 3. Sementes visíveis ('seeded')
        const seedsGroup = new THREE.Group();
        for (let r = -1; r <= 1; r++) {
            for (let c = -1; c <= 1; c++) {
                const sd = new THREE.Mesh(A.seedGeo, A.matSeed);
                sd.position.set(c * 0.48, 0.135, r * 0.48);
                seedsGroup.add(sd);
            }
        }
        seedsGroup.visible = false;
        root.add(seedsGroup);

        // 4. Plantação 3D ('growing' -> 'ripe')
        const cropGroup = createCropVisualGroup(cropKey);
        cropGroup.position.y = 0.07;
        cropGroup.scale.setScalar(0.01);
        cropGroup.visible = false;
        root.add(cropGroup);

        // Moldura luminosa sutil quando madura
        const ripeRingMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.24, side: THREE.DoubleSide });
        const ripeRing = new THREE.Mesh(new THREE.PlaneGeometry(TILE_SIZE * 0.94, TILE_SIZE * 0.94), ripeRingMat);
        ripeRing.rotation.x = -Math.PI / 2;
        ripeRing.position.y = 0.085;
        ripeRing.visible = false;
        root.add(ripeRing);

        const hit = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, 0.85, TILE_SIZE), A.matInvisible);
        hit.position.y = 0.42;
        root.add(hit);

        const plotObj = {
            id: `fplot-${agState.plots.length}`,
            x, y, z, cropKey,
            root, soilPlane, weedsGroup, furrowsGroup, seedsGroup, cropGroup, ripeRing, ripeRingMat,
            status: opts.status || 'overgrown',
            growth: opts.growth || 0,
            res: false
        };

        applyPlotVisualState(plotObj);
        root.traverse(c => { if (c && c.userData) c.userData.farmPlotRef = plotObj; });
        plotsGroup.add(root);
        agState.plots.push(plotObj);
        return plotObj;
    }

    function applyPlotVisualState(plot) {
        const A = getSharedAssets();
        const st = plot.status;
        plot.weedsGroup.visible = (st === 'overgrown');
        plot.soilPlane.visible = (st !== 'overgrown');
        plot.furrowsGroup.visible = (st === 'tilled' || st === 'seeded' || st === 'growing' || st === 'ripe');
        plot.seedsGroup.visible = (st === 'seeded');
        plot.cropGroup.visible = (st === 'growing' || st === 'ripe');
        plot.ripeRing.visible = (st === 'ripe');
        const wet = (st === 'growing' || st === 'ripe');
        plot.soilPlane.material = wet ? A.matSoilWet : A.matSoilDry;
        plot.furrowsGroup.children.forEach(r => { r.material = wet ? A.matSoilWet : A.matSoilDry; });
        if (plot.cropGroup.visible) {
            plot.cropGroup.scale.setScalar(Math.max(0.08, st === 'ripe' ? 1.0 : (0.08 + plot.growth * 0.92)));
        }
    }

    function expandContiguousField(originPt = null, opts = {}) {
        ensureGroups();
        if (!agState.fieldOrigin) {
            const ox = originPt ? originPt.x : 7.5;
            const oz = originPt ? originPt.z : -1.5;
            agState.fieldOrigin = { x: ox, z: oz };
        }
        const idx = agState.plots.length;
        if (idx >= FIELD_GRID_ORDER.length) {
            if (!opts.silent && MO.showToast) MO.showToast('🌾 Lavoura completa (12/12 blocos encaixados)!', '🌾');
            return null;
        }
        const [gx, gz] = FIELD_GRID_ORDER[idx];
        const px = agState.fieldOrigin.x + (gx - 1.5) * TILE_SIZE;
        const pz = agState.fieldOrigin.z + (gz - 1.0) * TILE_SIZE;
        const cropKey = opts.cropKey || pickCropForPlot(idx);
        const plot = createFarmPlot(px, pz, cropKey, opts);

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playHoeTill) MO.SoundFX.playHoeTill();
            if (MO.spawnBurst) MO.spawnBurst(px, getGroundY(px, pz) + 0.18, pz, 0x4ade80, 8, 0.07);
            if (MO.showToast) {
                const info = CROP_CATALOG[cropKey];
                MO.showToast(`🌱 Bloco #${idx + 1}/12 da lavoura aberto (${info.icon} ${info.name})!`, info.icon);
            }
            if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        }
        syncFarmingUI();
        return plot;
    }

    function spawnHarvestBundle(plot) {
        ensureGroups();
        const A = getSharedAssets();
        const bx = plot.x + (Math.random() - 0.5) * 0.42;
        const bz = plot.z + 0.55;
        const by = getGroundY(bx, bz) + 0.42;

        const grp = new THREE.Group();
        const basket = new THREE.Mesh(A.basketGeo, A.matPlankLight);
        basket.castShadow = true;
        const topProduce = new THREE.Mesh(A.produceSphereGeo, A.cropMats[plot.cropKey] || A.cropMats.wheat);
        topProduce.scale.set(2.4, 1.4, 2.4);
        topProduce.position.y = 0.11;
        grp.add(basket, topProduce);
        grp.position.set(bx, by, bz);

        const bundle = {
            id: `fbundle-${Date.now()}-${Math.floor(Math.random() * 999)}`,
            x: bx, z: bz,
            cropKey: plot.cropKey,
            vy: 0.04,
            grounded: false,
            picked: false,
            res: false,
            mesh: grp
        };
        grp.traverse(c => { if (c && c.userData) c.userData.farmBundleRef = bundle; });
        bundlesGroup.add(grp);
        agState.harvestBundles.push(bundle);
        return bundle;
    }

    function consumeHarvestBundle(bundle) {
        if (!bundle || bundle.picked) return false;
        bundle.picked = true;
        bundle.res = false;
        if (bundlesGroup && bundle.mesh) {
            if (MO.resources) MO.resources.removeAndDispose(bundlesGroup, bundle.mesh);
            else bundlesGroup.remove(bundle.mesh);
        }
        return true;
    }

    function advancePlotStage(plot, worker = null) {
        if (!plot) return null;
        plot.res = false;
        const info = CROP_CATALOG[plot.cropKey] || CROP_CATALOG.wheat;

        if (plot.status === 'overgrown') {
            plot.status = 'cleared';
            applyPlotVisualState(plot);
            if (MO.SoundFX && MO.SoundFX.playHoeTill) MO.SoundFX.playHoeTill();
            if (MO.spawnBurst) MO.spawnBurst(plot.x, plot.y + 0.2, plot.z, 0x4d7c0f, 10, 0.08);
            return 'cleared';
        }
        if (plot.status === 'cleared') {
            plot.status = 'tilled';
            applyPlotVisualState(plot);
            if (MO.SoundFX && MO.SoundFX.playHoeTill) MO.SoundFX.playHoeTill();
            if (MO.spawnBurst) MO.spawnBurst(plot.x, plot.y + 0.18, plot.z, 0x6b4f35, 10, 0.08);
            return 'tilled';
        }
        if (plot.status === 'tilled') {
            plot.status = 'seeded';
            applyPlotVisualState(plot);
            if (MO.SoundFX && MO.SoundFX.playPackCrate) MO.SoundFX.playPackCrate();
            if (MO.spawnBurst) MO.spawnBurst(plot.x, plot.y + 0.22, plot.z, 0xfde68a, 9, 0.07);
            return 'seeded';
        }
        if (plot.status === 'seeded') {
            plot.status = 'growing';
            plot.growth = 0.08;
            applyPlotVisualState(plot);
            if (MO.SoundFX && MO.SoundFX.playWaterPour) MO.SoundFX.playWaterPour();
            if (MO.spawnBurst) MO.spawnBurst(plot.x, plot.y + 0.30, plot.z, 0x38bdf8, 8, 0.06);
            return 'growing';
        }
        if (plot.status === 'ripe') {
            if (MO.SoundFX && MO.SoundFX.playSickleCut) MO.SoundFX.playSickleCut();
            if (MO.spawnBurst) MO.spawnBurst(plot.x, plot.y + 0.35, plot.z, info.color, 14, 0.10);
            spawnHarvestBundle(plot);

            // Abastece imediatamente a comida da cidade
            if (MO.cityManager && MO.cityManager.addResources) {
                MO.cityManager.addResources({ food: info.foodGrant });
            }
            if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) {
                MO.workerFactory.awardWorkerExperience(worker, 6, 2);
            }

            // Reseta bloco para próximo ciclo com nova cultura da rotação
            const nextKey = pickCropForPlot(agState.plots.indexOf(plot) + Math.floor(Math.random() * 3) + 1);
            plot.cropKey = nextKey;
            plot.status = 'tilled';
            plot.growth = 0;
            if (plot.cropGroup) {
                if (MO.resources) MO.resources.removeAndDispose(plot.root, plot.cropGroup);
                else plot.root.remove(plot.cropGroup);
            }
            plot.cropGroup = createCropVisualGroup(nextKey);
            plot.cropGroup.position.y = 0.07;
            plot.cropGroup.traverse(c => { if (c && c.userData) c.userData.farmPlotRef = plot; });
            plot.root.add(plot.cropGroup);
            applyPlotVisualState(plot);
            return 'harvested';
        }
        return plot.status;
    }

    // =========================================================================
    // 2. POÇO D'ÁGUA (3 ETAPAS), TRIAGEM (3 PEÇAS) & CELEIRO COM SILO (14 PEÇAS)
    // =========================================================================
    function placeWell(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const wl = agState.well;

        if (MO.resources) MO.resources.clearGroup(wellRoot);
        else while (wellRoot.children.length > 0) wellRoot.remove(wellRoot.children[0]);

        wl.placed = true;
        wl.x = x;
        wl.z = z;
        wl.builtProgress = 0;
        wl.built = false;
        wl.buildQueue = [];

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 1.8);
            MO.chunkManager.paintLevelArea(x, z, 1.8, 0.90, MO.PLATEAU_Y);
        }

        const wy = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        wellRoot.position.set(x, wy, z);
        wellRoot.userData = { farmWell: true };

        wl.stakes = createStakeOutline(1.65, 1.65, A.matStakeCyan);
        wellRoot.add(wl.stakes);

        function addWellPiece(name, mesh) {
            mesh.visible = false;
            mesh.traverse(c => { if (c && c.userData) c.userData.farmWell = true; });
            wellRoot.add(mesh);
            wl.buildQueue.push({ name, mesh, targetY: mesh.position.y, built: false });
        }

        // 1: Escavação e Alicerce de Pedra
        const p1 = new THREE.Group();
        const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 12), A.matPitDark);
        pit.position.y = 0.04;
        const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.80, 0.26, 10), A.matStone);
        baseRing.position.y = 0.13; baseRing.castShadow = true;
        p1.add(pit, baseRing);
        addWellPiece('Escavação e Alicerce', p1);

        // 2: Mureta de Pedra e Espelho d'Água
        const p2 = new THREE.Group();
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.42, 10), A.matStone);
        wall.position.y = 0.44; wall.castShadow = true;
        const water = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.60, 0.04, 10), A.matWater);
        water.position.y = 0.64;
        p2.add(wall, water);
        addWellPiece('Mureta de Pedra e Água', p2);

        // 3: Cobertura e Sarilho de Madeira
        const p3 = new THREE.Group();
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), A.matTimber); postL.position.set(-0.62, 0.98, 0);
        const postR = postL.clone(); postR.position.x = 0.62;
        const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.24, 7), A.matPlankLight);
        crank.rotation.z = Math.PI / 2; crank.position.y = 1.12;
        const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.56), A.matRoofSlate);
        roofL.position.set(0, 1.62, -0.22); roofL.rotation.x = -0.45; roofL.castShadow = true;
        const roofR = roofL.clone(); roofR.position.z = 0.22; roofR.rotation.x = 0.45;
        p3.add(postL, postR, crank, roofL, roofR);
        addWellPiece('Cobertura e Sarilho', p3);

        const preBuilt = opts.instantBuilt ? wl.buildQueue.length : Math.min(wl.buildQueue.length, opts.builtProgress || 0);
        for (let i = 0; i < preBuilt; i++) { wl.buildQueue[i].built = true; wl.buildQueue[i].mesh.visible = true; }
        wl.builtProgress = preBuilt;
        if (wl.builtProgress >= wl.buildQueue.length) {
            wl.built = true;
            if (wl.stakes) wl.stakes.visible = false;
        }

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            if (MO.spawnBurst) MO.spawnBurst(x, wy + 0.3, z, 0x38bdf8, 12, 0.08);
            if (MO.showToast) MO.showToast('🪣 Poço d\'Água demarcado! Agricultores vão escavá-lo em 3 etapas.', '🪣');
        }
        syncFarmingUI();
        return wl;
    }

    function getNextWellPiece() {
        if (!agState.well.placed || agState.well.built) return null;
        return agState.well.buildQueue.find(p => !p.built) || null;
    }

    function installNextWellPiece(worker = null) {
        const wl = agState.well;
        const piece = getNextWellPiece();
        if (!piece) return null;

        piece.built = true;
        piece.mesh.visible = true;
        wl.builtProgress++;
        agState.animatingPieces.push({ piece, progress: 0 });
        if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
        if (MO.spawnBurst) MO.spawnBurst(wl.x, getGroundY(wl.x, wl.z) + 0.6, wl.z, 0x38bdf8, 10, 0.08);
        if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(worker, 5, 2);

        if (wl.builtProgress >= wl.buildQueue.length) {
            wl.built = true;
            if (wl.stakes) wl.stakes.visible = false;
            if (MO.SoundFX && MO.SoundFX.playWaterPour) MO.SoundFX.playWaterPour();
            if (MO.economyManager && MO.economyManager.logJournal) {
                MO.economyManager.logJournal('💧', 'Poço d\'Água inaugurado', 'Irrigação rápida garantida para a lavoura');
            }
            if (MO.showToast) MO.showToast('💧 Poço d\'Água concluído! Agricultores podem irrigar a lavoura.', '💧');
        } else if (MO.showToast) {
            MO.showToast(`🪣 Poço: ${piece.name} (${wl.builtProgress}/${wl.buildQueue.length})`, '🪣');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncFarmingUI();
        return piece;
    }

    function placeBench(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const bn = agState.bench;

        if (MO.resources) MO.resources.clearGroup(benchRoot);
        else while (benchRoot.children.length > 0) benchRoot.remove(benchRoot.children[0]);

        bn.placed = true;
        bn.x = x;
        bn.z = z;
        bn.builtProgress = 0;
        bn.built = false;
        bn.busyWorkerId = null;
        bn.buildQueue = [];

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 2.0);
            MO.chunkManager.paintLevelArea(x, z, 2.0, 0.90, MO.PLATEAU_Y);
        }

        const by = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        benchRoot.position.set(x, by, z);
        benchRoot.rotation.y = 0.20;
        benchRoot.userData = { farmBench: true };

        bn.stakes = createStakeOutline(1.85, 1.05, A.matStakeAmber);
        benchRoot.add(bn.stakes);

        function addBenchPiece(name, mesh) {
            mesh.visible = false;
            mesh.traverse(c => { if (c && c.userData) c.userData.farmBench = true; });
            benchRoot.add(mesh);
            bn.buildQueue.push({ name, mesh, targetY: mesh.position.y, built: false });
        }

        // 1: Cavaletes
        const legs = new THREE.Group();
        [[-0.76, -0.38], [0.76, -0.38], [-0.76, 0.38], [0.76, 0.38]].forEach(([lx, lz]) => {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.78, 0.11), A.matTimber);
            p.position.set(lx, 0.39, lz); p.castShadow = true;
            legs.add(p);
        });
        addBenchPiece('Cavaletes da Triagem', legs);

        // 2: Prateleira de Caixotes
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.74), A.matPlankLight);
        shelf.position.set(0, 0.25, 0); shelf.castShadow = true;
        addBenchPiece('Prateleira de Caixotes', shelf);

        // 3: Tampo de Triagem e Balança
        const topGrp = new THREE.Group();
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.09, 0.96), A.matPlankLight);
        table.position.set(0, 0.80, 0); table.castShadow = true;
        const rimBack = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 0.05), A.matTimber);
        rimBack.position.set(0, 0.89, -0.45);
        const scaleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 8), A.matSteel);
        scaleBase.position.set(0.64, 0.90, 0.12);
        topGrp.add(table, rimBack, scaleBase);
        addBenchPiece('Tampo de Triagem e Balança', topGrp);

        // Cesto + Caixote + Barra 3D
        bn.rawBasketMesh = new THREE.Mesh(A.basketGeo, A.matPlankLight);
        bn.rawBasketMesh.position.set(-0.15, 0.96, 0.05);
        bn.rawBasketMesh.visible = false;
        bn.packedCrateMesh = new THREE.Mesh(A.crateBoxGeo, A.matPlankLight);
        bn.packedCrateMesh.position.set(0.15, 0.96, 0.05);
        bn.packedCrateMesh.visible = false;
        bn.progressBarBg = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.10, 0.03), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
        bn.progressBarBg.position.set(0, 1.48, 0);
        bn.progressBarBg.visible = false;
        bn.progressBarFill = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
        bn.progressBarFill.position.set(0, 1.48, 0.01);
        bn.progressBarFill.visible = false;
        benchRoot.add(bn.rawBasketMesh, bn.packedCrateMesh, bn.progressBarBg, bn.progressBarFill);

        const preBuilt = opts.instantBuilt ? bn.buildQueue.length : Math.min(bn.buildQueue.length, opts.builtProgress || 0);
        for (let i = 0; i < preBuilt; i++) { bn.buildQueue[i].built = true; bn.buildQueue[i].mesh.visible = true; }
        bn.builtProgress = preBuilt;
        if (bn.builtProgress >= bn.buildQueue.length) {
            bn.built = true;
            if (bn.stakes) bn.stakes.visible = false;
        }

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            if (MO.spawnBurst) MO.spawnBurst(x, by + 0.3, z, 0xf59e0b, 12, 0.08);
            if (MO.showToast) MO.showToast('🧺 Bancada de Triagem marcada! Traga 3 colheitas para montá-la.', '📐');
        }
        syncFarmingUI();
        return bn;
    }

    function getNextBenchPiece() {
        if (!agState.bench.placed || agState.bench.built) return null;
        return agState.bench.buildQueue.find(p => !p.built) || null;
    }

    function installNextBenchPiece(worker = null) {
        const bn = agState.bench;
        const piece = getNextBenchPiece();
        if (!piece) return null;

        piece.built = true;
        piece.mesh.visible = true;
        bn.builtProgress++;
        agState.animatingPieces.push({ piece, progress: 0 });
        if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
        if (MO.spawnBurst) MO.spawnBurst(bn.x, getGroundY(bn.x, bn.z) + 0.7, bn.z, 0xf59e0b, 10, 0.08);
        if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(worker, 5, 2);

        if (bn.builtProgress >= bn.buildQueue.length) {
            bn.built = true;
            if (bn.stakes) bn.stakes.visible = false;
            if (MO.showToast) MO.showToast('🧺 Bancada de Triagem pronta! Colheitas serão embaladas em caixotes.', '🧺');
        } else if (MO.showToast) {
            MO.showToast(`🧺 Triagem: ${piece.name} (${bn.builtProgress}/${bn.buildQueue.length})`, '🔨');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncFarmingUI();
        return piece;
    }

    function animateBench(active, progress = null) {
        const bn = agState.bench;
        if (!bn.placed) return;
        if (bn.rawBasketMesh) bn.rawBasketMesh.visible = Boolean(active);
        if (bn.progressBarBg && bn.progressBarFill) {
            const show = Boolean(active && typeof progress === 'number');
            bn.progressBarBg.visible = show;
            bn.progressBarFill.visible = show;
            if (show) {
                const p = Math.max(0.02, Math.min(1, progress));
                bn.progressBarFill.scale.x = p;
                bn.progressBarFill.position.x = -0.48 * (1 - p);
                if (MO.camera && bn.progressBarBg.lookAt) {
                    bn.progressBarBg.lookAt(MO.camera.position);
                    bn.progressBarFill.lookAt(MO.camera.position);
                }
            }
        }
    }

    function placeBarn(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const br = agState.barn;

        if (MO.resources) MO.resources.clearGroup(barnRoot);
        else while (barnRoot.children.length > 0) barnRoot.remove(barnRoot.children[0]);

        br.placed = true;
        br.x = x;
        br.z = z;
        br.builtProgress = 0;
        br.completed = false;
        br.buildQueue = [];
        br.displaySlots = [];
        br.displayedCrates = [];
        br.lanternLight = null;
        br.lanternBulbMat = null;

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 3.4);
            MO.chunkManager.paintLevelArea(x, z, 3.2, 0.92, MO.PLATEAU_Y);
        }

        const by = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        barnRoot.position.set(x, by, z);
        barnRoot.rotation.y = -0.35;
        barnRoot.userData = { farmBarn: true };

        br.stakes = createStakeOutline(4.3, 3.3, A.matStakeBlue);
        barnRoot.add(br.stakes);

        function addBarnPiece(name, mesh, lx, ly, lz) {
            mesh.position.set(lx, ly, lz);
            mesh.traverse(c => {
                if (c && c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
                if (c && c.userData) c.userData.farmBarn = true;
            });
            mesh.visible = false;
            barnRoot.add(mesh);

            const cosR = Math.cos(barnRoot.rotation.y);
            const sinR = Math.sin(barnRoot.rotation.y);
            const wx = x + (lx * cosR + lz * sinR);
            const wz = z + (-lx * sinR + lz * cosR);

            br.buildQueue.push({
                name, mesh, targetY: ly, worldX: wx, worldZ: wz, built: false
            });
        }

        // 1-4: Fundação e Deck em 4 quadrantes
        [
            ['Base Noroeste', -1.00, 0.11, -0.75],
            ['Base Nordeste',  1.00, 0.11, -0.75],
            ['Deck Sudoeste', -1.00, 0.11,  0.75],
            ['Deck Sudeste',   1.00, 0.11,  0.75]
        ].forEach(([lbl, qx, qy, qz]) => {
            const qg = new THREE.Group();
            const sub = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 1.52), A.matStone); sub.position.y = -0.04;
            const top = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.10, 1.46), A.matTimber); top.position.y = 0.06;
            qg.add(sub, top);
            addBarnPiece(lbl, qg, qx, qy, qz);
        });

        // 5-8: 4 Mourões / Pilares Mestres
        [[-1.84, -1.30, 'NO'], [1.84, -1.30, 'NE'], [-1.84, 1.30, 'SO'], [1.84, 1.30, 'SE']].forEach(([cx, cz, lbl]) => {
            addBarnPiece(`Pilar Mestre ${lbl}`, new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.28, 0.22), A.matTimber), cx, 1.34, cz);
        });

        // 9-10: Paredes Vermelhas do Celeiro
        const backWall = new THREE.Group();
        backWall.add(
            new THREE.Mesh(new THREE.BoxGeometry(3.62, 2.16, 0.14), A.matBarnRed),
            Object.assign(new THREE.Mesh(new THREE.BoxGeometry(3.68, 0.12, 0.18), A.matPlankLight), { position: new THREE.Vector3(0, -0.96, 0) })
        );
        addBarnPiece('Parede Traseira', backWall, 0, 1.30, -1.30);

        const sideWalls = new THREE.Group();
        const lw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.16, 2.52), A.matBarnRed); lw.position.set(-1.84, 0, 0);
        const winF = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.64, 0.64), A.matPlankLight); winF.position.set(-1.84, 0.35, 0);
        const rw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 2.52), A.matBarnRed); rw.position.set(1.84, -0.56, 0);
        sideWalls.add(lw, winF, rw);
        addBarnPiece('Paredes Laterais', sideWalls, 0, 1.30, 0);

        // 11: Silo Metálico de Grãos
        const siloGrp = new THREE.Group();
        const sBody = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 2.55, 12), A.matSteel); sBody.position.y = 1.28;
        const sDome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), A.matBarnRed); sDome.position.y = 2.55;
        siloGrp.add(sBody, sDome);
        addBarnPiece('Silo Metálico de Grãos', siloGrp, -2.26, 0.16, -0.78);

        // 12: Balcão da Feira + Bancas de Hortifrúti
        const furnGrp = new THREE.Group();
        const cBody = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.84, 0.54), A.matBarnRed); cBody.position.set(-0.84, 0.42, 0.92);
        const cTop = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.09, 0.62), A.matPlankLight); cTop.position.set(-0.84, 0.86, 0.92);
        const bBack = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.54, 0.58), A.matPlankLight); bBack.position.set(0.15, 0.27, -0.78);
        const bSide = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.54, 1.42), A.matPlankLight); bSide.position.set(1.24, 0.27, 0.28);
        furnGrp.add(cBody, cTop, bBack, bSide);
        addBarnPiece('Balcão e Bancas da Feira', furnGrp, 0, 0.22, 0);

        // 13: Fachada Superior, Letreiro FEIRA & CELEIRO e Lanterna Noturna
        const header = new THREE.Group();
        const beam = new THREE.Mesh(new THREE.BoxGeometry(3.86, 0.20, 0.18), A.matTimber);
        const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.54, 0.08), A.matSign);
        signBoard.position.set(0, 0.28, 0.08);
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.6 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), bulbMat);
        bulb.position.set(1.48, -0.15, 0.18);
        const lLight = new THREE.PointLight(0xffd28a, 0, 8.5);
        lLight.position.set(0, -0.35, 0.70);
        br.lanternLight = lLight;
        br.lanternBulbMat = bulbMat;
        header.add(beam, signBoard, bulb, lLight);
        addBarnPiece('Fachada e Letreiro', header, 0, 2.40, 1.34);

        // 14: Telhado Tradicional de Celeiro (2 Águas)
        const roofGrp = new THREE.Group();
        const rBack = new THREE.Mesh(new THREE.BoxGeometry(4.18, 0.09, 1.88), A.matRoofSlate);
        rBack.position.set(0, 0, -0.76); rBack.rotation.x = -0.36;
        const rFront = new THREE.Mesh(new THREE.BoxGeometry(4.18, 0.09, 1.88), A.matRoofSlate);
        rFront.position.set(0, 0, 0.76); rFront.rotation.x = 0.36;
        roofGrp.add(rBack, rFront);
        addBarnPiece('Telhado de Celeiro', roofGrp, 0, 2.78, 0);

        // 12 Slots de exposição sobre as bancas e balcão
        for (let i = 0; i < 6; i++) br.displaySlots.push({ x: -0.92 + i * 0.43, y: 0.86, z: -0.78 });
        for (let i = 0; i < 3; i++) br.displaySlots.push({ x: 1.24, y: 0.86, z: -0.16 + i * 0.45 });
        for (let i = 0; i < 3; i++) br.displaySlots.push({ x: -1.32 + i * 0.44, y: 1.18, z: 0.92 });

        const preBuilt = opts.instantBuilt ? br.buildQueue.length : Math.min(br.buildQueue.length, opts.builtProgress || 0);
        for (let i = 0; i < preBuilt; i++) { br.buildQueue[i].built = true; br.buildQueue[i].mesh.visible = true; }
        br.builtProgress = preBuilt;
        if (br.builtProgress >= br.buildQueue.length) {
            br.completed = true;
            if (br.stakes) br.stakes.visible = false;
            if (br.lanternLight) br.lanternLight.intensity = MO.state?.isNight ? 2.1 : 0.65;
        }
        if (Array.isArray(opts.displayedCrops)) {
            opts.displayedCrops.forEach(ck => deliverDisplayCrate(ck, { silent: true }));
        }

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            if (MO.spawnBurst) MO.spawnBurst(x, by + 0.3, z, 0x38bdf8, 14, 0.09);
            if (MO.showToast) MO.showToast('🏡 Celeiro & Feira demarcados! Agricultores vão erguê-lo peça por peça.', '📐');
        }
        syncFarmingUI();
        return br;
    }

    function getNextBarnPiece() {
        if (!agState.barn.placed || agState.barn.completed) return null;
        return agState.barn.buildQueue.find(p => !p.built) || null;
    }

    function installNextBarnPiece(worker = null) {
        const br = agState.barn;
        const piece = getNextBarnPiece();
        if (!piece) return null;

        piece.built = true;
        piece.mesh.visible = true;
        br.builtProgress++;
        agState.animatingPieces.push({ piece, progress: 0 });
        if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
        if (MO.spawnBurst) MO.spawnBurst(piece.worldX, getGroundY(piece.worldX, piece.worldZ) + piece.targetY, piece.worldZ, 0xfacc15, 10, 0.08);
        if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) MO.workerFactory.awardWorkerExperience(worker, 6, 2);

        if (br.builtProgress >= br.buildQueue.length) {
            br.completed = true;
            if (br.stakes) br.stakes.visible = false;
            if (br.lanternLight) br.lanternLight.intensity = MO.state?.isNight ? 2.1 : 0.7;
            if (worker) {
                worker.celebrateTimer = 2.0;
                if (MO.workerFactory && MO.workerFactory.rememberWorkerEvent) {
                    MO.workerFactory.rememberWorkerEvent(worker, 'Inaugurou o Celeiro & Feira Agrícola');
                }
            }
            if (MO.economyManager && MO.economyManager.logJournal) {
                MO.economyManager.logJournal('🏡', 'Celeiro & Feira inaugurados!', 'Pronto para expor e vender caixotes de colheitas frescas');
            }
            if (MO.showToast) MO.showToast('🏆 Celeiro & Feira Agrícola inaugurados! Colheitas serão expostas.', '🏡');
        } else if (MO.showToast) {
            MO.showToast(`🏡 Celeiro: ${piece.name} (${br.builtProgress}/${br.buildQueue.length})`, '🏗️');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncFarmingUI();
        return piece;
    }

    function deliverDisplayCrate(cropKey = 'wheat', opts = {}) {
        const br = agState.barn;
        if (!br.placed || !br.completed) return false;
        if (br.displayedCrates.length >= MAX_DISPLAY_CRATES) {
            if (!opts.silent && MO.showToast) {
                MO.showToast('🧺 Bancadas da Feira cheias (12/12)! Clique em 🧺 Feira para vender.', '💰');
            }
            return false;
        }
        const slot = br.displaySlots[br.displayedCrates.length];
        if (!slot) return false;
        const A = getSharedAssets();
        const info = CROP_CATALOG[cropKey] || CROP_CATALOG.wheat;

        const crate = new THREE.Group();
        const box = new THREE.Mesh(A.crateBoxGeo, A.matPlankLight);
        box.castShadow = true;
        crate.add(box);
        const itemMat = A.cropMats[cropKey] || A.cropMats.wheat;
        for (let i = 0; i < 4; i++) {
            const pr = new THREE.Mesh(A.produceSphereGeo, itemMat);
            pr.position.set((i % 2 === 0 ? -0.08 : 0.08), 0.10, (i < 2 ? -0.06 : 0.06));
            crate.add(pr);
        }
        crate.position.set(slot.x, slot.y, slot.z);
        crate.userData = { farmBarn: true };
        barnRoot.add(crate);
        br.displayedCrates.push({ mesh: crate, cropKey, value: info.value, name: info.name });

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playPackCrate) MO.SoundFX.playPackCrate();
            if (MO.showToast) MO.showToast(`${info.icon} ${info.name} exposto na Feira (${br.displayedCrates.length}/${MAX_DISPLAY_CRATES})!`, '🧺');
            if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        }
        syncFarmingUI();
        return true;
    }

    function isBarnConnectedToHighway() {
        const br = agState.barn;
        const state = MO.state;
        const cm = MO.chunkManager;
        if (!br.placed || !state || !state.city || !state.city.roadTiles || !cm || !cm.isNearHighway) return false;

        let startTile = null;
        let bestD = Infinity;
        const builtMap = new Map();
        state.city.roadTiles.forEach((tile, key) => {
            if (!tile || !tile.built) return;
            builtMap.set(key, tile);
            const d = Math.hypot(tile.x - br.x, tile.z - br.z);
            if (d <= 5.0 && d < bestD) { bestD = d; startTile = tile; }
        });
        if (!startTile) return false;

        const visited = new Set([`${startTile.gx},${startTile.gz}`]);
        const queue = [startTile];
        while (queue.length > 0) {
            const cur = queue.shift();
            if (cm.isNearHighway(cur.x, cur.z, 2.8, state.seed)) return true;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dz === 0) continue;
                    const nk = `${cur.gx + dx},${cur.gz + dz}`;
                    if (!visited.has(nk) && builtMap.has(nk)) {
                        visited.add(nk);
                        queue.push(builtMap.get(nk));
                    }
                }
            }
        }
        return false;
    }

    function sellDisplayedHarvest(opts = {}) {
        const br = agState.barn;
        if (!br.placed || br.displayedCrates.length === 0) return { soldCount: 0, earned: 0, highwayBonus: false };

        const count = opts.single ? 1 : br.displayedCrates.length;
        const highwayBonus = isBarnConnectedToHighway();
        let rawCoins = 0;

        for (let i = 0; i < count; i++) {
            const item = br.displayedCrates.pop();
            if (!item) break;
            if (barnRoot && item.mesh) {
                if (MO.resources) MO.resources.removeAndDispose(barnRoot, item.mesh);
                else barnRoot.remove(item.mesh);
            }
            rawCoins += item.value || 10;
        }

        const earned = Math.round(rawCoins * (highwayBonus ? HIGHWAY_EXPORT_MULT : 1.0));
        agState.totalSoldCrates += count;
        agState.totalSalesCoins += earned;

        if (MO.cityManager && MO.cityManager.addResources) {
            MO.cityManager.addResources({ coins: earned });
        }
        if (MO.SoundFX && MO.SoundFX.playCashRegister) MO.SoundFX.playCashRegister();
        if (MO.spawnBurst) MO.spawnBurst(br.x, getGroundY(br.x, br.z) + 1.4, br.z, 0x34d399, 16, 0.11);
        if (MO.economyManager && MO.economyManager.logJournal) {
            const bTxt = highwayBonus ? ' (com +35% Bônus Rodovia!)' : '';
            MO.economyManager.logJournal('🧺', `Venda na Feira Agrícola (+${earned}🪙)`, `${count} caixote(s) vendido(s)${bTxt}`);
        }
        if (!opts.silent && MO.showToast) {
            const tag = highwayBonus ? ' · +35% Bônus Rodovia 🛣️' : '';
            MO.showToast(`💰 Vendido ${count} caixote(s) na Feira por +${earned}🪙${tag}!`, '🧺');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncFarmingUI();
        return { soldCount: count, earned, highwayBonus };
    }

    // =========================================================================
    // 3. INTERAÇÃO DIRETA POR CLIQUE NA LAVOURA, CESTOS, POÇO, TRIAGEM & CELEIRO
    // =========================================================================
    function findBestFarmer(nearX, nearZ) {
        const workers = (MO.state && Array.isArray(MO.state.workers)) ? MO.state.workers : [];
        const farmers = workers.filter(w => !w.sleepingInside && (w.role === 'farmer' || w.specialty === 'farmer'));
        const pool = farmers.length > 0 ? farmers : workers.filter(w => !w.sleepingInside && w.role !== 'supervisor');
        if (pool.length === 0) return null;
        pool.sort((a, b) => {
            const pa = a.rig && a.rig.group ? a.rig.group.position : { x: 0, z: 0 };
            const pb = b.rig && b.rig.group ? b.rig.group.position : { x: 0, z: 0 };
            const da = Math.hypot(pa.x - nearX, pa.z - nearZ) + (a.task ? 8 : 0);
            const db = Math.hypot(pb.x - nearX, pb.z - nearZ) + (b.task ? 8 : 0);
            return da - db;
        });
        return pool[0];
    }

    function dispatchFarmerToPlot(plot) {
        if (!plot) return false;
        if (plot.status === 'growing') {
            const info = CROP_CATALOG[plot.cropKey] || CROP_CATALOG.wheat;
            if (MO.showToast) MO.showToast(`${info.icon} ${info.name} crescendo (${Math.round(plot.growth * 100)}%)...`, info.icon);
            return true;
        }
        const w = findBestFarmer(plot.x, plot.z);
        if (!w) {
            if (MO.showToast) MO.showToast('🌾 Contrate um Fazendeiro no Celular (📱) para cultivar a lavoura!', '🌾');
            return false;
        }
        if (w.task && MO.workerTasks && MO.workerTasks.releaseTaskReservations) {
            MO.workerTasks.releaseTaskReservations(w.task);
        }
        const setDest = MO.workerTasks.setDestination;
        const setTool = MO.workerFactory.setWorkerTool;

        if (plot.status === 'seeded' && !w.hasWaterInCan && agState.well.built) {
            plot.res = true;
            w.task = { type: 'fetch-water', farmPlot: plot, duration: 0.65, subPhase: 'work' };
            setDest(w, agState.well.x, agState.well.z + 1.0);
            setTool(w.rig, 'can');
            w.rig.setBadge('💧');
            w.statusText = 'Buscando água no Poço';
            return true;
        }

        plot.res = true;
        const map = {
            overgrown: { type: 'farm-clear', tool: 'hoe', badge: '🌿', txt: 'Capinando bloco da lavoura' },
            cleared:   { type: 'farm-till',  tool: 'hoe', badge: '🚜', txt: 'Arando solo em sulcos' },
            tilled:    { type: 'farm-sow',   tool: 'none', badge: '🌱', txt: 'Semeando lavoura' },
            seeded:    { type: 'farm-water', tool: 'can', badge: '💧', txt: 'Irrigando plantação' },
            ripe:      { type: 'farm-harvest', tool: 'sickle', badge: '🌾', txt: 'Colhendo com foice' }
        };
        const cfg = map[plot.status];
        if (!cfg) return false;
        w.task = { type: cfg.type, farmPlot: plot, duration: 0.85, subPhase: 'work' };
        setDest(w, plot.x, plot.z + 0.85);
        setTool(w.rig, cfg.tool);
        w.rig.setBadge(cfg.badge);
        w.statusText = cfg.txt;
        return true;
    }

    function handleWorldClick(raycaster) {
        if (!farmingGroup || !raycaster) return false;

        // 1. Clique em cesto colhido no chão
        const bHits = bundlesGroup ? raycaster.intersectObjects(bundlesGroup.children, true) : [];
        if (bHits.length > 0 && bHits[0].object.userData.farmBundleRef) {
            const b = bHits[0].object.userData.farmBundleRef;
            if (!b.picked) {
                const w = findBestFarmer(b.x, b.z);
                if (!w) return false;
                if (w.task && MO.workerTasks) MO.workerTasks.releaseTaskReservations(w.task);
                b.res = true;
                w.task = { type: 'haul-harvest', farmBundle: b, duration: 0.35, subPhase: 'pickup' };
                MO.workerTasks.setDestination(w, b.x, b.z);
                MO.workerFactory.setWorkerTool(w.rig, 'none');
                w.rig.setBadge('🧺');
                w.statusText = 'Recolhendo cesto da colheita';
                return true;
            }
        }

        // 2. Clique em bloco da lavoura
        const pHits = plotsGroup ? raycaster.intersectObjects(plotsGroup.children, true) : [];
        if (pHits.length > 0 && pHits[0].object.userData.farmPlotRef) {
            return dispatchFarmerToPlot(pHits[0].object.userData.farmPlotRef);
        }

        // 3. Clique no Poço
        const wHits = wellRoot ? raycaster.intersectObjects(wellRoot.children, true) : [];
        if (wHits.length > 0) {
            if (!agState.well.built) {
                const w = findBestFarmer(agState.well.x, agState.well.z);
                if (w) {
                    if (w.task && MO.workerTasks) MO.workerTasks.releaseTaskReservations(w.task);
                    w.task = { type: 'build-well-piece', duration: 0.80, subPhase: 'work' };
                    MO.workerTasks.setDestination(w, agState.well.x, agState.well.z + 1.0);
                    MO.workerFactory.setWorkerTool(w.rig, 'hammer');
                    w.rig.setBadge('🪣');
                    w.statusText = 'Construindo Poço d\'Água';
                }
            } else if (MO.showToast) {
                MO.showToast('💧 Poço d\'Água pronto para irrigação da lavoura!', '💧');
            }
            return true;
        }

        // 4. Clique na Triagem
        const bnHits = benchRoot ? raycaster.intersectObjects(benchRoot.children, true) : [];
        if (bnHits.length > 0) {
            const rem = agState.bench.buildQueue.length - agState.bench.builtProgress;
            if (MO.showToast) {
                MO.showToast(
                    agState.bench.built ? '🧺 Bancada de Triagem pronta! Embala cestos em caixotes.' : `🧺 Triagem: faltam ${rem} colheita(s)!`,
                    '🧺'
                );
            }
            return true;
        }

        // 5. Clique no Celeiro / Feira
        const brHits = barnRoot ? raycaster.intersectObjects(barnRoot.children, true) : [];
        if (brHits.length > 0) {
            const br = agState.barn;
            if (!br.completed) {
                const rem = br.buildQueue.length - br.builtProgress;
                if (MO.showToast) MO.showToast(`🏡 Celeiro em obra: faltam ${rem} caixote(s) embalado(s)!`, '🏗️');
            } else if (br.displayedCrates.length > 0) {
                sellDisplayedHarvest();
            } else if (MO.showToast) {
                const hwStr = isBarnConnectedToHighway() ? ' · Bônus Rodovia +35% ATIVO 🛣️' : ' · Ligue à Rodovia para +35%!';
                MO.showToast(`🏡 Feira Agrícola aberta (0/${MAX_DISPLAY_CRATES} caixotes)${hwStr}`, '🧺');
            }
            return true;
        }

        return false;
    }

    // =========================================================================
    // 4. CRESCIMENTO (COM BÔNUS DE CHUVA & RIO), BRISA, GRAVIDADE E ENCAIXE
    // =========================================================================
    function update(dt, simTime = 0) {
        if (!farmingGroup) return;
        const isNight = Boolean(MO.state && MO.state.isNight);
        const isRaining = Boolean(MO.state && MO.state.weather === 'rain');
        const br = agState.barn;
        if (br.completed && br.lanternLight) {
            br.lanternLight.intensity = isNight ? 2.1 : 0.45;
            if (br.lanternBulbMat) br.lanternBulbMat.emissiveIntensity = isNight ? 2.2 : 0.6;
        }

        // 1. Crescimento das plantas + Irrigação natural pela chuva + Bônus de fertilidade perto do Rio!
        for (let i = 0; i < agState.plots.length; i++) {
            const p = agState.plots[i];
            if (p.status === 'seeded' && isRaining) {
                // Chuva irriga automaticamente blocos semeados!
                p.status = 'growing';
                p.growth = 0.08;
                applyPlotVisualState(p);
            }
            if (p.status === 'growing') {
                const info = CROP_CATALOG[p.cropKey] || CROP_CATALOG.wheat;
                const nearRiver = MO.getRiverCenterX ? (Math.abs(p.x - MO.getRiverCenterX(p.z)) < 14) : false;
                const mult = (nearRiver ? 1.30 : 1.0) * (isRaining ? 1.45 : 1.0);
                p.growth = Math.min(1.0, p.growth + dt * info.growSpeed * mult);
                if (p.cropGroup && p.cropGroup.scale) p.cropGroup.scale.setScalar(0.08 + p.growth * 0.92);
                if (p.cropGroup && p.cropGroup.rotation) p.cropGroup.rotation.z = Math.sin(simTime * 2.2 + i) * 0.035;
                if (p.growth >= 1.0) {
                    p.status = 'ripe';
                    applyPlotVisualState(p);
                    if (MO.SoundFX && MO.SoundFX.playPackCrate) MO.SoundFX.playPackCrate();
                    if (MO.spawnBurst) MO.spawnBurst(p.x, p.y + 0.5, p.z, info.color, 10, 0.08);
                }
            } else if (p.status === 'ripe') {
                if (p.cropGroup && p.cropGroup.rotation) p.cropGroup.rotation.z = Math.sin(simTime * 2.6 + i) * 0.045;
                if (p.ripeRingMat) p.ripeRingMat.opacity = 0.16 + Math.sin(simTime * 4) * 0.08;
            }
        }

        // 2. Gravidade nos cestos colhidos no chão
        for (let i = 0; i < agState.harvestBundles.length; i++) {
            const b = agState.harvestBundles[i];
            if (b.picked || b.grounded) continue;
            b.vy -= 0.015;
            b.mesh.position.y += b.vy;
            const floorY = getGroundY(b.x, b.z) + 0.11;
            if (b.mesh.position.y <= floorY) {
                b.mesh.position.y = floorY;
                if (Math.abs(b.vy) > 0.04) b.vy = -b.vy * 0.25;
                else { b.vy = 0; b.grounded = true; }
            }
        }

        // 3. Animação de encaixe das peças do Poço, Triagem e Celeiro
        for (let i = agState.animatingPieces.length - 1; i >= 0; i--) {
            const ap = agState.animatingPieces[i];
            ap.progress = Math.min(1, ap.progress + dt * 3.8);
            const ease = 1 - Math.pow(1 - ap.progress, 3);
            ap.piece.mesh.position.y = ap.piece.targetY + (1 - ease) * 0.44;
            ap.piece.mesh.scale.setScalar(0.84 + 0.16 * ease);
            if (ap.progress >= 1) {
                ap.piece.mesh.position.y = ap.piece.targetY;
                ap.piece.mesh.scale.setScalar(1);
                agState.animatingPieces.splice(i, 1);
            }
        }
    }

    // =========================================================================
    // 5. UI SYNC, TOGGLE AUTO/MANUAL, RESET & SERIALIZAÇÃO
    // =========================================================================
    function toggleAutoMode(forceVal) {
        agState.autoMode = (typeof forceVal === 'boolean') ? forceVal : !agState.autoMode;
        syncFarmingUI();
        if (MO.showToast) {
            MO.showToast(
                agState.autoMode
                    ? '🤖 Agricultura Automática ATIVA: agricultores preparam solo, irrigam, colhem e abastecem o Celeiro!'
                    : '🎯 Agricultura Manual: clique nos blocos da lavoura, cestos ou Poço!',
                agState.autoMode ? '🤖' : '🌾'
            );
        }
        return agState.autoMode;
    }

    function syncFarmingUI() {
        if (typeof document === 'undefined') return;
        const br = agState.barn;
        const sellBtn = document.getElementById('btn-sell-harvest');
        const sellLbl = document.getElementById('harvest-sell-label');
        if (sellBtn) {
            sellBtn.disabled = br.displayedCrates.length === 0;
            sellBtn.classList.toggle('opacity-40', br.displayedCrates.length === 0);
        }
        if (sellLbl) {
            if (!br.placed) sellLbl.textContent = `Feira (0/12)`;
            else if (!br.completed) sellLbl.textContent = `Celeiro ${br.builtProgress}/${br.buildQueue.length}`;
            else sellLbl.textContent = `Feira (${br.displayedCrates.length}/${MAX_DISPLAY_CRATES})`;
        }
        const autoBtn = document.getElementById('btn-farming-auto');
        const autoLbl = document.getElementById('farming-auto-label');
        if (autoBtn) autoBtn.classList.toggle('active', agState.autoMode);
        if (autoLbl) autoLbl.textContent = agState.autoMode ? 'Auto: ON' : 'Manual';
    }

    function reset() {
        ensureGroups();
        if (MO.resources) {
            MO.resources.clearGroup(plotsGroup);
            MO.resources.clearGroup(bundlesGroup);
            MO.resources.clearGroup(wellRoot);
            MO.resources.clearGroup(benchRoot);
            MO.resources.clearGroup(barnRoot);
        }
        initCropPool(MO.state ? MO.state.seed : 4280);
        agState.fieldOrigin = null;
        agState.plots = [];
        agState.harvestBundles = [];
        agState.animatingPieces = [];
        agState.totalSoldCrates = 0;
        agState.totalSalesCoins = 0;
        agState.well = { placed: false, x: 0, z: 0, builtProgress: 0, built: false, buildQueue: [], stakes: null };
        agState.bench = {
            placed: false, x: 0, z: 0, builtProgress: 0, built: false, busyWorkerId: null,
            buildQueue: [], stakes: null, rawBasketMesh: null, packedCrateMesh: null,
            progressBarBg: null, progressBarFill: null
        };
        agState.barn = {
            placed: false, x: 0, z: 0, builtProgress: 0, completed: false,
            buildQueue: [], displaySlots: [], displayedCrates: [],
            stakes: null, lanternLight: null, lanternBulbMat: null
        };
        syncFarmingUI();
    }

    function serialize() {
        const wl = agState.well;
        const bn = agState.bench;
        const br = agState.barn;
        return {
            autoMode: Boolean(agState.autoMode),
            cropPool: agState.cropPool.slice(),
            fieldOrigin: agState.fieldOrigin ? { x: agState.fieldOrigin.x, z: agState.fieldOrigin.z } : null,
            plots: agState.plots.map(p => ({
                cropKey: p.cropKey,
                status: p.status,
                growth: Math.round((p.growth || 0) * 100) / 100
            })),
            totalSoldCrates: agState.totalSoldCrates,
            totalSalesCoins: agState.totalSalesCoins,
            well: wl.placed ? { x: Math.round(wl.x * 100) / 100, z: Math.round(wl.z * 100) / 100, builtProgress: wl.builtProgress, built: Boolean(wl.built) } : null,
            bench: bn.placed ? { x: Math.round(bn.x * 100) / 100, z: Math.round(bn.z * 100) / 100, builtProgress: bn.builtProgress, built: Boolean(bn.built) } : null,
            barn: br.placed ? {
                x: Math.round(br.x * 100) / 100,
                z: Math.round(br.z * 100) / 100,
                builtProgress: br.builtProgress,
                completed: Boolean(br.completed),
                displayedCrops: br.displayedCrates.map(c => c.cropKey || 'wheat')
            } : null
        };
    }

    function restore(snap) {
        reset();
        if (!snap || typeof snap !== 'object') return;
        if (typeof snap.autoMode === 'boolean') agState.autoMode = snap.autoMode;
        if (Array.isArray(snap.cropPool) && snap.cropPool.length > 0) agState.cropPool = snap.cropPool.slice();
        agState.totalSoldCrates = snap.totalSoldCrates || 0;
        agState.totalSalesCoins = snap.totalSalesCoins || 0;
        if (snap.fieldOrigin && Number.isFinite(snap.fieldOrigin.x) && Number.isFinite(snap.fieldOrigin.z)) {
            agState.fieldOrigin = { x: snap.fieldOrigin.x, z: snap.fieldOrigin.z };
            if (Array.isArray(snap.plots)) {
                snap.plots.forEach(ps => {
                    expandContiguousField(agState.fieldOrigin, {
                        cropKey: ps.cropKey || 'wheat',
                        status: ps.status || 'overgrown',
                        growth: ps.growth || 0,
                        silent: true
                    });
                });
            }
        }
        if (snap.well && Number.isFinite(snap.well.x) && Number.isFinite(snap.well.z)) {
            placeWell(snap.well.x, snap.well.z, { builtProgress: snap.well.builtProgress || 0, instantBuilt: Boolean(snap.well.built), silent: true });
        }
        if (snap.bench && Number.isFinite(snap.bench.x) && Number.isFinite(snap.bench.z)) {
            placeBench(snap.bench.x, snap.bench.z, { builtProgress: snap.bench.builtProgress || 0, instantBuilt: Boolean(snap.bench.built), silent: true });
        }
        if (snap.barn && Number.isFinite(snap.barn.x) && Number.isFinite(snap.barn.z)) {
            placeBarn(snap.barn.x, snap.barn.z, {
                builtProgress: snap.barn.builtProgress || 0,
                instantBuilt: Boolean(snap.barn.completed),
                displayedCrops: snap.barn.displayedCrops || [],
                silent: true
            });
        }
        syncFarmingUI();
    }

    function getSummary() {
        return {
            autoMode: agState.autoMode,
            plotCount: agState.plots.length,
            maxPlots: FIELD_GRID_ORDER.length,
            ripePlots: agState.plots.filter(p => p.status === 'ripe').length,
            harvestBundles: agState.harvestBundles.filter(b => !b.picked).length,
            wellPlaced: agState.well.placed,
            wellBuilt: agState.well.built,
            benchPlaced: agState.bench.placed,
            benchBuilt: agState.bench.built,
            barnPlaced: agState.barn.placed,
            barnCompleted: agState.barn.completed,
            barnProgress: agState.barn.builtProgress,
            barnTotalPieces: agState.barn.buildQueue.length,
            displayedCount: agState.barn.displayedCrates.length,
            maxDisplay: MAX_DISPLAY_CRATES,
            highwayBonus: isBarnConnectedToHighway(),
            totalSoldCrates: agState.totalSoldCrates,
            totalSalesCoins: agState.totalSalesCoins
        };
    }

    MO.farmingManager = {
        TILE_SIZE,
        MAX_DISPLAY_CRATES,
        CROP_CATALOG,
        FIELD_GRID_ORDER,
        state: agState,
        init: ensureGroups,
        reset,
        update,
        expandContiguousField,
        advancePlotStage,
        consumeHarvestBundle,
        placeWell,
        getNextWellPiece,
        installNextWellPiece,
        placeBench,
        getNextBenchPiece,
        installNextBenchPiece,
        animateBench,
        placeBarn,
        getNextBarnPiece,
        installNextBarnPiece,
        deliverDisplayCrate,
        isBarnConnectedToHighway,
        sellDisplayedHarvest,
        handleWorldClick,
        toggleAutoMode,
        syncFarmingUI,
        serialize,
        restore,
        getSummary
    };
})(window.MO = window.MO || {});

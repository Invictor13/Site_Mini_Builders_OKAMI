// =========================================================================
// WORLD: FORESTRY MANAGER — LENHADOR FÍSICO, QUEDA DE ÁRVORES, TORAS,
// DESTOCA, REFLORESTAMENTO VIVO E MADEIREIRA MONTADA PEÇA POR PEÇA
// =========================================================================
(function(MO) {
    const MAX_DISPLAY_LOGS = 12;
    const BASE_BUNDLE_PRICE = 9;
    const PREMIUM_BONUS = 2;
    const HIGHWAY_EXPORT_MULT = 1.35;

    let forestryGroup = null;
    let treesGroup = null;
    let logsGroup = null;
    let markersGroup = null;
    let woodshopRoot = null;
    let sharedAssets = null;

    const fState = {
        autoMode: true,
        trees: [],          // árvores físicas articuladas (standing, falling, fallen, bucked, sapling)
        groundLogs: [],     // toras físicas caídas no solo com gravidade
        plantQueue: [],     // anéis de reflorestamento marcados no terreno
        animatingPieces: [], // peças da Madeireira/Bancada animando encaixe
        totalSoldBundles: 0,
        totalSalesCoins: 0,
        woodshop: {
            placed: false,
            x: 0,
            z: 0,
            builtProgress: 0,
            completed: false,
            buildQueue: [],
            displaySlots: [],
            displayedBundles: [],
            stakes: null,
            lanternLight: null,
            lanternBulbMat: null
        }
    };

    function createWoodRingsTexture() {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#dcb57e';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#9c6e3b';
        ctx.lineWidth = 2;
        for (let r = 8; r < 60; r += 8) {
            ctx.beginPath();
            ctx.arc(64, 64, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(c);
    }

    function createShopSignTexture() {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = 512; c.height = 128;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#3b2414';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, 496, 112);
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 42px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MADEIREIRA OKAMI', 256, 66);
        return new THREE.CanvasTexture(c);
    }

    function getSharedAssets() {
        if (sharedAssets) return sharedAssets;
        const ringsTex = createWoodRingsTexture();
        const signTex = createShopSignTexture();
        sharedAssets = {
            matBark: new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.92 }),
            matBirchBark: new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.88 }),
            matWoodEnd: new THREE.MeshStandardMaterial({ map: ringsTex || null, color: 0xdcb57e, roughness: 0.84 }),
            matPlank: new THREE.MeshStandardMaterial({ color: 0x8c5e35, roughness: 0.78 }),
            matPlankLight: new THREE.MeshStandardMaterial({ color: 0xc49563, roughness: 0.72 }),
            matPlankNoble: new THREE.MeshStandardMaterial({ color: 0xd99b4e, roughness: 0.65 }),
            matRoofShingle: new THREE.MeshStandardMaterial({ color: 0x7c3a21, roughness: 0.82 }),
            matSign: new THREE.MeshStandardMaterial({ map: signTex || null, color: 0x543519, roughness: 0.62 }),
            matStakeBlue: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.65 }),
            matStakeAmber: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
            matRingGreen: new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
            matInvisible: new THREE.MeshBasicMaterial({ visible: false }),
            leafMats: [
                new THREE.MeshStandardMaterial({ color: 0x264820, roughness: 0.92, flatShading: true }),
                new THREE.MeshStandardMaterial({ color: 0x315b27, roughness: 0.92, flatShading: true }),
                new THREE.MeshStandardMaterial({ color: 0x3f6e30, roughness: 0.92, flatShading: true }),
                new THREE.MeshStandardMaterial({ color: 0x1f3a1a, roughness: 0.92, flatShading: true })
            ],
            logGeo: new THREE.CylinderGeometry(0.125, 0.135, 0.68, 8),
            bundlePlankGeo: new THREE.BoxGeometry(0.34, 0.06, 0.42),
            ringGeo: new THREE.RingGeometry(0.20, 0.32, 14),
            stakeGeo: new THREE.CylinderGeometry(0.03, 0.03, 0.36, 6),
            ringsTex,
            signTex
        };
        if (MO.resources) {
            const list = [];
            Object.values(sharedAssets).forEach(v => {
                if (Array.isArray(v)) list.push(...v);
                else if (v) list.push(v);
            });
            MO.resources.protect(...list);
        }
        return sharedAssets;
    }

    function ensureGroups() {
        if (!MO.scene) return;
        if (!forestryGroup) {
            forestryGroup = new THREE.Group();
            forestryGroup.name = 'forestry';
            treesGroup = new THREE.Group();
            logsGroup = new THREE.Group();
            markersGroup = new THREE.Group();
            woodshopRoot = new THREE.Group();
            forestryGroup.add(treesGroup, logsGroup, markersGroup, woodshopRoot);
            MO.scene.add(forestryGroup);
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
            st.position.set(sx, 0.18, sz);
            g.add(st);
        });
        const rN = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.025), mat);
        rN.position.set(0, 0.24, -d / 2);
        const rS = rN.clone();
        rS.position.z = d / 2;
        const rW = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, d), mat);
        rW.position.set(-w / 2, 0.24, 0);
        const rE = rW.clone();
        rE.position.x = w / 2;
        g.add(rN, rS, rW, rE);
        return g;
    }

    // =========================================================================
    // 1. ÁRVORES ARTICULADAS COM QUEDA REAL, ENTALHE, TORAS E DESTOCA
    // =========================================================================
    function createPhysicalTree(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const scale = opts.scale || (0.90 + Math.random() * 0.28);
        const species = opts.species || (Math.random() < 0.45 ? 'pine' : (Math.random() < 0.75 ? 'oak' : 'birch'));
        const isPine = species === 'pine';
        const isBirch = species === 'birch';
        const startAsSapling = Boolean(opts.startAsSapling);
        const barkMat = isBirch ? A.matBirchBark : A.matBark;

        const y = getGroundY(x, z);
        const rootGroup = new THREE.Group();
        rootGroup.position.set(x, y, z);

        // Toco fixo na base (fica no solo após a queda até ser destocado)
        const stump = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18 * scale, 0.24 * scale, 0.40, 8),
            [barkMat, A.matWoodEnd, barkMat]
        );
        stump.position.y = 0.20;
        stump.castShadow = true;
        stump.receiveShadow = true;
        rootGroup.add(stump);

        const stumpHit = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42 * scale, 0.45 * scale, 0.50, 7),
            A.matInvisible
        );
        stumpHit.position.y = 0.25;
        rootGroup.add(stumpHit);

        // Pivot de queda na altura do corte
        const fallPivot = new THREE.Group();
        fallPivot.position.y = 0.40;
        rootGroup.add(fallPivot);

        const trunkH = (isPine ? 2.95 : (isBirch ? 2.85 : 2.55)) * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.10 * scale, 0.18 * scale, trunkH, 8),
            [barkMat, A.matWoodEnd, A.matWoodEnd]
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        fallPivot.add(trunk);

        const foliageGroup = new THREE.Group();
        if (isPine) {
            for (let i = 0; i < 4; i++) {
                const cone = new THREE.Mesh(
                    new THREE.ConeGeometry((0.96 - i * 0.18) * scale, (1.12 - i * 0.10) * scale, 7),
                    A.leafMats[i % A.leafMats.length]
                );
                cone.position.y = trunkH * 0.42 + i * 0.56 * scale;
                cone.rotation.y = i * 0.7;
                cone.castShadow = true;
                foliageGroup.add(cone);
            }
        } else {
            const count = isBirch ? 6 : 8;
            for (let i = 0; i < count; i++) {
                const ang = (i / count) * Math.PI * 2 + i * 0.4;
                const rad = (i < 2 ? 0.16 : 0.42 + (i % 3) * 0.14) * scale;
                const cl = new THREE.Mesh(
                    new THREE.IcosahedronGeometry((0.34 + (i % 3) * 0.08) * scale, 0),
                    A.leafMats[i % A.leafMats.length]
                );
                cl.position.set(
                    Math.cos(ang) * rad,
                    trunkH * 0.84 + (i % 3) * 0.24 * scale,
                    Math.sin(ang) * rad
                );
                cl.scale.set(isBirch ? 0.95 : 1.2, isBirch ? 1.15 : 0.78, isBirch ? 0.95 : 1.1);
                cl.castShadow = true;
                foliageGroup.add(cl);
            }
        }
        fallPivot.add(foliageGroup);

        // Entalhe visível do machado
        const notch = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.14, 0.26 * scale), A.matWoodEnd);
        notch.position.set(0.08, 0.07, 0);
        notch.scale.set(0.01, 1, 1);
        notch.visible = false;
        fallPivot.add(notch);

        const hit = new THREE.Mesh(
            new THREE.CylinderGeometry(0.72 * scale, 0.72 * scale, trunkH + 0.9, 7),
            A.matInvisible
        );
        hit.position.y = (trunkH + 0.45) / 2;
        fallPivot.add(hit);

        const treeObj = {
            id: opts.sourceNodeId || `ftree-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            x, y, z, scale, trunkH, species,
            premium: species !== 'pine',
            rootGroup, stump, stumpHit, fallPivot, foliageGroup, notch,
            status: startAsSapling ? 'sapling' : 'standing',
            growth: startAsSapling ? 0.16 : 1.0,
            hp: 4,
            maxHp: 4,
            buckHp: 3,
            stumpHp: 3,
            stumpRemoved: false,
            res: false,
            fallDirAngle: 0,
            fallPitch: 0,
            fallVel: 0,
            shakeTimer: 0
        };

        if (startAsSapling) {
            rootGroup.scale.setScalar(0.16);
        }

        stump.userData.forestryStumpRef = treeObj;
        stumpHit.userData.forestryStumpRef = treeObj;
        fallPivot.traverse(c => {
            if (c && c.userData) c.userData.forestryTreeRef = treeObj;
        });

        treesGroup.add(rootGroup);
        fState.trees.push(treeObj);
        return treeObj;
    }

    function promoteChunkTree(resourceNode) {
        if (!resourceNode) return null;
        const existing = fState.trees.find(t => t.id === resourceNode.id && !t.stumpRemoved);
        if (existing) return existing;

        const speciesList = ['pine', 'oak', 'birch'];
        const hashIdx = Math.abs(Math.round(resourceNode.x * 7 + resourceNode.z * 13)) % speciesList.length;
        const tree = createPhysicalTree(resourceNode.x, resourceNode.z, {
            sourceNodeId: resourceNode.id,
            species: speciesList[hashIdx],
            scale: 0.95 + (hashIdx * 0.08)
        });
        if (MO.chunkManager && MO.chunkManager.harvestNode && resourceNode.amount > 0) {
            MO.chunkManager.harvestNode(resourceNode, resourceNode.amount, { silent: true, skipStump: true });
        }
        return tree;
    }

    function applyAxeHitToTree(tree, hitterX, hitterZ) {
        if (!tree || tree.status !== 'standing') return false;
        tree.hp = Math.max(0, tree.hp - 1);
        tree.shakeTimer = 0.25;
        if (tree.notch) {
            tree.notch.visible = true;
            tree.notch.scale.x = Math.min(1.0, (tree.maxHp - tree.hp) / tree.maxHp);
        }
        if (MO.SoundFX && MO.SoundFX.playAxeChop) MO.SoundFX.playAxeChop();
        if (MO.spawnBurst) MO.spawnBurst(tree.x, tree.y + 0.5, tree.z, 0xdcb57e, 9, 0.08);

        if (tree.hp <= 0) {
            triggerTreeFall(tree, hitterX, hitterZ);
            return true;
        }
        return false;
    }

    function triggerTreeFall(tree, fromX, fromZ) {
        if (!tree || tree.status !== 'standing') return;
        tree.status = 'falling';
        tree.res = false;
        const ws = fState.woodshop;
        if (ws.placed) {
            tree.fallDirAngle = Math.atan2(tree.x - ws.x, tree.z - ws.z) + (Math.random() - 0.5) * 0.75;
        } else if (Number.isFinite(fromX) && Number.isFinite(fromZ)) {
            tree.fallDirAngle = Math.atan2(tree.x - fromX, tree.z - fromZ) + (Math.random() - 0.5) * 0.5;
        } else {
            tree.fallDirAngle = Math.atan2(tree.x, tree.z) + (Math.random() - 0.5) * 0.9;
        }
        if (tree.fallPivot) tree.fallPivot.rotation.y = tree.fallDirAngle;
        tree.fallVel = 0.01;
        if (MO.SoundFX && MO.SoundFX.playTreeCreak) MO.SoundFX.playTreeCreak();
        if (MO.showToast) MO.showToast('🌲 Madeira!! A árvore está caindo!', '🪓');
    }

    function spawnGroundLogsFromTree(tree) {
        ensureGroups();
        const A = getSharedAssets();
        tree.status = 'bucked';
        tree.res = false;
        if (tree.fallPivot) tree.fallPivot.visible = false;

        const dirX = Math.sin(tree.fallDirAngle);
        const dirZ = Math.cos(tree.fallDirAngle);
        const barkMat = tree.species === 'birch' ? A.matBirchBark : A.matBark;
        const pieceCount = 4;

        for (let i = 0; i < pieceCount; i++) {
            const dist = 0.55 + (i / (pieceCount - 1)) * (tree.trunkH * 0.72);
            const lx = tree.x + dirX * dist + (Math.random() - 0.5) * 0.25;
            const lz = tree.z + dirZ * dist + (Math.random() - 0.5) * 0.25;
            const ly = getGroundY(lx, lz) + 0.45 + Math.random() * 0.18;

            const logMesh = new THREE.Mesh(A.logGeo, [barkMat, A.matWoodEnd, A.matWoodEnd]);
            logMesh.position.set(lx, ly, lz);
            logMesh.rotation.set(Math.PI / 2, Math.random() * Math.PI, 0);
            logMesh.castShadow = true;
            logMesh.receiveShadow = true;

            const logObj = {
                id: `glog-${Date.now()}-${i}-${Math.floor(Math.random() * 999)}`,
                x: lx,
                z: lz,
                vy: 0.04 + Math.random() * 0.03,
                species: tree.species || 'pine',
                premium: Boolean(tree.premium),
                grounded: false,
                picked: false,
                res: false,
                mesh: logMesh
            };
            logMesh.userData.forestryLogRef = logObj;
            logsGroup.add(logMesh);
            fState.groundLogs.push(logObj);
        }

        if (MO.spawnBurst) {
            MO.spawnBurst(tree.x + dirX * 1.3, tree.y + 0.4, tree.z + dirZ * 1.3, 0xdcb57e, 12, 0.10);
        }
        if (MO.showToast) {
            MO.showToast('🪵 Tronco partido em 4 toras! Lenhadores vão recolher para a Bancada.', '🪓');
        }
    }

    function applyBuckHitToTree(tree) {
        if (!tree || tree.status !== 'fallen') return false;
        tree.buckHp = Math.max(0, tree.buckHp - 1);
        const dirX = Math.sin(tree.fallDirAngle);
        const dirZ = Math.cos(tree.fallDirAngle);
        const midX = tree.x + dirX * (tree.trunkH * 0.45);
        const midZ = tree.z + dirZ * (tree.trunkH * 0.45);
        if (MO.SoundFX && MO.SoundFX.playAxeChop) MO.SoundFX.playAxeChop();
        if (MO.spawnBurst) MO.spawnBurst(midX, getGroundY(midX, midZ) + 0.32, midZ, 0xdcb57e, 8, 0.08);
        if (tree.buckHp <= 0) {
            spawnGroundLogsFromTree(tree);
            return true;
        }
        return false;
    }

    function applyStumpHit(tree) {
        if (!tree || tree.stumpRemoved) return false;
        tree.stumpHp = Math.max(0, tree.stumpHp - 1);
        if (tree.stump && tree.stump.scale) {
            tree.stump.scale.setScalar(0.55 + (tree.stumpHp / 3) * 0.45);
        }
        if (MO.SoundFX && MO.SoundFX.playAxeChop) MO.SoundFX.playAxeChop();
        if (MO.SoundFX && MO.SoundFX.playPlantDig) MO.SoundFX.playPlantDig();
        if (MO.spawnBurst) {
            MO.spawnBurst(tree.x, tree.y + 0.22, tree.z, 0x7a6248, 6, 0.07);
            MO.spawnBurst(tree.x, tree.y + 0.28, tree.z, 0xdcb57e, 5, 0.07);
        }
        if (tree.stumpHp <= 0) {
            tree.stumpRemoved = true;
            tree.res = false;
            if (treesGroup && tree.rootGroup) {
                if (MO.resources) MO.resources.removeAndDispose(treesGroup, tree.rootGroup);
                else treesGroup.remove(tree.rootGroup);
            }
            if (MO.spawnBurst) MO.spawnBurst(tree.x, tree.y + 0.16, tree.z, 0x5c4632, 12, 0.09);
            if (MO.showToast) MO.showToast('🧹 Toco arrancado! Terreno limpo para reflorestamento ou construção.', '🌱');
            return true;
        }
        return false;
    }

    function consumeGroundLog(logObj) {
        if (!logObj || logObj.picked) return false;
        logObj.picked = true;
        logObj.res = false;
        if (logsGroup && logObj.mesh) {
            if (MO.resources) MO.resources.removeAndDispose(logsGroup, logObj.mesh);
            else logsGroup.remove(logObj.mesh);
        }
        return true;
    }

    // =========================================================================
    // 2. REFLORESTAMENTO ATIVO (ANÉIS VERDES + MUDAS EM CRESCIMENTO)
    // =========================================================================
    function isValidPlantSpot(x, z) {
        const y = getGroundY(x, z);
        if (y < (MO.WATER_LEVEL || -0.36) + 0.25 || y > 3.2) return false;
        if (MO.chunkManager && MO.chunkManager.isNearHighway && MO.chunkManager.isNearHighway(x, z, 2.4, MO.state?.seed)) return false;
        const city = MO.state && MO.state.city;
        if (city && city.roadTiles && city.roadTiles.has(`${Math.floor(x)},${Math.floor(z)}`)) return false;
        if (fState.woodshop.placed && Math.hypot(x - fState.woodshop.x, z - fState.woodshop.z) < 4.0) return false;
        if (MO.STATION_WORKBENCH && MO.state?.villageInfra?.workbenchPlaced && Math.hypot(x - MO.STATION_WORKBENCH.x, z - MO.STATION_WORKBENCH.z) < 2.4) return false;
        if (fState.trees.some(t => !t.stumpRemoved && Math.hypot(t.x - x, t.z - z) < 2.0)) return false;
        if (fState.plantQueue.some(q => Math.hypot(q.x - x, q.z - z) < 2.0)) return false;
        return true;
    }

    function markReforestSpots(count = 4, centerPos = null) {
        ensureGroups();
        const A = getSharedAssets();
        const cx = centerPos ? centerPos.x : ((MO.camOrbit && MO.camOrbit.target) ? MO.camOrbit.target.x : 0);
        const cz = centerPos ? centerPos.z : ((MO.camOrbit && MO.camOrbit.target) ? MO.camOrbit.target.z : 0);

        let queued = 0;
        for (let attempt = 0; attempt < 50 && queued < count; attempt++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 5.5 + Math.random() * 14.0;
            const tx = cx + Math.cos(ang) * dist;
            const tz = cz + Math.sin(ang) * dist;
            if (!isValidPlantSpot(tx, tz)) continue;

            const ring = new THREE.Mesh(A.ringGeo, A.matRingGreen);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(tx, getGroundY(tx, tz) + 0.05, tz);
            markersGroup.add(ring);
            fState.plantQueue.push({
                id: `plant-${Date.now()}-${queued}-${Math.floor(Math.random() * 999)}`,
                x: tx,
                z: tz,
                marker: ring,
                res: false
            });
            queued++;
        }

        if (queued > 0 && MO.showToast) {
            MO.showToast(`🌱 ${queued} ponto(s) marcados para reflorestamento! Lenhadores vão plantar as mudas.`, '🌱');
        } else if (queued === 0 && MO.showToast) {
            MO.showToast('🌲 Área ao redor já está bem arborizada!', '🌲');
        }
        return queued;
    }

    function completePlantSapling(spot) {
        if (!spot) return null;
        if (markersGroup && spot.marker) {
            if (MO.resources) MO.resources.removeAndDispose(markersGroup, spot.marker);
            else markersGroup.remove(spot.marker);
        }
        fState.plantQueue = fState.plantQueue.filter(q => q !== spot);

        const speciesRoll = Math.random();
        const species = speciesRoll < 0.40 ? 'pine' : (speciesRoll < 0.72 ? 'oak' : 'birch');
        const sapling = createPhysicalTree(spot.x, spot.z, {
            species,
            scale: 0.92 + Math.random() * 0.25,
            startAsSapling: true
        });
        if (MO.SoundFX && MO.SoundFX.playPlantDig) MO.SoundFX.playPlantDig();
        if (MO.spawnBurst) MO.spawnBurst(spot.x, getGroundY(spot.x, spot.z) + 0.16, spot.z, 0x4ade80, 10, 0.06);
        if (MO.economyManager && MO.economyManager.logJournal) {
            MO.economyManager.logJournal('🌱', 'Muda florestal plantada', `Espécie ${species === 'pine' ? 'Pinho' : (species === 'oak' ? 'Carvalho Nobre' : 'Bétula Nobre')} em crescimento`);
        }
        return sapling;
    }

    // =========================================================================
    // 3. MADEIREIRA / LOJA DE MADEIRA (15 PEÇAS INDIVIDUAIS + 12 EXPOSITORES)
    // =========================================================================
    function placeWoodshop(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const ws = fState.woodshop;

        if (MO.resources) MO.resources.clearGroup(woodshopRoot);
        else while (woodshopRoot.children.length > 0) woodshopRoot.remove(woodshopRoot.children[0]);

        ws.placed = true;
        ws.x = x;
        ws.z = z;
        ws.builtProgress = 0;
        ws.completed = false;
        ws.buildQueue = [];
        ws.displaySlots = [];
        ws.displayedBundles = [];
        ws.lanternLight = null;
        ws.lanternBulbMat = null;

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 3.2);
            MO.chunkManager.paintLevelArea(x, z, 3.1, 0.92, MO.PLATEAU_Y);
        }

        const sy = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        woodshopRoot.position.set(x, sy, z);
        woodshopRoot.rotation.y = -0.32;
        woodshopRoot.userData = { forestryWoodshop: true };

        ws.stakes = createStakeOutline(4.1, 3.1, A.matStakeBlue);
        woodshopRoot.add(ws.stakes);

        function addPiece(name, mesh, lx, ly, lz) {
            mesh.position.set(lx, ly, lz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.visible = false;
            mesh.traverse(c => { if (c && c.userData) c.userData.forestryWoodshop = true; });
            woodshopRoot.add(mesh);

            const cosR = Math.cos(woodshopRoot.rotation.y);
            const sinR = Math.sin(woodshopRoot.rotation.y);
            const wx = x + (lx * cosR + lz * sinR);
            const wz = z + (-lx * sinR + lz * cosR);

            ws.buildQueue.push({
                name,
                mesh,
                targetY: ly,
                worldX: wx,
                worldZ: wz,
                built: false
            });
        }

        // 1-2: Vigas de base
        addPiece('Viga Traseira', new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 0.22), A.matBark), 0, 0.08, -1.25);
        addPiece('Viga Frontal', new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 0.22), A.matBark), 0, 0.08, 1.25);

        // 3-4: Deck de piso em tábuas
        addPiece('Piso Posterior', new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.08, 1.38), A.matPlankLight), 0, 0.20, -0.68);
        addPiece('Piso Frontal', new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.08, 1.38), A.matPlankLight), 0, 0.20, 0.72);

        // 5-8: 4 Colunas de canto
        [[-1.82, -1.28, 'NO'], [1.82, -1.28, 'NE'], [-1.82, 1.28, 'SO'], [1.82, 1.28, 'SE']].forEach(([cx, cz, label]) => {
            addPiece(`Coluna ${label}`, new THREE.Mesh(new THREE.BoxGeometry(0.20, 2.20, 0.20), A.matBark), cx, 1.30, cz);
        });

        // 9-11: Paredes de madeira (Fundo, Esquerda, Meia-Parede Direita)
        addPiece('Parede dos Fundos', new THREE.Mesh(new THREE.BoxGeometry(3.56, 2.05, 0.12), A.matPlank), 0, 1.26, -1.28);
        addPiece('Parede Esquerda', new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.05, 2.48), A.matPlank), -1.82, 1.26, 0);
        addPiece('Parede Direita', new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.12, 2.48), A.matPlank), 1.82, 0.78, 0);

        // 12: Balcão de atendimento + Expositores internos
        const furnitureGrp = new THREE.Group();
        const counter = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.86, 0.52), A.matPlankLight);
        counter.position.set(-0.85, 0.43, 0.92);
        const rackBack = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.56, 0.56), A.matPlank);
        rackBack.position.set(0, 0.28, -0.78);
        const rackSide = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.56, 1.42), A.matPlank);
        rackSide.position.set(1.25, 0.28, 0.28);
        furnitureGrp.add(counter, rackBack, rackSide);
        addPiece('Balcão e Expositores', furnitureGrp, 0, 0.24, 0);

        // 13: Placa "MADEIREIRA OKAMI" + Lanterna quente
        const signGrp = new THREE.Group();
        const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.60, 0.56, 0.08), A.matSign);
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.45 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), bulbMat);
        bulb.position.set(1.42, -0.14, 0.16);
        const lanternLight = new THREE.PointLight(0xffd28a, 0, 8.5);
        lanternLight.position.set(0, -0.35, 0.6);
        signGrp.add(signBoard, bulb, lanternLight);
        ws.lanternLight = lanternLight;
        ws.lanternBulbMat = bulbMat;
        addPiece('Placa e Lanterna', signGrp, 0, 2.34, 1.38);

        // 14-15: Telhado duas águas com telhas rústicas
        const roofBack = new THREE.Mesh(new THREE.BoxGeometry(4.36, 0.10, 1.88), A.matRoofShingle);
        roofBack.rotation.x = -0.34;
        addPiece('Telhado Posterior', roofBack, 0, 2.70, -0.76);

        const roofFront = new THREE.Mesh(new THREE.BoxGeometry(4.36, 0.10, 1.88), A.matRoofShingle);
        roofFront.rotation.x = 0.34;
        addPiece('Telhado Frontal', roofFront, 0, 2.70, 0.76);

        // 12 Slots de exposição de lotes serrados
        for (let i = 0; i < 6; i++) ws.displaySlots.push({ x: -1.10 + i * 0.44, y: 0.90, z: -0.78 });
        for (let i = 0; i < 3; i++) ws.displaySlots.push({ x: 1.25, y: 0.90, z: -0.18 + i * 0.46 });
        for (let i = 0; i < 3; i++) ws.displaySlots.push({ x: -1.30 + i * 0.45, y: 1.18, z: 0.92 });

        // Suporte a restauração instantânea parcial/completa
        const preBuilt = opts.instantBuilt ? ws.buildQueue.length : Math.min(ws.buildQueue.length, opts.builtProgress || 0);
        for (let i = 0; i < preBuilt; i++) {
            ws.buildQueue[i].built = true;
            ws.buildQueue[i].mesh.visible = true;
        }
        ws.builtProgress = preBuilt;
        if (ws.builtProgress >= ws.buildQueue.length) {
            ws.completed = true;
            if (ws.stakes) ws.stakes.visible = false;
            if (ws.lanternLight) ws.lanternLight.intensity = MO.state?.isNight ? 2.0 : 0.65;
        }
        if (Array.isArray(opts.displayedSpecies)) {
            opts.displayedSpecies.forEach(sp => deliverDisplayBundle(sp, { silent: true }));
        }

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            if (MO.spawnBurst) MO.spawnBurst(x, sy + 0.3, z, 0x38bdf8, 14, 0.09);
            if (MO.showToast) MO.showToast('🏪 Terreno da Madeireira marcado! Lenhadores vão construí-la peça por peça.', '📐');
        }
        syncForestryUI();
        return ws;
    }

    function getNextWoodshopPiece() {
        if (!fState.woodshop.placed || fState.woodshop.completed) return null;
        return fState.woodshop.buildQueue.find(p => !p.built) || null;
    }

    function installNextWoodshopPiece(worker = null) {
        const ws = fState.woodshop;
        const piece = getNextWoodshopPiece();
        if (!piece) return null;

        piece.built = true;
        piece.mesh.visible = true;
        ws.builtProgress++;
        fState.animatingPieces.push({ piece, progress: 0 });

        if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
        if (MO.spawnBurst) MO.spawnBurst(piece.worldX, getGroundY(piece.worldX, piece.worldZ) + piece.targetY, piece.worldZ, 0xdcb57e, 10, 0.08);
        if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) {
            MO.workerFactory.awardWorkerExperience(worker, 6, 2);
        }

        if (ws.builtProgress >= ws.buildQueue.length) {
            ws.completed = true;
            if (ws.stakes) ws.stakes.visible = false;
            if (ws.lanternLight) ws.lanternLight.intensity = MO.state?.isNight ? 2.1 : 0.7;
            if (worker) {
                worker.celebrateTimer = 2.0;
                if (MO.workerFactory && MO.workerFactory.rememberWorkerEvent) {
                    MO.workerFactory.rememberWorkerEvent(worker, 'Inaugurou a Madeireira OKAMI');
                }
            }
            if (MO.economyManager && MO.economyManager.logJournal) {
                MO.economyManager.logJournal('🏪', 'Madeireira OKAMI inaugurada!', 'Pronta para expor e vender lotes de madeira beneficiada');
            }
            if (MO.showToast) MO.showToast('🏆 Madeireira inaugurada! Novas peças serradas serão expostas para venda.', '🏪');
        } else if (MO.showToast) {
            MO.showToast(`🏪 Madeireira: ${piece.name} (${ws.builtProgress}/${ws.buildQueue.length})`, '🔨');
        }

        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncForestryUI();
        return piece;
    }

    function deliverDisplayBundle(species = 'pine', opts = {}) {
        const ws = fState.woodshop;
        if (!ws.placed || !ws.completed) return false;
        if (ws.displayedBundles.length >= MAX_DISPLAY_LOGS) {
            if (!opts.silent && MO.showToast) {
                MO.showToast('🪵 Expositores da Madeireira cheios (12/12)! Clique em 💰 Vender Exposição.', '💰');
            }
            return false;
        }
        const slot = ws.displaySlots[ws.displayedBundles.length];
        if (!slot) return false;
        const A = getSharedAssets();
        const isNoble = species === 'oak' || species === 'birch';

        const bundle = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            const mat = isNoble ? (i % 2 === 0 ? A.matPlankNoble : A.matPlankLight) : (i % 2 === 0 ? A.matPlankLight : A.matPlank);
            const plank = new THREE.Mesh(A.bundlePlankGeo, mat);
            plank.position.set(0, i * 0.065, 0);
            plank.rotation.y = (i - 1) * 0.06;
            plank.castShadow = true;
            bundle.add(plank);
        }
        bundle.position.set(slot.x, slot.y, slot.z);
        bundle.userData = { forestryWoodshop: true };
        woodshopRoot.add(bundle);
        ws.displayedBundles.push({ mesh: bundle, species, noble: isNoble });

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playHammerWood) MO.SoundFX.playHammerWood();
            const label = isNoble ? 'Madeira Nobre' : 'Madeira de Pinho';
            if (MO.showToast) MO.showToast(`🪵 Lote de ${label} exposto na Madeireira (${ws.displayedBundles.length}/${MAX_DISPLAY_LOGS})!`, '🏪');
            if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        }
        syncForestryUI();
        return true;
    }

    function isWoodshopConnectedToHighway() {
        const ws = fState.woodshop;
        const state = MO.state;
        const cm = MO.chunkManager;
        if (!ws.placed || !state || !state.city || !state.city.roadTiles || !cm || !cm.isNearHighway) return false;

        let startTile = null;
        let bestD = Infinity;
        const builtMap = new Map();
        state.city.roadTiles.forEach((tile, key) => {
            if (!tile || !tile.built) return;
            builtMap.set(key, tile);
            const d = Math.hypot(tile.x - ws.x, tile.z - ws.z);
            if (d <= 5.0 && d < bestD) {
                bestD = d;
                startTile = tile;
            }
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

    function sellDisplayedWood(opts = {}) {
        const ws = fState.woodshop;
        if (!ws.placed || ws.displayedBundles.length === 0) return { soldCount: 0, earned: 0, highwayBonus: false };

        const count = opts.single ? 1 : ws.displayedBundles.length;
        const highwayBonus = isWoodshopConnectedToHighway();
        let rawCoins = 0;

        for (let i = 0; i < count; i++) {
            const b = ws.displayedBundles.pop();
            if (!b) break;
            if (woodshopRoot && b.mesh) {
                if (MO.resources) MO.resources.removeAndDispose(woodshopRoot, b.mesh);
                else woodshopRoot.remove(b.mesh);
            }
            rawCoins += BASE_BUNDLE_PRICE + (b.noble ? PREMIUM_BONUS : 0);
        }

        const earned = Math.round(rawCoins * (highwayBonus ? HIGHWAY_EXPORT_MULT : 1.0));
        fState.totalSoldBundles += count;
        fState.totalSalesCoins += earned;

        if (MO.cityManager && MO.cityManager.addResources) {
            MO.cityManager.addResources({ coins: earned });
        }
        if (MO.SoundFX && MO.SoundFX.playCashRegister) MO.SoundFX.playCashRegister();
        if (MO.spawnBurst) MO.spawnBurst(ws.x, getGroundY(ws.x, ws.z) + 1.4, ws.z, 0x34d399, 16, 0.11);
        if (MO.economyManager && MO.economyManager.logJournal) {
            const bonusTxt = highwayBonus ? ' (com +35% Bônus Rodovia!)' : '';
            MO.economyManager.logJournal('💰', `Venda na Madeireira (+${earned}🪙)`, `${count} lote(s) vendido(s)${bonusTxt}`);
        }
        if (!opts.silent && MO.showToast) {
            const bonusTag = highwayBonus ? ' · +35% Bônus Rodovia 🛣️' : '';
            MO.showToast(`💰 Vendido ${count} lote(s) na Madeireira por +${earned}🪙${bonusTag}!`, '💰');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncForestryUI();
        return { soldCount: count, earned, highwayBonus };
    }

    // =========================================================================
    // 4. INTERAÇÃO DIRETA POR CLIQUE NA FLORESTA, TORAS, TOCOS E MADEIREIRA
    // =========================================================================
    function findBestLumberjack(nearX, nearZ) {
        const workers = (MO.state && Array.isArray(MO.state.workers)) ? MO.state.workers : [];
        const ljs = workers.filter(w => !w.sleepingInside && (w.role === 'lumberjack' || w.specialty === 'lumberjack'));
        const pool = ljs.length > 0 ? ljs : workers.filter(w => !w.sleepingInside && w.role !== 'supervisor');
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

    function dispatchLumberjackCommand(kind, target) {
        const tx = target ? target.x : 0;
        const tz = target ? target.z : 0;
        const w = findBestLumberjack(tx, tz);
        if (!w) {
            if (MO.showToast) MO.showToast('🪓 Contrate um Lenhador no Celular (📱) para operar a floresta!', '🪓');
            return false;
        }
        if (w.task && MO.workerTasks && MO.workerTasks.releaseTaskReservations) {
            MO.workerTasks.releaseTaskReservations(w.task);
        }
        const setDest = MO.workerTasks.setDestination;
        const setTool = MO.workerFactory.setWorkerTool;

        if (kind === 'chop-tree') {
            target.res = true;
            w.task = { type: 'harvest-wood', forestryTree: target, duration: 1.5, subPhase: 'work' };
            setDest(w, target.x + 0.72, target.z + 0.45);
            setTool(w.rig, 'axe');
            w.rig.setBadge('🪓');
            w.statusText = 'Derrubando árvore selecionada';
            if (MO.showToast) MO.showToast(`🪓 ${w.name} indo derrubar árvore!`, '🌲');
            return true;
        }
        if (kind === 'buck-tree') {
            target.res = true;
            const dirX = Math.sin(target.fallDirAngle);
            const dirZ = Math.cos(target.fallDirAngle);
            const midX = target.x + dirX * (target.trunkH * 0.45);
            const midZ = target.z + dirZ * (target.trunkH * 0.45);
            w.task = { type: 'buck-tree', forestryTree: target, lookX: midX, lookZ: midZ, duration: 1.25, subPhase: 'work' };
            setDest(w, midX - dirZ * 0.75, midZ + dirX * 0.75);
            setTool(w.rig, 'axe');
            w.rig.setBadge('🪓');
            w.statusText = 'Partindo tronco caído em toras';
            if (MO.showToast) MO.showToast(`🪓 ${w.name} indo partir o tronco em toras!`, '🪵');
            return true;
        }
        if (kind === 'pickup-log') {
            target.res = true;
            w.task = { type: 'haul-log', forestryLog: target, duration: 0.4, subPhase: 'pickup' };
            setDest(w, target.x, target.z);
            setTool(w.rig, 'none');
            w.rig.setBadge('🪵');
            w.statusText = 'Recolhendo tora no chão';
            if (MO.showToast) MO.showToast(`🪵 ${w.name} indo recolher a tora!`, '🪵');
            return true;
        }
        if (kind === 'remove-stump') {
            target.res = true;
            w.task = { type: 'remove-stump', forestryTree: target, duration: 1.2, subPhase: 'work' };
            setDest(w, target.x + 0.65, target.z + 0.35);
            setTool(w.rig, 'axe');
            w.rig.setBadge('🧹');
            w.statusText = 'Arrancando toco da floresta';
            if (MO.showToast) MO.showToast(`🧹 ${w.name} indo arrancar o toco!`, '🌱');
            return true;
        }
        return false;
    }

    function handleWorldClick(raycaster, terrainPoint = null) {
        if (!forestryGroup || !raycaster) return false;

        // 1. Clique em tora física no chão
        const logHits = logsGroup ? raycaster.intersectObjects(logsGroup.children, true) : [];
        if (logHits.length > 0 && logHits[0].object.userData.forestryLogRef) {
            const log = logHits[0].object.userData.forestryLogRef;
            if (!log.picked) return dispatchLumberjackCommand('pickup-log', log);
        }

        // 2. Clique em árvore articulada, tronco caído, muda ou toco
        const treeHits = treesGroup ? raycaster.intersectObjects(treesGroup.children, true) : [];
        if (treeHits.length > 0) {
            const ud = treeHits[0].object.userData || {};
            if (ud.forestryStumpRef) {
                const st = ud.forestryStumpRef;
                if (st.status === 'bucked' && !st.stumpRemoved) return dispatchLumberjackCommand('remove-stump', st);
                if (st.status === 'standing') return dispatchLumberjackCommand('chop-tree', st);
            }
            if (ud.forestryTreeRef) {
                const tr = ud.forestryTreeRef;
                if (tr.status === 'sapling') {
                    if (MO.showToast) MO.showToast(`🌱 Muda crescendo (${Math.round(tr.growth * 100)}%) — aguarde virar árvore adulta!`, '🌱');
                    return true;
                }
                if (tr.status === 'standing') return dispatchLumberjackCommand('chop-tree', tr);
                if (tr.status === 'fallen') return dispatchLumberjackCommand('buck-tree', tr);
            }
        }

        // 3. Clique na Madeireira
        const wsHits = woodshopRoot ? raycaster.intersectObjects(woodshopRoot.children, true) : [];
        if (wsHits.length > 0) {
            const ws = fState.woodshop;
            if (!ws.completed) {
                const rem = ws.buildQueue.length - ws.builtProgress;
                if (MO.showToast) MO.showToast(`🏪 Madeireira em obra: faltam ${rem} peça(s) serradas na Bancada!`, '🏗️');
            } else if (ws.displayedBundles.length > 0) {
                sellDisplayedWood();
            } else if (MO.showToast) {
                const hwStr = isWoodshopConnectedToHighway() ? ' · Bônus Rodovia +35% ATIVO 🛣️' : ' · Ligue à Rodovia para +35%!';
                MO.showToast(`🏪 Madeireira aberta (0/${MAX_DISPLAY_LOGS} lotes)${hwStr}`, '🏪');
            }
            return true;
        }

        // 4. Clique próximo a uma árvore instanciada da floresta (sem ferramenta ativa) -> promove e corta!
        if (terrainPoint && MO.chunkManager && MO.chunkManager.getLoadedResourceNodes) {
            const woodNodes = MO.chunkManager.getLoadedResourceNodes('wood');
            let nearest = null;
            let bestD = 1.45;
            for (let i = 0; i < woodNodes.length; i++) {
                const n = woodNodes[i];
                const d = Math.hypot(n.x - terrainPoint.x, n.z - terrainPoint.z);
                if (d < bestD) { bestD = d; nearest = n; }
            }
            if (nearest) {
                const physicalTree = promoteChunkTree(nearest);
                if (physicalTree) return dispatchLumberjackCommand('chop-tree', physicalTree);
            }
        }

        return false;
    }

    // =========================================================================
    // 5. FÍSICA DE QUEDA, GRAVIDADE DE TORAS, CRESCIMENTO DE MUDAS E ENCAIXE
    // =========================================================================
    function update(dt) {
        if (!forestryGroup) return;
        const isNight = Boolean(MO.state && MO.state.isNight);
        const ws = fState.woodshop;
        if (ws.completed && ws.lanternLight) {
            ws.lanternLight.intensity = isNight ? 2.1 : 0.45;
            if (ws.lanternBulbMat) ws.lanternBulbMat.emissiveIntensity = isNight ? 2.2 : 0.45;
        }

        // 1. Árvores (mudas crescendo, vibração do machado e queda acelerada pela gravidade)
        for (let i = 0; i < fState.trees.length; i++) {
            const tr = fState.trees[i];
            if (tr.stumpRemoved) continue;

            if (tr.status === 'sapling') {
                tr.growth = Math.min(1.0, tr.growth + dt * 0.014);
                if (tr.rootGroup && tr.rootGroup.scale) tr.rootGroup.scale.setScalar(tr.growth);
                if (tr.growth >= 1.0) {
                    tr.status = 'standing';
                    if (MO.spawnBurst) MO.spawnBurst(tr.x, tr.y + 1.2, tr.z, 0x4ade80, 8, 0.06);
                }
                continue;
            }
            if (tr.shakeTimer > 0) {
                tr.shakeTimer -= dt;
                if (tr.fallPivot) tr.fallPivot.rotation.z = Math.sin(tr.shakeTimer * 55) * 0.06;
                if (tr.shakeTimer <= 0 && tr.fallPivot) tr.fallPivot.rotation.z = 0;
            }
            if (tr.status === 'falling') {
                tr.fallVel += (0.045 + Math.sin(tr.fallPitch) * 0.16) * dt * 16;
                tr.fallPitch += tr.fallVel * dt;
                const maxPitch = Math.PI / 2 - 0.04;
                if (tr.fallPitch >= maxPitch) {
                    tr.fallPitch = maxPitch;
                    tr.status = 'fallen';
                    if (MO.SoundFX && MO.SoundFX.playTreeCrash) MO.SoundFX.playTreeCrash();
                    const dirX = Math.sin(tr.fallDirAngle);
                    const dirZ = Math.cos(tr.fallDirAngle);
                    const hitX = tr.x + dirX * tr.trunkH * 0.65;
                    const hitZ = tr.z + dirZ * tr.trunkH * 0.65;
                    const hy = getGroundY(hitX, hitZ);
                    if (MO.spawnBurst) {
                        MO.spawnBurst(hitX, hy + 0.3, hitZ, 0x7a6248, 14, 0.13);
                        MO.spawnBurst(hitX, hy + 0.5, hitZ, 0x3b572e, 10, 0.12);
                    }
                }
                if (tr.fallPivot) tr.fallPivot.rotation.x = tr.fallPitch;
            }
        }

        // 2. Gravidade + quique nas toras no chão
        for (let i = 0; i < fState.groundLogs.length; i++) {
            const l = fState.groundLogs[i];
            if (l.picked || l.grounded) continue;
            l.vy -= 0.014;
            l.mesh.position.y += l.vy;
            const floorY = getGroundY(l.x, l.z) + 0.14;
            if (l.mesh.position.y <= floorY) {
                l.mesh.position.y = floorY;
                if (Math.abs(l.vy) > 0.04) l.vy = -l.vy * 0.25;
                else { l.vy = 0; l.grounded = true; }
            }
        }

        // 3. Animação suave de encaixe das peças da Madeireira
        for (let i = fState.animatingPieces.length - 1; i >= 0; i--) {
            const ap = fState.animatingPieces[i];
            ap.progress = Math.min(1, ap.progress + dt * 3.8);
            const ease = 1 - Math.pow(1 - ap.progress, 3);
            ap.piece.mesh.position.y = ap.piece.targetY + (1 - ease) * 0.44;
            ap.piece.mesh.scale.setScalar(0.82 + 0.18 * ease);
            if (ap.progress >= 1) {
                ap.piece.mesh.position.y = ap.piece.targetY;
                ap.piece.mesh.scale.setScalar(1);
                fState.animatingPieces.splice(i, 1);
            }
        }
    }

    // =========================================================================
    // 6. UI SYNC, TOGGLE AUTO/MANUAL, RESET & SERIALIZAÇÃO
    // =========================================================================
    function toggleAutoMode(forceVal) {
        fState.autoMode = (typeof forceVal === 'boolean') ? forceVal : !fState.autoMode;
        syncForestryUI();
        if (MO.showToast) {
            MO.showToast(
                fState.autoMode
                    ? '🤖 Lenhador Automático ATIVO: corta, desdobra, serra e constrói a Madeireira sozinho!'
                    : '🎯 Lenhador Manual: clique diretamente em árvores, troncos caídos, toras ou tocos!',
                fState.autoMode ? '🤖' : '🪓'
            );
        }
        return fState.autoMode;
    }

    function syncForestryUI() {
        if (typeof document === 'undefined') return;
        const ws = fState.woodshop;
        const sellBtn = document.getElementById('btn-sell-woodshop');
        const sellLbl = document.getElementById('woodshop-sell-label');
        if (sellBtn) {
            sellBtn.disabled = ws.displayedBundles.length === 0;
            sellBtn.classList.toggle('opacity-40', ws.displayedBundles.length === 0);
        }
        if (sellLbl) {
            if (!ws.placed) sellLbl.textContent = 'Vender (0/12)';
            else if (!ws.completed) sellLbl.textContent = `Obra ${ws.builtProgress}/${ws.buildQueue.length}`;
            else sellLbl.textContent = `Vender (${ws.displayedBundles.length}/${MAX_DISPLAY_LOGS})`;
        }
        const autoBtn = document.getElementById('btn-forestry-auto');
        const autoLbl = document.getElementById('forestry-auto-label');
        if (autoBtn) autoBtn.classList.toggle('active', fState.autoMode);
        if (autoLbl) autoLbl.textContent = fState.autoMode ? 'Auto: ON' : 'Manual';
    }

    function reset() {
        ensureGroups();
        if (MO.resources) {
            MO.resources.clearGroup(treesGroup);
            MO.resources.clearGroup(logsGroup);
            MO.resources.clearGroup(markersGroup);
            MO.resources.clearGroup(woodshopRoot);
        }
        fState.trees = [];
        fState.groundLogs = [];
        fState.plantQueue = [];
        fState.animatingPieces = [];
        fState.totalSoldBundles = 0;
        fState.totalSalesCoins = 0;
        fState.woodshop = {
            placed: false,
            x: 0,
            z: 0,
            builtProgress: 0,
            completed: false,
            buildQueue: [],
            displaySlots: [],
            displayedBundles: [],
            stakes: null,
            lanternLight: null,
            lanternBulbMat: null
        };
        syncForestryUI();
    }

    function serialize() {
        const ws = fState.woodshop;
        return {
            autoMode: Boolean(fState.autoMode),
            totalSoldBundles: fState.totalSoldBundles,
            totalSalesCoins: fState.totalSalesCoins,
            woodshop: ws.placed ? {
                x: Math.round(ws.x * 100) / 100,
                z: Math.round(ws.z * 100) / 100,
                builtProgress: ws.builtProgress,
                completed: Boolean(ws.completed),
                displayedSpecies: ws.displayedBundles.map(b => b.species || 'pine')
            } : null
        };
    }

    function restore(snap) {
        reset();
        if (!snap || typeof snap !== 'object') return;
        if (typeof snap.autoMode === 'boolean') fState.autoMode = snap.autoMode;
        fState.totalSoldBundles = snap.totalSoldBundles || 0;
        fState.totalSalesCoins = snap.totalSalesCoins || 0;
        if (snap.woodshop && Number.isFinite(snap.woodshop.x) && Number.isFinite(snap.woodshop.z)) {
            placeWoodshop(snap.woodshop.x, snap.woodshop.z, {
                builtProgress: snap.woodshop.builtProgress || 0,
                instantBuilt: Boolean(snap.woodshop.completed),
                displayedSpecies: snap.woodshop.displayedSpecies || [],
                silent: true
            });
        }
        syncForestryUI();
    }

    function getSummary() {
        const ws = fState.woodshop;
        return {
            autoMode: fState.autoMode,
            activeTrees: fState.trees.filter(t => !t.stumpRemoved).length,
            fallenTrees: fState.trees.filter(t => t.status === 'fallen').length,
            leftoverStumps: fState.trees.filter(t => t.status === 'bucked' && !t.stumpRemoved).length,
            saplings: fState.trees.filter(t => t.status === 'sapling').length,
            groundLogs: fState.groundLogs.filter(l => !l.picked).length,
            plantQueue: fState.plantQueue.length,
            woodshopPlaced: ws.placed,
            woodshopBuiltProgress: ws.builtProgress,
            woodshopTotalPieces: ws.buildQueue.length,
            woodshopCompleted: ws.completed,
            displayedCount: ws.displayedBundles.length,
            maxDisplay: MAX_DISPLAY_LOGS,
            highwayBonus: isWoodshopConnectedToHighway(),
            totalSoldBundles: fState.totalSoldBundles,
            totalSalesCoins: fState.totalSalesCoins
        };
    }

    MO.forestryManager = {
        MAX_DISPLAY_LOGS,
        state: fState,
        init: ensureGroups,
        reset,
        update,
        createPhysicalTree,
        promoteChunkTree,
        applyAxeHitToTree,
        triggerTreeFall,
        applyBuckHitToTree,
        applyStumpHit,
        consumeGroundLog,
        markReforestSpots,
        completePlantSapling,
        placeWoodshop,
        getNextWoodshopPiece,
        installNextWoodshopPiece,
        deliverDisplayBundle,
        isWoodshopConnectedToHighway,
        sellDisplayedWood,
        handleWorldClick,
        toggleAutoMode,
        syncForestryUI,
        serialize,
        restore,
        getSummary
    };
})(window.MO = window.MO || {});

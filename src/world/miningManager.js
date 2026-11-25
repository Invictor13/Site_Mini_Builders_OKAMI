// =========================================================================
// WORLD: MINING MANAGER — PEDREIRA FÍSICA, FRATURA DE ROCHAS, ENTULHO,
// BRITADOR COM SERRA DIAMANTADA & GALPÃO DE PEDRA/FUNDIÇÃO PEÇA POR PEÇA
// =========================================================================
(function(MO) {
    const MAX_DISPLAY_ITEMS = 12;
    const HIGHWAY_EXPORT_MULT = 1.35;

    const ORE_TYPES = {
        granite: { name: 'Granito', color: 0x64748b, speck: null, value: 10, hp: 4, stoneGrant: 2, ironGrant: 0 },
        iron:    { name: 'Minério de Ferro', color: 0x57534e, speck: 0xb45309, value: 15, hp: 5, stoneGrant: 1, ironGrant: 2 },
        gold:    { name: 'Veio de Ouro', color: 0x475569, speck: 0xfacc15, value: 26, hp: 6, stoneGrant: 1, ironGrant: 1 },
        crystal: { name: 'Quartzo de Montanha', color: 0x334155, speck: 0x38bdf8, value: 34, hp: 6, stoneGrant: 1, ironGrant: 2 }
    };

    let miningGroup = null;
    let rocksGroup = null;
    let chunksGroup = null;
    let crusherRoot = null;
    let depotRoot = null;
    let smokeGroup = null;
    let sharedAssets = null;

    const mState = {
        autoMode: true,
        rocks: [],           // afloramentos físicos articulados (status: 'intact' | 'rubble')
        groundChunks: [],    // pedaços fraturados com gravidade
        animatingPieces: [], // peças do Britador/Depósito animando encaixe
        smokeParticles: [],  // fumaça sutil saindo da chaminé da fundição
        totalSoldLots: 0,
        totalSalesCoins: 0,
        crusher: {
            placed: false,
            x: 0,
            z: 0,
            builtProgress: 0,
            built: false,
            busyWorkerId: null,
            buildQueue: [],
            stakes: null,
            sawDiscMesh: null,
            rawRockMesh: null,
            cutBlockMesh: null,
            progressBarBg: null,
            progressBarFill: null
        },
        depot: {
            placed: false,
            x: 0,
            z: 0,
            builtProgress: 0,
            completed: false,
            buildQueue: [],
            displaySlots: [],
            displayedMinerals: [],
            stakes: null,
            lanternLight: null,
            lanternBulbMat: null,
            furnaceLight: null,
            chimneyTopWorld: null
        }
    };

    function createStoneBlockTexture(baseHex, lineHex) {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = baseHex;
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = lineHex;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.45;
        for (let y = 0; y < 256; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
            const off = (y / 64) % 2 === 0 ? 0 : 64;
            for (let x = off; x < 256; x += 128) {
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function createDepotSignTexture() {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = 512; c.height = 128;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, 496, 112);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PEDREIRA & FUNDIÇÃO', 256, 66);
        return new THREE.CanvasTexture(c);
    }

    function getSharedAssets() {
        if (sharedAssets) return sharedAssets;
        const stoneCutTex = createStoneBlockTexture('#7c8591', '#334155');
        const masonryTex = createStoneBlockTexture('#626b75', '#272f3a');
        const signTex = createDepotSignTexture();
        const crystalGeo = (typeof THREE.OctahedronGeometry === 'function')
            ? new THREE.OctahedronGeometry(0.15, 0)
            : new THREE.DodecahedronGeometry(0.15, 0);

        sharedAssets = {
            matStoneDark: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.90, flatShading: true }),
            matBasalt: new THREE.MeshStandardMaterial({ color: 0x333942, roughness: 0.92 }),
            matStoneCut: new THREE.MeshStandardMaterial({ map: stoneCutTex || null, color: 0x7c8591, roughness: 0.82 }),
            matStoneMasonry: new THREE.MeshStandardMaterial({ map: masonryTex || null, color: 0x626b75, roughness: 0.88 }),
            matStoneLight: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.78 }),
            matSteel: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.80, roughness: 0.32 }),
            matSteelDark: new THREE.MeshStandardMaterial({ color: 0x2b3440, metalness: 0.75, roughness: 0.38 }),
            matIndustrialYellow: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.45, metalness: 0.25 }),
            matFurnaceGlow: new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xea580c, emissiveIntensity: 1.5, roughness: 0.4 }),
            matSkylightGlass: new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.38, roughness: 0.14, metalness: 0.35 }),
            matRoofMetal: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.45 }),
            matIronOre: new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.65, roughness: 0.38 }),
            matGoldOre: new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.88, roughness: 0.22, emissive: 0x713f12, emissiveIntensity: 0.22 }),
            matCrystalOre: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.55, roughness: 0.18, emissive: 0x0284c7, emissiveIntensity: 0.45 }),
            matSign: new THREE.MeshStandardMaterial({ map: signTex || null, color: 0x1e293b, roughness: 0.55 }),
            matStakeAmber: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
            matStakeBlue: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.65 }),
            matSmoke: new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35 }),
            matInvisible: new THREE.MeshBasicMaterial({ visible: false }),
            chunkGeo: new THREE.DodecahedronGeometry(0.19, 0),
            pebbleGeo: new THREE.DodecahedronGeometry(0.14, 0),
            crystalGeo,
            ingotGeo: new THREE.BoxGeometry(0.28, 0.08, 0.12),
            graniteBlockGeo: new THREE.BoxGeometry(0.32, 0.12, 0.24),
            smokeGeo: new THREE.DodecahedronGeometry(0.11, 0),
            stakeGeo: new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6),
            stoneCutTex,
            masonryTex,
            signTex
        };
        if (MO.resources) {
            MO.resources.protect(...Object.values(sharedAssets).filter(Boolean));
        }
        return sharedAssets;
    }

    function ensureGroups() {
        if (!MO.scene) return;
        if (!miningGroup) {
            miningGroup = new THREE.Group();
            miningGroup.name = 'mining';
            rocksGroup = new THREE.Group();
            chunksGroup = new THREE.Group();
            crusherRoot = new THREE.Group();
            depotRoot = new THREE.Group();
            smokeGroup = new THREE.Group();
            miningGroup.add(rocksGroup, chunksGroup, crusherRoot, depotRoot, smokeGroup);
            MO.scene.add(miningGroup);
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

    function getOreMat(oreKey) {
        const A = getSharedAssets();
        if (oreKey === 'gold') return A.matGoldOre;
        if (oreKey === 'iron') return A.matIronOre;
        if (oreKey === 'crystal') return A.matCrystalOre;
        return A.matStoneDark;
    }

    // =========================================================================
    // 1. AFLORAMENTOS DE ROCHA & VEIOS MINERAIS (COM FRATURA, PEDAÇOS & ENTULHO)
    // =========================================================================
    function createPhysicalRock(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const scale = opts.scale || (0.90 + Math.random() * 0.26);
        const oreKey = (opts.oreKey && ORE_TYPES[opts.oreKey]) ? opts.oreKey : 'granite';
        const info = ORE_TYPES[oreKey];
        const y = getGroundY(x, z);

        const root = new THREE.Group();
        root.position.set(x, y, z);

        // Base de entulho/cascalho (permanece após fratura até limpeza com pá)
        const rubbleGroup = new THREE.Group();
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            const r = (0.24 + (i % 2) * 0.20) * scale;
            const peb = new THREE.Mesh(A.pebbleGeo, A.matStoneDark);
            peb.position.set(Math.cos(ang) * r, 0.06, Math.sin(ang) * r);
            peb.scale.set(1.2 * scale, 0.55 * scale, 1.1 * scale);
            peb.receiveShadow = true;
            rubbleGroup.add(peb);
        }
        const rubbleHit = new THREE.Mesh(
            new THREE.CylinderGeometry(0.65 * scale, 0.70 * scale, 0.35, 7),
            A.matInvisible
        );
        rubbleHit.position.y = 0.16;
        rubbleGroup.add(rubbleHit);
        root.add(rubbleGroup);

        // Bloco principal da rocha minerável
        const boulderGroup = new THREE.Group();
        const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.84 * scale, 0), A.matStoneDark);
        mainRock.position.y = 0.54 * scale;
        mainRock.scale.set(1.18, 0.90, 1.06);
        mainRock.castShadow = true;
        mainRock.receiveShadow = true;
        boulderGroup.add(mainRock);

        const subRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.50 * scale, 0), A.matBasalt);
        subRock.position.set(0.50 * scale, 0.34 * scale, 0.26 * scale);
        subRock.castShadow = true;
        boulderGroup.add(subRock);

        // Cristais / veios visíveis de ferro, ouro ou quartzo
        if (info.speck) {
            const speckMat = getOreMat(oreKey);
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI * 2;
                const sp = new THREE.Mesh(A.crystalGeo, speckMat);
                sp.position.set(
                    Math.cos(ang) * 0.68 * scale,
                    (0.42 + (i % 3) * 0.22) * scale,
                    Math.sin(ang) * 0.64 * scale
                );
                sp.scale.setScalar(scale);
                sp.rotation.set(i, i * 0.6, 0);
                sp.castShadow = true;
                boulderGroup.add(sp);
            }
        }

        const hit = new THREE.Mesh(
            new THREE.CylinderGeometry(1.0 * scale, 1.1 * scale, 1.45 * scale, 7),
            A.matInvisible
        );
        hit.position.y = 0.70 * scale;
        boulderGroup.add(hit);
        root.add(boulderGroup);

        const rockObj = {
            id: opts.sourceNodeId || `mrock-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            x, y, z, scale, oreKey,
            root, boulderGroup, rubbleGroup,
            status: 'intact', // 'intact' | 'rubble'
            hp: info.hp,
            maxHp: info.hp,
            rubbleHp: 2,
            rubbleCleared: false,
            res: false,
            shakeTimer: 0
        };

        rubbleGroup.traverse(c => { if (c && c.userData) c.userData.miningRubbleRef = rockObj; });
        boulderGroup.traverse(c => { if (c && c.userData) c.userData.miningRockRef = rockObj; });
        rocksGroup.add(root);
        mState.rocks.push(rockObj);
        return rockObj;
    }

    function promoteChunkRock(resourceNode) {
        if (!resourceNode) return null;
        const existing = mState.rocks.find(r => r.id === resourceNode.id && !r.rubbleCleared);
        if (existing) return existing;

        const ry = getGroundY(resourceNode.x, resourceNode.z);
        let oreKey = 'granite';
        if (resourceNode.kind === 'mine') {
            oreKey = ry > 1.35 ? 'crystal' : 'gold';
        } else if (resourceNode.kind === 'iron') {
            oreKey = ((Math.abs(Math.round(resourceNode.x + resourceNode.z)) % 4) === 0) ? 'gold' : 'iron';
        } else if (ry > 1.5) {
            oreKey = 'crystal';
        }

        const rock = createPhysicalRock(resourceNode.x, resourceNode.z, {
            sourceNodeId: resourceNode.id,
            oreKey,
            scale: 0.96
        });
        if (MO.chunkManager && MO.chunkManager.harvestNode && resourceNode.amount > 0) {
            MO.chunkManager.harvestNode(resourceNode, resourceNode.amount, { silent: true, skipStump: true });
        }
        return rock;
    }

    function shatterRockToChunks(rock) {
        ensureGroups();
        const A = getSharedAssets();
        rock.status = 'rubble';
        rock.res = false;
        if (rock.boulderGroup) rock.boulderGroup.visible = false;

        const info = ORE_TYPES[rock.oreKey] || ORE_TYPES.granite;
        const chunkMat = info.speck ? getOreMat(rock.oreKey) : A.matStoneDark;
        const count = 4;

        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 0.55 + Math.random() * 0.42;
            const cx = rock.x + Math.cos(ang) * dist;
            const cz = rock.z + Math.sin(ang) * dist;
            const cy = getGroundY(cx, cz) + 0.48 + Math.random() * 0.22;

            const mesh = new THREE.Mesh(A.chunkGeo, chunkMat);
            mesh.position.set(cx, cy, cz);
            mesh.scale.set(1.15, 0.85, 1.05);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const chunkObj = {
                id: `mchunk-${Date.now()}-${i}-${Math.floor(Math.random() * 999)}`,
                x: cx,
                z: cz,
                oreKey: rock.oreKey,
                vy: 0.05 + Math.random() * 0.04,
                grounded: false,
                picked: false,
                res: false,
                mesh
            };
            mesh.userData.miningChunkRef = chunkObj;
            chunksGroup.add(mesh);
            mState.groundChunks.push(chunkObj);
        }

        if (MO.SoundFX && MO.SoundFX.playRockShatter) MO.SoundFX.playRockShatter();
        if (MO.spawnBurst) {
            MO.spawnBurst(rock.x, rock.y + 0.55, rock.z, info.color, 14, 0.13);
            if (info.speck) MO.spawnBurst(rock.x, rock.y + 0.65, rock.z, info.speck, 9, 0.11);
        }
        if (MO.showToast) {
            MO.showToast(`🪨 ${info.name} fraturado em 4 pedaços! Mineradores vão recolher para o Britador.`, '⛏️');
        }
    }

    function applyPickaxeHit(rock) {
        if (!rock || rock.status !== 'intact') return false;
        const info = ORE_TYPES[rock.oreKey] || ORE_TYPES.granite;
        rock.hp = Math.max(0, rock.hp - 1);
        rock.shakeTimer = 0.24;
        if (rock.boulderGroup && rock.boulderGroup.scale) {
            const ratio = Math.max(0.55, 0.55 + (rock.hp / rock.maxHp) * 0.45);
            rock.boulderGroup.scale.setScalar(ratio);
        }
        if (MO.SoundFX && MO.SoundFX.playPickaxeClink) MO.SoundFX.playPickaxeClink();
        if (MO.spawnBurst) {
            MO.spawnBurst(rock.x, rock.y + 0.52, rock.z, 0xfef08a, 4, 0.10);
            MO.spawnBurst(rock.x, rock.y + 0.48, rock.z, info.color, 6, 0.08);
        }
        if (rock.hp <= 0) {
            shatterRockToChunks(rock);
            return true;
        }
        return false;
    }

    function applyRubbleHit(rock) {
        if (!rock || rock.rubbleCleared) return false;
        rock.rubbleHp = Math.max(0, rock.rubbleHp - 1);
        if (rock.rubbleGroup && rock.rubbleGroup.scale) {
            rock.rubbleGroup.scale.setScalar(Math.max(0.4, rock.rubbleHp / 2));
        }
        if (MO.SoundFX && MO.SoundFX.playShovelScrape) MO.SoundFX.playShovelScrape();
        if (MO.spawnBurst) MO.spawnBurst(rock.x, rock.y + 0.15, rock.z, 0x78716c, 8, 0.08);
        if (rock.rubbleHp <= 0) {
            rock.rubbleCleared = true;
            rock.res = false;
            if (rocksGroup && rock.root) {
                if (MO.resources) MO.resources.removeAndDispose(rocksGroup, rock.root);
                else rocksGroup.remove(rock.root);
            }
            if (MO.showToast) MO.showToast('🧹 Entulho limpo! Área livre para novas obras ou prospecção.', '🪨');
            return true;
        }
        return false;
    }

    function consumeGroundChunk(chunkObj) {
        if (!chunkObj || chunkObj.picked) return false;
        chunkObj.picked = true;
        chunkObj.res = false;
        if (chunksGroup && chunkObj.mesh) {
            if (MO.resources) MO.resources.removeAndDispose(chunksGroup, chunkObj.mesh);
            else chunksGroup.remove(chunkObj.mesh);
        }
        return true;
    }

    function isValidRockSpot(x, z) {
        const y = getGroundY(x, z);
        if (y < (MO.WATER_LEVEL || -0.36) + 0.25 || y > 4.5) return false;
        if (MO.chunkManager && MO.chunkManager.isNearHighway && MO.chunkManager.isNearHighway(x, z, 2.5, MO.state?.seed)) return false;
        const city = MO.state && MO.state.city;
        if (city && city.roadTiles && city.roadTiles.has(`${Math.floor(x)},${Math.floor(z)}`)) return false;
        if (mState.crusher.placed && Math.hypot(x - mState.crusher.x, z - mState.crusher.z) < 2.8) return false;
        if (mState.depot.placed && Math.hypot(x - mState.depot.x, z - mState.depot.z) < 4.2) return false;
        if (mState.rocks.some(r => !r.rubbleCleared && Math.hypot(r.x - x, r.z - z) < 2.2)) return false;
        return true;
    }

    function prospectNewVeins(count = 4, centerPos = null) {
        ensureGroups();
        const cx = centerPos ? centerPos.x : ((MO.camOrbit && MO.camOrbit.target) ? MO.camOrbit.target.x : 0);
        const cz = centerPos ? centerPos.z : ((MO.camOrbit && MO.camOrbit.target) ? MO.camOrbit.target.z : 0);
        const orePool = ['granite', 'iron', 'iron', 'gold'];

        let added = 0;
        for (let attempt = 0; attempt < 55 && added < count; attempt++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 5.0 + Math.random() * 14.0;
            const rx = cx + Math.cos(ang) * dist;
            const rz = cz + Math.sin(ang) * dist;
            if (!isValidRockSpot(rx, rz)) continue;

            const ry = getGroundY(rx, rz);
            const oreKey = (ry > 1.30 && Math.random() < 0.55)
                ? 'crystal'
                : orePool[Math.floor(Math.random() * orePool.length)];
            createPhysicalRock(rx, rz, { scale: 0.90 + Math.random() * 0.26, oreKey });
            if (MO.spawnBurst) MO.spawnBurst(rx, ry + 0.5, rz, ORE_TYPES[oreKey].speck || 0xfacc15, 9, 0.08);
            added++;
        }

        if (added > 0) {
            if (MO.SoundFX && MO.SoundFX.playRockShatter) MO.SoundFX.playRockShatter();
            if (MO.showToast) MO.showToast(`🧭 ${added} novo(s) veio(s) mineral(is) prospectado(s)!`, '⛏️');
        } else if (MO.showToast) {
            MO.showToast('🪨 Região já está repleta de afloramentos!', '🪨');
        }
        return added;
    }

    // =========================================================================
    // 2. BRITADOR INDUSTRIAL (3 PEÇAS + SERRA DIAMANTADA + BARRA 3D)
    // =========================================================================
    function placeCrusher(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const cr = mState.crusher;

        if (MO.resources) MO.resources.clearGroup(crusherRoot);
        else while (crusherRoot.children.length > 0) crusherRoot.remove(crusherRoot.children[0]);

        cr.placed = true;
        cr.x = x;
        cr.z = z;
        cr.builtProgress = 0;
        cr.built = false;
        cr.busyWorkerId = null;
        cr.buildQueue = [];

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 2.2);
            MO.chunkManager.paintLevelArea(x, z, 2.1, 0.90, MO.PLATEAU_Y);
        }

        const cy = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        crusherRoot.position.set(x, cy, z);
        crusherRoot.rotation.y = 0.22;
        crusherRoot.userData = { miningCrusher: true };

        cr.stakes = createStakeOutline(1.9, 1.1, A.matStakeAmber);
        crusherRoot.add(cr.stakes);

        function addCrusherPiece(name, mesh) {
            mesh.visible = false;
            mesh.traverse(c => { if (c && c.userData) c.userData.miningCrusher = true; });
            crusherRoot.add(mesh);
            cr.buildQueue.push({ name, mesh, targetY: mesh.position.y, built: false });
        }

        // Peça 1: Plinto de Ancoragem
        const baseGrp = new THREE.Group();
        const lower = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.22, 1.08), A.matBasalt);
        lower.position.y = 0.11; lower.castShadow = true; lower.receiveShadow = true;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.16, 0.90), A.matStoneMasonry);
        upper.position.y = 0.30; upper.castShadow = true;
        baseGrp.add(lower, upper);
        addCrusherPiece('Plinto de Ancoragem', baseGrp);

        // Peça 2: Chassi Industrial + Faixa de Segurança
        const frameGrp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 0.78), A.matSteelDark);
        body.position.y = 0.59; body.castShadow = true;
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.08, 0.90), A.matSteel);
        table.position.y = 0.84; table.castShadow = true;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 0.81), A.matIndustrialYellow);
        stripe.position.y = 0.44;
        frameGrp.add(body, table, stripe);
        addCrusherPiece('Chassi Industrial', frameGrp);

        // Peça 3: Pórtico da Serra Diamantada
        const sawRig = new THREE.Group();
        const pL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.64, 0.11), A.matSteelDark);
        pL.position.set(-0.56, 1.18, -0.32);
        const pR = pL.clone(); pR.position.x = 0.56;
        const barTop = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.11, 0.14), A.matIndustrialYellow);
        barTop.position.set(0, 1.48, -0.32);
        const motor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.24), A.matSteelDark);
        motor.position.set(0.76, 0.66, 0);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14), A.matSteel);
        disc.rotation.z = Math.PI / 2;
        disc.position.set(0, 1.14, -0.04);
        cr.sawDiscMesh = disc;
        sawRig.add(pL, pR, barTop, motor, disc);
        addCrusherPiece('Serra Diamantada', sawRig);

        // Rocha bruta + bloco talhado + barra de progresso 3D
        cr.rawRockMesh = new THREE.Mesh(A.chunkGeo, A.matStoneDark);
        cr.rawRockMesh.position.set(0, 1.06, 0.06);
        cr.rawRockMesh.visible = false;
        cr.cutBlockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.26, 0.28), A.matStoneCut);
        cr.cutBlockMesh.position.set(0, 1.01, 0.06);
        cr.cutBlockMesh.visible = false;
        cr.progressBarBg = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.10, 0.03), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
        cr.progressBarBg.position.set(0, 1.76, 0);
        cr.progressBarBg.visible = false;
        cr.progressBarFill = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
        cr.progressBarFill.position.set(0, 1.76, 0.01);
        cr.progressBarFill.visible = false;
        crusherRoot.add(cr.rawRockMesh, cr.cutBlockMesh, cr.progressBarBg, cr.progressBarFill);

        const preBuilt = opts.instantBuilt ? cr.buildQueue.length : Math.min(cr.buildQueue.length, opts.builtProgress || 0);
        for (let i = 0; i < preBuilt; i++) {
            cr.buildQueue[i].built = true;
            cr.buildQueue[i].mesh.visible = true;
        }
        cr.builtProgress = preBuilt;
        if (cr.builtProgress >= cr.buildQueue.length) {
            cr.built = true;
            if (cr.stakes) cr.stakes.visible = false;
        }

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
            if (MO.spawnBurst) MO.spawnBurst(x, cy + 0.3, z, 0xf59e0b, 12, 0.08);
            if (MO.showToast) MO.showToast('⚙️ Local do Britador marcado! Mineradores trarão 3 pedras para montá-lo.', '📐');
        }
        syncMiningUI();
        return cr;
    }

    function getNextCrusherPiece() {
        if (!mState.crusher.placed || mState.crusher.built) return null;
        return mState.crusher.buildQueue.find(p => !p.built) || null;
    }

    function installNextCrusherPiece(worker = null) {
        const cr = mState.crusher;
        const piece = getNextCrusherPiece();
        if (!piece) return null;

        piece.built = true;
        piece.mesh.visible = true;
        cr.builtProgress++;
        mState.animatingPieces.push({ piece, progress: 0 });
        if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
        if (MO.spawnBurst) MO.spawnBurst(cr.x, getGroundY(cr.x, cr.z) + 0.8, cr.z, 0xf59e0b, 10, 0.08);
        if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) {
            MO.workerFactory.awardWorkerExperience(worker, 6, 2);
        }

        if (cr.builtProgress >= cr.buildQueue.length) {
            cr.built = true;
            if (cr.stakes) cr.stakes.visible = false;
            if (MO.economyManager && MO.economyManager.logJournal) {
                MO.economyManager.logJournal('⚙️', 'Britador Industrial concluído', 'Pronto para talhar blocos e refinar minérios');
            }
            if (MO.showToast) MO.showToast('⚙️ Britador pronto! Pedras serão lapidadas em blocos e lingotes.', '⚙️');
        } else if (MO.showToast) {
            MO.showToast(`⚙️ Britador: ${piece.name} (${cr.builtProgress}/${cr.buildQueue.length})`, '🔨');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncMiningUI();
        return piece;
    }

    function animateCrusher(active, dt, progress = null) {
        const cr = mState.crusher;
        if (!cr.placed) return;
        if (cr.rawRockMesh) cr.rawRockMesh.visible = Boolean(active);
        if (cr.sawDiscMesh && active) cr.sawDiscMesh.rotation.x += dt * 18;
        if (cr.progressBarBg && cr.progressBarFill) {
            const show = Boolean(active && typeof progress === 'number');
            cr.progressBarBg.visible = show;
            cr.progressBarFill.visible = show;
            if (show) {
                const p = Math.max(0.02, Math.min(1, progress));
                cr.progressBarFill.scale.x = p;
                cr.progressBarFill.position.x = -0.49 * (1 - p);
                if (MO.camera && cr.progressBarBg.lookAt) {
                    cr.progressBarBg.lookAt(MO.camera.position);
                    cr.progressBarFill.lookAt(MO.camera.position);
                }
            }
        }
    }

    // =========================================================================
    // 3. GALPÃO DE PEDRA & FUNDIÇÃO (16 PEÇAS INDUSTRIAIS + 12 EXPOSITORES)
    // =========================================================================
    function placeDepot(x, z, opts = {}) {
        ensureGroups();
        const A = getSharedAssets();
        const dp = mState.depot;

        if (MO.resources) MO.resources.clearGroup(depotRoot);
        else while (depotRoot.children.length > 0) depotRoot.remove(depotRoot.children[0]);

        dp.placed = true;
        dp.x = x;
        dp.z = z;
        dp.builtProgress = 0;
        dp.completed = false;
        dp.buildQueue = [];
        dp.displaySlots = [];
        dp.displayedMinerals = [];
        dp.lanternLight = null;
        dp.lanternBulbMat = null;
        dp.furnaceLight = null;
        dp.chimneyTopWorld = null;

        if (MO.chunkManager) {
            MO.chunkManager.clearNatureInArea(x, z, 3.3);
            MO.chunkManager.paintLevelArea(x, z, 3.2, 0.92, MO.PLATEAU_Y);
        }

        const dy = Math.max((MO.WATER_LEVEL || -0.36) + 0.16, getGroundY(x, z));
        depotRoot.position.set(x, dy, z);
        depotRoot.rotation.y = -0.35;
        depotRoot.userData = { miningDepot: true };

        dp.stakes = createStakeOutline(4.3, 3.3, A.matStakeBlue);
        depotRoot.add(dp.stakes);

        function addDepotPiece(name, mesh, lx, ly, lz) {
            mesh.position.set(lx, ly, lz);
            mesh.traverse(c => {
                if (c && c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
                if (c && c.userData) c.userData.miningDepot = true;
            });
            mesh.visible = false;
            depotRoot.add(mesh);

            const cosR = Math.cos(depotRoot.rotation.y);
            const sinR = Math.sin(depotRoot.rotation.y);
            const wx = x + (lx * cosR + lz * sinR);
            const wz = z + (-lx * sinR + lz * cosR);

            dp.buildQueue.push({
                name,
                mesh,
                targetY: ly,
                worldX: wx,
                worldZ: wz,
                built: false
            });
        }

        function createSteelHColumn() {
            const g = new THREE.Group();
            const ped = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), A.matBasalt);
            ped.position.y = -0.96;
            const web = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.05, 0.16), A.matSteelDark);
            web.position.y = 0.22;
            const flL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.05, 0.04), A.matSteelDark);
            flL.position.set(0, 0.22, -0.09);
            const flR = flL.clone(); flR.position.z = 0.09;
            g.add(ped, web, flL, flR);
            return g;
        }

        // 1-4: Fundação em 4 Quadrantes Maciços de Basalto e Cantaria
        [
            ['Fundação Noroeste', -1.01, 0.11, -0.76],
            ['Fundação Nordeste',  1.01, 0.11, -0.76],
            ['Pátio Sudoeste',    -1.01, 0.11,  0.76],
            ['Pátio Sudeste',      1.01, 0.11,  0.76]
        ].forEach(([lbl, qx, qy, qz]) => {
            const qGrp = new THREE.Group();
            const low = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.12, 1.54), A.matBasalt);
            low.position.y = -0.05;
            const up = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 1.48), A.matStoneMasonry);
            up.position.y = 0.02;
            qGrp.add(low, up);
            addDepotPiece(lbl, qGrp, qx, qy, qz);
        });

        // 5-7: Embasamento Pesado de Pedra Talhada
        const backBase = new THREE.Group();
        backBase.add(
            new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.95, 0.32), A.matStoneMasonry),
            Object.assign(new THREE.Mesh(new THREE.BoxGeometry(3.92, 0.09, 0.38), A.matStoneLight), { position: new THREE.Vector3(0, 0.50, 0) })
        );
        addDepotPiece('Embasamento Fundo', backBase, 0, 0.70, -1.32);

        const leftBase = new THREE.Group();
        leftBase.add(
            new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.95, 2.52), A.matStoneMasonry),
            Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 2.60), A.matStoneLight), { position: new THREE.Vector3(0, 0.50, 0) })
        );
        addDepotPiece('Embasamento Esquerdo', leftBase, -1.84, 0.70, 0);

        const rightBase = new THREE.Group();
        rightBase.add(
            new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.82, 2.40), A.matStoneMasonry),
            Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 2.48), A.matStoneLight), { position: new THREE.Vector3(0, 0.44, 0) })
        );
        addDepotPiece('Mureta de Contenção', rightBase, 1.84, 0.64, 0);

        // 8-11: 4 Pilares de Aço Perfil-H
        [[-1.84, -1.32, 'NO'], [1.84, -1.32, 'NE'], [-1.84, 1.32, 'SO'], [1.84, 1.32, 'SE']].forEach(([cx, cz, lbl]) => {
            addDepotPiece(`Pilar Metálico ${lbl}`, createSteelHColumn(), cx, 1.36, cz);
        });

        // 12: Alvenaria Superior com Grade Industrial
        const upperWalls = new THREE.Group();
        const buL = new THREE.Mesh(new THREE.BoxGeometry(1.20, 1.18, 0.26), A.matStoneCut); buL.position.set(-1.26, 0, -1.32);
        const buR = buL.clone(); buR.position.x = 1.26;
        const buTop = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.34, 0.28), A.matStoneCut); buTop.position.set(0, 0.46, -1.32);
        const sideW = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.18, 2.40), A.matStoneCut); sideW.position.set(-1.84, 0, 0);
        upperWalls.add(buL, buR, buTop, sideW);
        for (let b = -2; b <= 2; b++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6), A.matSteelDark);
            bar.position.set(b * 0.24, -0.02, -1.32);
            upperWalls.add(bar);
        }
        addDepotPiece('Alvenaria Superior e Grades', upperWalls, 0, 1.82, 0);

        // 13: Fornalha e Chaminé de Pedra
        const chimneyGrp = new THREE.Group();
        const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.05, 0.82), A.matStoneMasonry);
        hearth.position.y = 0.52;
        const glowMouth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.08), A.matFurnaceGlow);
        glowMouth.position.set(0, 0.42, 0.40);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 2.35, 6), A.matStoneCut);
        shaft.position.y = 2.15;
        const rimCap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.26, 0.14, 6), A.matBasalt);
        rimCap.position.y = 3.36;
        const fLight = new THREE.PointLight(0xfb923c, 0, 5.5);
        fLight.position.set(0, 0.45, 0.65);
        dp.furnaceLight = fLight;
        chimneyGrp.add(hearth, glowMouth, shaft, rimCap, fLight);
        addDepotPiece('Fornalha e Chaminé', chimneyGrp, -1.32, 0.22, -0.82);

        const cosR = Math.cos(depotRoot.rotation.y);
        const sinR = Math.sin(depotRoot.rotation.y);
        dp.chimneyTopWorld = {
            x: x + (-1.32 * cosR + -0.82 * sinR),
            y: dy + 3.65,
            z: z + (1.32 * sinR + -0.82 * cosR)
        };

        // 14: Balcão com Balança + Bancadas de Exposição
        const furnGrp = new THREE.Group();
        const cBase = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.74, 0.54), A.matStoneMasonry);
        cBase.position.set(-0.86, 0.37, 0.94);
        const cTop = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.09, 0.62), A.matBasalt);
        cTop.position.set(-0.86, 0.77, 0.94);
        const scalePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.06, 10), A.matIndustrialYellow);
        scalePlate.position.set(-0.30, 0.85, 0.94);
        const rbBase = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.50, 0.56), A.matSteelDark);
        rbBase.position.set(0.36, 0.25, -0.78);
        const rbTop = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.08, 0.62), A.matStoneLight);
        rbTop.position.set(0.36, 0.53, -0.78);
        const rsBase = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.50, 1.44), A.matSteelDark);
        rsBase.position.set(1.24, 0.25, 0.32);
        const rsTop = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.08, 1.50), A.matStoneLight);
        rsTop.position.set(1.24, 0.53, 0.32);
        furnGrp.add(cBase, cTop, scalePlate, rbBase, rbTop, rsBase, rsTop);
        addDepotPiece('Balcão, Balança e Expositores', furnGrp, 0, 0.22, 0);

        // 15: Pórtico de Aço e Letreiro PEDREIRA & FUNDIÇÃO
        const signGrp = new THREE.Group();
        const girder = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.18, 0.18), A.matSteelDark);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(3.98, 0.05, 0.20), A.matIndustrialYellow);
        trim.position.y = -0.09;
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.70, 0.54, 0.09), A.matSign);
        board.position.set(0, 0.22, 0.08);
        const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.6 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), bulbMat);
        bulb.position.set(1.52, -0.14, 0.18);
        const lLight = new THREE.PointLight(0xffd28a, 0, 8.5);
        lLight.position.set(0, -0.35, 0.75);
        dp.lanternLight = lLight;
        dp.lanternBulbMat = bulbMat;
        signGrp.add(girder, trim, board, bulb, lLight);
        addDepotPiece('Pórtico de Aço e Letreiro', signGrp, 0, 2.48, 1.36);

        // 16: Cobertura Metálica Industrial, Platibanda e Claraboia
        const roofGrp = new THREE.Group();
        const pBack = new THREE.Mesh(new THREE.BoxGeometry(4.12, 0.30, 0.22), A.matStoneMasonry); pBack.position.set(0, 0.08, -1.36);
        const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 2.94), A.matStoneMasonry); pLeft.position.set(-1.95, 0.08, 0);
        const pRight = pLeft.clone(); pRight.position.x = 1.95;
        const deckBack = new THREE.Mesh(new THREE.BoxGeometry(3.74, 0.08, 0.96), A.matRoofMetal); deckBack.position.set(0, 0.06, -0.82);
        const deckFront = new THREE.Mesh(new THREE.BoxGeometry(3.74, 0.08, 0.96), A.matRoofMetal); deckFront.position.set(0, 0.06, 0.82);
        const skyFrame = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.22, 0.84), A.matSteelDark); skyFrame.position.set(0, 0.16, 0);
        const skyGlass = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.05, 0.68), A.matSkylightGlass); skyGlass.position.set(0, 0.28, 0);
        roofGrp.add(pBack, pLeft, pRight, deckBack, deckFront, skyFrame, skyGlass);
        addDepotPiece('Cobertura Industrial e Claraboia', roofGrp, 0, 2.62, 0);

        // 12 Slots de exposição sobre as bancadas e o balcão
        for (let i = 0; i < 6; i++) dp.displaySlots.push({ x: -0.64 + i * 0.40, y: 0.85, z: -0.78 });
        for (let i = 0; i < 3; i++) dp.displaySlots.push({ x: 1.24, y: 0.85, z: -0.14 + i * 0.46 });
        for (let i = 0; i < 3; i++) dp.displaySlots.push({ x: -1.36 + i * 0.40, y: 1.09, z: 0.94 });

        const preBuilt = opts.instantBuilt ? dp.buildQueue.length : Math.min(dp.buildQueue.length, opts.builtProgress || 0);
        for (let i = 0; i < preBuilt; i++) {
            dp.buildQueue[i].built = true;
            dp.buildQueue[i].mesh.visible = true;
        }
        dp.builtProgress = preBuilt;
        if (dp.builtProgress >= dp.buildQueue.length) {
            dp.completed = true;
            if (dp.stakes) dp.stakes.visible = false;
            if (dp.lanternLight) dp.lanternLight.intensity = MO.state?.isNight ? 2.1 : 0.7;
            if (dp.furnaceLight) dp.furnaceLight.intensity = 1.4;
        }
        if (Array.isArray(opts.displayedOres)) {
            opts.displayedOres.forEach(ok => deliverDisplayMineral(ok, { silent: true }));
        }

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
            if (MO.spawnBurst) MO.spawnBurst(x, dy + 0.3, z, 0x38bdf8, 14, 0.09);
            if (MO.showToast) MO.showToast('🏛️ Terreno da Fundição/Depósito marcado! Mineradores vão erguê-la peça por peça.', '📐');
        }
        syncMiningUI();
        return dp;
    }

    function getNextDepotPiece() {
        if (!mState.depot.placed || mState.depot.completed) return null;
        return mState.depot.buildQueue.find(p => !p.built) || null;
    }

    function installNextDepotPiece(worker = null) {
        const dp = mState.depot;
        const piece = getNextDepotPiece();
        if (!piece) return null;

        piece.built = true;
        piece.mesh.visible = true;
        dp.builtProgress++;
        mState.animatingPieces.push({ piece, progress: 0 });

        if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
        if (MO.spawnBurst) MO.spawnBurst(piece.worldX, getGroundY(piece.worldX, piece.worldZ) + piece.targetY, piece.worldZ, 0x94a3b8, 10, 0.08);
        if (worker && MO.workerFactory && MO.workerFactory.awardWorkerExperience) {
            MO.workerFactory.awardWorkerExperience(worker, 6, 2);
        }

        if (dp.builtProgress >= dp.buildQueue.length) {
            dp.completed = true;
            if (dp.stakes) dp.stakes.visible = false;
            if (dp.lanternLight) dp.lanternLight.intensity = MO.state?.isNight ? 2.1 : 0.7;
            if (dp.furnaceLight) dp.furnaceLight.intensity = 1.4;
            if (worker) {
                worker.celebrateTimer = 2.0;
                if (MO.workerFactory && MO.workerFactory.rememberWorkerEvent) {
                    MO.workerFactory.rememberWorkerEvent(worker, 'Inaugurou a Fundição & Pedreira');
                }
            }
            if (MO.economyManager && MO.economyManager.logJournal) {
                MO.economyManager.logJournal('🏛️', 'Pedreira & Fundição inaugurada!', 'Pronta para expor e exportar blocos e lingotes');
            }
            if (MO.showToast) MO.showToast('🏆 Galpão de Pedra & Fundição inaugurado! Minérios serão expostos para venda.', '🏛️');
        } else if (MO.showToast) {
            MO.showToast(`🏛️ Fundição: ${piece.name} (${dp.builtProgress}/${dp.buildQueue.length})`, '🏗️');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncMiningUI();
        return piece;
    }

    function deliverDisplayMineral(oreKey = 'granite', opts = {}) {
        const dp = mState.depot;
        if (!dp.placed || !dp.completed) return false;
        if (dp.displayedMinerals.length >= MAX_DISPLAY_ITEMS) {
            if (!opts.silent && MO.showToast) {
                MO.showToast('💎 Expositores da Fundição cheios (12/12)! Clique em 💰 Minérios para vender.', '💰');
            }
            return false;
        }
        const slot = dp.displaySlots[dp.displayedMinerals.length];
        if (!slot) return false;
        const A = getSharedAssets();
        const info = ORE_TYPES[oreKey] || ORE_TYPES.granite;

        const bundle = new THREE.Group();
        if (oreKey === 'granite') {
            for (let i = 0; i < 2; i++) {
                const blk = new THREE.Mesh(A.graniteBlockGeo, A.matStoneCut);
                blk.position.set(0, i * 0.125, 0);
                blk.rotation.y = i * 0.12;
                blk.castShadow = true;
                bundle.add(blk);
            }
        } else {
            const mat = getOreMat(oreKey);
            for (let i = 0; i < 3; i++) {
                const bar = new THREE.Mesh(A.ingotGeo, mat);
                bar.position.set(i === 2 ? 0 : (i === 0 ? -0.07 : 0.07), i === 2 ? 0.085 : 0, 0);
                bar.castShadow = true;
                bundle.add(bar);
            }
        }
        bundle.position.set(slot.x, slot.y, slot.z);
        bundle.userData = { miningDepot: true };
        depotRoot.add(bundle);
        dp.displayedMinerals.push({ mesh: bundle, oreKey, value: info.value, name: info.name });

        if (!opts.silent) {
            if (MO.SoundFX && MO.SoundFX.playStonePlace) MO.SoundFX.playStonePlace();
            if (MO.showToast) MO.showToast(`💎 ${info.name} exposto na Fundição (${dp.displayedMinerals.length}/${MAX_DISPLAY_ITEMS})!`, '🏛️');
            if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        }
        syncMiningUI();
        return true;
    }

    function isDepotConnectedToHighway() {
        const dp = mState.depot;
        const state = MO.state;
        const cm = MO.chunkManager;
        if (!dp.placed || !state || !state.city || !state.city.roadTiles || !cm || !cm.isNearHighway) return false;

        let startTile = null;
        let bestD = Infinity;
        const builtMap = new Map();
        state.city.roadTiles.forEach((tile, key) => {
            if (!tile || !tile.built) return;
            builtMap.set(key, tile);
            const d = Math.hypot(tile.x - dp.x, tile.z - dp.z);
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

    function sellDisplayedMinerals(opts = {}) {
        const dp = mState.depot;
        if (!dp.placed || dp.displayedMinerals.length === 0) return { soldCount: 0, earned: 0, highwayBonus: false };

        const count = opts.single ? 1 : dp.displayedMinerals.length;
        const highwayBonus = isDepotConnectedToHighway();
        let rawCoins = 0;

        for (let i = 0; i < count; i++) {
            const item = dp.displayedMinerals.pop();
            if (!item) break;
            if (depotRoot && item.mesh) {
                if (MO.resources) MO.resources.removeAndDispose(depotRoot, item.mesh);
                else depotRoot.remove(item.mesh);
            }
            rawCoins += item.value || 10;
        }

        const earned = Math.round(rawCoins * (highwayBonus ? HIGHWAY_EXPORT_MULT : 1.0));
        mState.totalSoldLots += count;
        mState.totalSalesCoins += earned;

        if (MO.cityManager && MO.cityManager.addResources) {
            MO.cityManager.addResources({ coins: earned });
        }
        if (MO.SoundFX && MO.SoundFX.playCashRegister) MO.SoundFX.playCashRegister();
        if (MO.spawnBurst) MO.spawnBurst(dp.x, getGroundY(dp.x, dp.z) + 1.4, dp.z, 0x34d399, 16, 0.11);
        if (MO.economyManager && MO.economyManager.logJournal) {
            const bTxt = highwayBonus ? ' (com +35% Bônus Rodovia!)' : '';
            MO.economyManager.logJournal('💎', `Venda na Fundição (+${earned}🪙)`, `${count} lote(s) mineral(is) vendido(s)${bTxt}`);
        }
        if (!opts.silent && MO.showToast) {
            const tag = highwayBonus ? ' · +35% Bônus Rodovia 🛣️' : '';
            MO.showToast(`💰 Vendido ${count} lote(s) de minérios por +${earned}🪙${tag}!`, '💎');
        }
        if (MO.cityManager && MO.cityManager.saveCityState) MO.cityManager.saveCityState();
        syncMiningUI();
        return { soldCount: count, earned, highwayBonus };
    }

    // =========================================================================
    // 4. INTERAÇÃO DIRETA POR CLIQUE EM ROCHAS, PEDAÇOS, ENTULHO & INSTALAÇÕES
    // =========================================================================
    function findBestMiner(nearX, nearZ) {
        const workers = (MO.state && Array.isArray(MO.state.workers)) ? MO.state.workers : [];
        const miners = workers.filter(w => !w.sleepingInside && (w.role === 'miner' || w.specialty === 'miner'));
        const pool = miners.length > 0 ? miners : workers.filter(w => !w.sleepingInside && w.role !== 'supervisor');
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

    function dispatchMinerCommand(kind, target) {
        const tx = target ? target.x : 0;
        const tz = target ? target.z : 0;
        const w = findBestMiner(tx, tz);
        if (!w) {
            if (MO.showToast) MO.showToast('⛏️ Contrate um Mineiro no Celular (📱) para operar a pedreira!', '⛏️');
            return false;
        }
        if (w.task && MO.workerTasks && MO.workerTasks.releaseTaskReservations) {
            MO.workerTasks.releaseTaskReservations(w.task);
        }
        const setDest = MO.workerTasks.setDestination;
        const setTool = MO.workerFactory.setWorkerTool;

        if (kind === 'mine-rock') {
            target.res = true;
            w.task = { type: 'harvest-ore', miningRock: target, duration: 1.5, subPhase: 'work' };
            setDest(w, target.x + 0.95, target.z + 0.55);
            setTool(w.rig, 'pickaxe');
            w.rig.setBadge('⛏️');
            w.statusText = `Minerando ${(ORE_TYPES[target.oreKey] || ORE_TYPES.granite).name}`;
            if (MO.showToast) MO.showToast(`⛏️ ${w.name} indo minerar ${(ORE_TYPES[target.oreKey] || ORE_TYPES.granite).name}!`, '🪨');
            return true;
        }
        if (kind === 'pickup-chunk') {
            target.res = true;
            w.task = { type: 'haul-chunk', miningChunk: target, duration: 0.35, subPhase: 'pickup' };
            setDest(w, target.x, target.z);
            setTool(w.rig, 'none');
            w.rig.setBadge('🪨');
            w.statusText = 'Recolhendo pedra fraturada';
            if (MO.showToast) MO.showToast(`🪨 ${w.name} indo recolher minério no chão!`, '🪨');
            return true;
        }
        if (kind === 'clear-rubble') {
            target.res = true;
            w.task = { type: 'clear-rubble', miningRock: target, duration: 1.0, subPhase: 'work' };
            setDest(w, target.x + 0.72, target.z + 0.35);
            setTool(w.rig, 'hoe');
            w.rig.setBadge('🧹');
            w.statusText = 'Limpando entulho da pedreira';
            if (MO.showToast) MO.showToast(`🧹 ${w.name} indo limpar entulho!`, '🪨');
            return true;
        }
        return false;
    }

    function handleWorldClick(raycaster, terrainPoint = null) {
        if (!miningGroup || !raycaster) return false;

        // 1. Clique em pedaço de pedra solto no chão
        const chHits = chunksGroup ? raycaster.intersectObjects(chunksGroup.children, true) : [];
        if (chHits.length > 0 && chHits[0].object.userData.miningChunkRef) {
            const ch = chHits[0].object.userData.miningChunkRef;
            if (!ch.picked) return dispatchMinerCommand('pickup-chunk', ch);
        }

        // 2. Clique em rocha física intacta ou entulho
        const rHits = rocksGroup ? raycaster.intersectObjects(rocksGroup.children, true) : [];
        if (rHits.length > 0) {
            const ud = rHits[0].object.userData || {};
            if (ud.miningRockRef && ud.miningRockRef.status === 'intact') {
                return dispatchMinerCommand('mine-rock', ud.miningRockRef);
            }
            if (ud.miningRubbleRef && ud.miningRubbleRef.status === 'rubble' && !ud.miningRubbleRef.rubbleCleared) {
                return dispatchMinerCommand('clear-rubble', ud.miningRubbleRef);
            }
        }

        // 3. Clique no Britador
        const crHits = crusherRoot ? raycaster.intersectObjects(crusherRoot.children, true) : [];
        if (crHits.length > 0) {
            const cr = mState.crusher;
            if (!cr.built) {
                const rem = cr.buildQueue.length - cr.builtProgress;
                if (MO.showToast) MO.showToast(`⚙️ Britador em obra: faltam ${rem} pedra(s) bruta(s)!`, '⚙️');
            } else if (MO.showToast) {
                MO.showToast('⚙️ Britador pronto! Corta pedras em blocos de cantaria e lingotes.', '⚙️');
            }
            return true;
        }

        // 4. Clique na Fundição / Depósito
        const dpHits = depotRoot ? raycaster.intersectObjects(depotRoot.children, true) : [];
        if (dpHits.length > 0) {
            const dp = mState.depot;
            if (!dp.completed) {
                const rem = dp.buildQueue.length - dp.builtProgress;
                if (MO.showToast) MO.showToast(`🏛️ Fundição em obra: faltam ${rem} blocos cortados do Britador!`, '🏗️');
            } else if (dp.displayedMinerals.length > 0) {
                sellDisplayedMinerals();
            } else if (MO.showToast) {
                const hwStr = isDepotConnectedToHighway() ? ' · Bônus Rodovia +35% ATIVO 🛣️' : ' · Ligue à Rodovia para +35%!';
                MO.showToast(`🏛️ Fundição aberta (0/${MAX_DISPLAY_ITEMS} lotes)${hwStr}`, '💎');
            }
            return true;
        }

        // 5. Clique próximo a qualquer rocha/mina natural do chunk -> promove e minera!
        if (terrainPoint && MO.chunkManager && MO.chunkManager.getLoadedResourceNodes) {
            const oreNodes = MO.chunkManager.getLoadedResourceNodes().filter(
                n => n.kind === 'stone' || n.kind === 'iron' || n.kind === 'mine'
            );
            let nearest = null;
            let bestD = 1.5;
            for (let i = 0; i < oreNodes.length; i++) {
                const n = oreNodes[i];
                const d = Math.hypot(n.x - terrainPoint.x, n.z - terrainPoint.z);
                if (d < bestD) { bestD = d; nearest = n; }
            }
            if (nearest) {
                const physRock = promoteChunkRock(nearest);
                if (physRock) return dispatchMinerCommand('mine-rock', physRock);
            }
        }

        return false;
    }

    // =========================================================================
    // 5. FÍSICA DE VIBRAÇÃO, GRAVIDADE, ENCAIXE & FUMAÇA DA CHAMINÉ
    // =========================================================================
    function update(dt) {
        if (!miningGroup) return;
        const isNight = Boolean(MO.state && MO.state.isNight);
        const dp = mState.depot;
        if (dp.completed && dp.lanternLight) {
            dp.lanternLight.intensity = isNight ? 2.2 : 0.55;
            if (dp.lanternBulbMat) dp.lanternBulbMat.emissiveIntensity = isNight ? 2.2 : 0.6;
            if (dp.furnaceLight) dp.furnaceLight.intensity = isNight ? 1.8 : 1.1;
        }

        // 1. Vibração das rochas ao receberem golpes
        for (let i = 0; i < mState.rocks.length; i++) {
            const r = mState.rocks[i];
            if (r.shakeTimer > 0 && r.boulderGroup) {
                r.shakeTimer -= dt;
                r.boulderGroup.position.x = Math.sin(r.shakeTimer * 60) * 0.05;
                if (r.shakeTimer <= 0) r.boulderGroup.position.x = 0;
            }
        }

        // 2. Gravidade nos pedaços fraturados
        for (let i = 0; i < mState.groundChunks.length; i++) {
            const c = mState.groundChunks[i];
            if (c.picked || c.grounded) continue;
            c.vy -= 0.015;
            c.mesh.position.y += c.vy;
            const floorY = getGroundY(c.x, c.z) + 0.16;
            if (c.mesh.position.y <= floorY) {
                c.mesh.position.y = floorY;
                if (Math.abs(c.vy) > 0.04) c.vy = -c.vy * 0.28;
                else { c.vy = 0; c.grounded = true; }
            }
        }

        // 3. Animação de encaixe das peças do Britador e da Fundição
        for (let i = mState.animatingPieces.length - 1; i >= 0; i--) {
            const ap = mState.animatingPieces[i];
            ap.progress = Math.min(1, ap.progress + dt * 3.8);
            const ease = 1 - Math.pow(1 - ap.progress, 3);
            ap.piece.mesh.position.y = ap.piece.targetY + (1 - ease) * 0.44;
            ap.piece.mesh.scale.setScalar(0.84 + 0.16 * ease);
            if (ap.progress >= 1) {
                ap.piece.mesh.position.y = ap.piece.targetY;
                ap.piece.mesh.scale.setScalar(1);
                mState.animatingPieces.splice(i, 1);
            }
        }

        // 4. Fumaça sutil saindo da chaminé de pedra após a Fundição ficar pronta
        if (dp.completed && dp.chimneyTopWorld && smokeGroup && mState.smokeParticles.length < 10 && Math.random() < 0.06) {
            const A = getSharedAssets();
            const ch = dp.chimneyTopWorld;
            const sm = new THREE.Mesh(A.smokeGeo, A.matSmoke);
            sm.position.set(ch.x + (Math.random() - 0.5) * 0.1, ch.y, ch.z + (Math.random() - 0.5) * 0.1);
            smokeGroup.add(sm);
            mState.smokeParticles.push({
                mesh: sm,
                vx: (Math.random() - 0.5) * 0.008,
                vy: 0.018 + Math.random() * 0.01,
                vz: (Math.random() - 0.5) * 0.008,
                life: 1.0
            });
        }
        for (let i = mState.smokeParticles.length - 1; i >= 0; i--) {
            const p = mState.smokeParticles[i];
            p.life -= 0.018;
            p.mesh.position.x += p.vx;
            p.mesh.position.y += p.vy;
            p.mesh.position.z += p.vz;
            p.mesh.scale.setScalar(1.35 - p.life * 0.55);
            if (p.life <= 0) {
                if (MO.resources) MO.resources.removeAndDispose(smokeGroup, p.mesh);
                else smokeGroup.remove(p.mesh);
                mState.smokeParticles.splice(i, 1);
            }
        }
    }

    // =========================================================================
    // 6. UI SYNC, TOGGLE AUTO/MANUAL, RESET & SERIALIZAÇÃO
    // =========================================================================
    function toggleAutoMode(forceVal) {
        mState.autoMode = (typeof forceVal === 'boolean') ? forceVal : !mState.autoMode;
        syncMiningUI();
        if (MO.showToast) {
            MO.showToast(
                mState.autoMode
                    ? '🤖 Mineração Automática ATIVA: mineradores extraem, britam e erguem a Fundição!'
                    : '🎯 Mineração Manual: clique diretamente em rochas, pedras fraturadas ou entulho!',
                mState.autoMode ? '🤖' : '⛏️'
            );
        }
        return mState.autoMode;
    }

    function syncMiningUI() {
        if (typeof document === 'undefined') return;
        const dp = mState.depot;
        const sellBtn = document.getElementById('btn-sell-minerals');
        const sellLbl = document.getElementById('minerals-sell-label');
        if (sellBtn) {
            sellBtn.disabled = dp.displayedMinerals.length === 0;
            sellBtn.classList.toggle('opacity-40', dp.displayedMinerals.length === 0);
        }
        if (sellLbl) {
            if (!dp.placed) sellLbl.textContent = 'Minérios (0/12)';
            else if (!dp.completed) sellLbl.textContent = `Obra ${dp.builtProgress}/${dp.buildQueue.length}`;
            else sellLbl.textContent = `Minérios (${dp.displayedMinerals.length}/${MAX_DISPLAY_ITEMS})`;
        }
        const autoBtn = document.getElementById('btn-mining-auto');
        const autoLbl = document.getElementById('mining-auto-label');
        if (autoBtn) autoBtn.classList.toggle('active', mState.autoMode);
        if (autoLbl) autoLbl.textContent = mState.autoMode ? 'Auto: ON' : 'Manual';
    }

    function reset() {
        ensureGroups();
        if (MO.resources) {
            MO.resources.clearGroup(rocksGroup);
            MO.resources.clearGroup(chunksGroup);
            MO.resources.clearGroup(crusherRoot);
            MO.resources.clearGroup(depotRoot);
            MO.resources.clearGroup(smokeGroup);
        }
        mState.rocks = [];
        mState.groundChunks = [];
        mState.animatingPieces = [];
        mState.smokeParticles = [];
        mState.totalSoldLots = 0;
        mState.totalSalesCoins = 0;
        mState.crusher = {
            placed: false, x: 0, z: 0, builtProgress: 0, built: false, busyWorkerId: null,
            buildQueue: [], stakes: null, sawDiscMesh: null, rawRockMesh: null, cutBlockMesh: null,
            progressBarBg: null, progressBarFill: null
        };
        mState.depot = {
            placed: false, x: 0, z: 0, builtProgress: 0, completed: false,
            buildQueue: [], displaySlots: [], displayedMinerals: [], stakes: null,
            lanternLight: null, lanternBulbMat: null, furnaceLight: null, chimneyTopWorld: null
        };
        syncMiningUI();
    }

    function serialize() {
        const cr = mState.crusher;
        const dp = mState.depot;
        return {
            autoMode: Boolean(mState.autoMode),
            totalSoldLots: mState.totalSoldLots,
            totalSalesCoins: mState.totalSalesCoins,
            crusher: cr.placed ? {
                x: Math.round(cr.x * 100) / 100,
                z: Math.round(cr.z * 100) / 100,
                builtProgress: cr.builtProgress,
                built: Boolean(cr.built)
            } : null,
            depot: dp.placed ? {
                x: Math.round(dp.x * 100) / 100,
                z: Math.round(dp.z * 100) / 100,
                builtProgress: dp.builtProgress,
                completed: Boolean(dp.completed),
                displayedOres: dp.displayedMinerals.map(m => m.oreKey || 'granite')
            } : null
        };
    }

    function restore(snap) {
        reset();
        if (!snap || typeof snap !== 'object') return;
        if (typeof snap.autoMode === 'boolean') mState.autoMode = snap.autoMode;
        mState.totalSoldLots = snap.totalSoldLots || 0;
        mState.totalSalesCoins = snap.totalSalesCoins || 0;
        if (snap.crusher && Number.isFinite(snap.crusher.x) && Number.isFinite(snap.crusher.z)) {
            placeCrusher(snap.crusher.x, snap.crusher.z, {
                builtProgress: snap.crusher.builtProgress || 0,
                instantBuilt: Boolean(snap.crusher.built),
                silent: true
            });
        }
        if (snap.depot && Number.isFinite(snap.depot.x) && Number.isFinite(snap.depot.z)) {
            placeDepot(snap.depot.x, snap.depot.z, {
                builtProgress: snap.depot.builtProgress || 0,
                instantBuilt: Boolean(snap.depot.completed),
                displayedOres: snap.depot.displayedOres || [],
                silent: true
            });
        }
        syncMiningUI();
    }

    function getSummary() {
        const cr = mState.crusher;
        const dp = mState.depot;
        return {
            autoMode: mState.autoMode,
            intactRocks: mState.rocks.filter(r => r.status === 'intact').length,
            rubblePiles: mState.rocks.filter(r => r.status === 'rubble' && !r.rubbleCleared).length,
            groundChunks: mState.groundChunks.filter(c => !c.picked).length,
            crusherPlaced: cr.placed,
            crusherBuilt: cr.built,
            crusherProgress: cr.builtProgress,
            depotPlaced: dp.placed,
            depotCompleted: dp.completed,
            depotProgress: dp.builtProgress,
            depotTotalPieces: dp.buildQueue.length,
            displayedCount: dp.displayedMinerals.length,
            maxDisplay: MAX_DISPLAY_ITEMS,
            highwayBonus: isDepotConnectedToHighway(),
            totalSoldLots: mState.totalSoldLots,
            totalSalesCoins: mState.totalSalesCoins
        };
    }

    MO.miningManager = {
        MAX_DISPLAY_ITEMS,
        ORE_TYPES,
        state: mState,
        init: ensureGroups,
        reset,
        update,
        createPhysicalRock,
        promoteChunkRock,
        applyPickaxeHit,
        shatterRockToChunks,
        applyRubbleHit,
        consumeGroundChunk,
        prospectNewVeins,
        placeCrusher,
        getNextCrusherPiece,
        installNextCrusherPiece,
        animateCrusher,
        placeDepot,
        getNextDepotPiece,
        installNextDepotPiece,
        deliverDisplayMineral,
        isDepotConnectedToHighway,
        sellDisplayedMinerals,
        handleWorldClick,
        toggleAutoMode,
        syncMiningUI,
        serialize,
        restore,
        getSummary
    };
})(window.MO = window.MO || {});

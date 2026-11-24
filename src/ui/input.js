// =========================================================================
// UI / INPUT: RAYCASTING MULTI-MODO, ATALHO ZEN (H/ESC) & ÓRBITA DE CÂMERA
// =========================================================================
(function(MO) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDrawingRect = false;
    let dragStartCell = null;
    const cameraKeys = { up: false, down: false, left: false, right: false };

    function intersectTerrain(rc) {
        if (MO.state && MO.state.infiniteWorld && MO.chunkManager) {
            const list = MO.chunkManager.getChunkMeshes();
            if (list && list.length > 0) return rc.intersectObjects(list, false);
        }
        return MO.terrainMesh ? rc.intersectObject(MO.terrainMesh) : [];
    }
    MO.intersectTerrain = intersectTerrain;

    MO.updateCameraPan = function(dt) {
        if (!dt || !MO.camOrbit) return;
        const dxKey = (cameraKeys.right ? 1 : 0) - (cameraKeys.left ? 1 : 0);
        const dzKey = (cameraKeys.down ? 1 : 0) - (cameraKeys.up ? 1 : 0);
        if (dxKey === 0 && dzKey === 0) return;

        const camOrbit = MO.camOrbit;
        const panSpeed = Math.max(10, camOrbit.radius * 0.65) * dt;
        const sinT = Math.sin(camOrbit.theta);
        const cosT = Math.cos(camOrbit.theta);
        // Movimento relativo à rotação da câmera no plano XZ
        const moveX = (dxKey * cosT + dzKey * sinT);
        const moveZ = (-dxKey * sinT + dzKey * cosT);
        const len = Math.hypot(moveX, moveZ) || 1;
        const stepX = (moveX / len) * panSpeed;
        const stepZ = (moveZ / len) * panSpeed;

        camOrbit.target.x += stepX;
        camOrbit.target.z += stepZ;
        if (camOrbit.targetGoal) {
            camOrbit.targetGoal.x = camOrbit.target.x;
            camOrbit.targetGoal.z = camOrbit.target.z;
        }
    };

    function setMouseNDC(e) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    function applyBucketAtPoint(pt) {
        const state = MO.state;
        if (state.bucketCharges <= 0 || state.mode !== 'house') return false;

        if (state.phase === 2) {
            for (let col of state.columns) {
                if (!col.concreted && col.hasFormwork && Math.hypot(pt.x - col.x, pt.z - col.z) < 0.72) {
                    state.bucketCharges = Math.max(0, state.bucketCharges - 1);
                    MO.concreteColumn(col);
                    MO.updateBucketUI();
                    if (state.columns.every(c => c.concreted)) {
                        MO.showToast('Todas as colunas concretadas! Clique em Alvenaria → para continuar.', '✅');
                    }
                    return true;
                }
            }
        }

        if (state.phase === 3) {
            for (let wall of state.walls) {
                const unplaced = wall.slots.filter(s => !s.placed);
                if (!unplaced.length) continue;
                const low = Math.min(...unplaced.map(s => s.row));
                for (let slot of unplaced.filter(s => s.row === low && !s.hasMortar)) {
                    if (Math.hypot(pt.x - slot.x, pt.z - slot.z) < 0.58) {
                        slot.hasMortar = true;
                        slot.mortarMesh.visible = true;
                        slot.guideMesh.material.color.setHex(0x10b981);
                        slot.guideMesh.material.opacity = 0.30;
                        state.bucketCharges = Math.max(0, state.bucketCharges - 0.25);
                        MO.SoundFX.playMortarSquish();
                        MO.updateBucketUI();
                        return true;
                    }
                }
            }
            if (state.tool === 'floor') {
                for (let ft of state.floorTiles) {
                    if (!ft.concreted && Math.hypot(pt.x - ft.x, pt.z - ft.z) < 0.6) {
                        MO.pourFloorTile(ft);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    MO.initInputControls = function() {
        const state = MO.state;
        const camOrbit = MO.camOrbit;
        const camera = MO.camera;

        // Atalho de teclado H/Escape (Zen), P (Diagnóstico) e WASD/Setas para câmera livre no mundo infinito
        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            const k = e.key.toLowerCase();
            if (k === 'h') {
                MO.toggleZenMode();
            } else if (k === 'p') {
                if (MO.diagnostics) MO.diagnostics.toggle();
            } else if (e.key === 'Escape' && state.zenMode) {
                MO.toggleZenMode(false);
            } else if (k === 'w' || e.key === 'ArrowUp') cameraKeys.up = true;
            else if (k === 's' || e.key === 'ArrowDown') cameraKeys.down = true;
            else if (k === 'a' || e.key === 'ArrowLeft') cameraKeys.left = true;
            else if (k === 'd' || e.key === 'ArrowRight') cameraKeys.right = true;
        });

        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (k === 'w' || e.key === 'ArrowUp') cameraKeys.up = false;
            else if (k === 's' || e.key === 'ArrowDown') cameraKeys.down = false;
            else if (k === 'a' || e.key === 'ArrowLeft') cameraKeys.left = false;
            else if (k === 'd' || e.key === 'ArrowRight') cameraKeys.right = false;
        });

        // Gestos Touch Multi-ponteiro (Pinch Zoom + Órbita 1 ou 2 dedos em Celulares/Tablets)
        const activePointers = new Map();
        let pinchStartDist = 0;
        let pinchStartRadius = camOrbit.radius;
        let touchOrbitCandidate = null;

        function getTouchPairMetrics() {
            const pts = Array.from(activePointers.values());
            if (pts.length < 2) return null;
            const dx = pts[0].x - pts[1].x;
            const dy = pts[0].y - pts[1].y;
            return {
                dist: Math.hypot(dx, dy),
                midX: (pts[0].x + pts[1].x) / 2,
                midY: (pts[0].y + pts[1].y) / 2
            };
        }

        window.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button') || e.target.closest('.dock-surface') || e.target.closest('#city-setup-modal')) return;

            if (e.pointerType === 'touch') {
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (activePointers.size === 2) {
                    // Inicia Pinch-to-Zoom + Órbita com 2 dedos cancelando ação de toque único
                    const m = getTouchPairMetrics();
                    pinchStartDist = Math.max(10, m.dist);
                    pinchStartRadius = camOrbit.radius;
                    camOrbit.isDragging = true;
                    camOrbit.prevX = m.midX;
                    camOrbit.prevY = m.midY;
                    touchOrbitCandidate = null;
                    state.isStirringMixer = false;
                    state.isLevelingTerrain = false;
                    isDrawingRect = false;
                    MO.selectionPreview.visible = false;
                    return;
                }
            }

            if (e.button === 2 || e.button === 1) {
                camOrbit.isDragging = true;
                camOrbit.isPanning = (e.button === 1 || e.shiftKey);
                camOrbit.prevX = e.clientX;
                camOrbit.prevY = e.clientY;
                return;
            }
            if (e.button !== 0 && e.pointerType !== 'touch') return;

            // Em toque único no celular, guarda candidato para virar órbita caso arraste sem arrastar peça/terreno
            if (e.pointerType === 'touch') {
                touchOrbitCandidate = { id: e.pointerId, startX: e.clientX, startY: e.clientY };
            }

            setMouseNDC(e);
            raycaster.setFromCamera(mouse, camera);

            // Clique direto na água visível cria ondas responsivas
            if (MO.waterSurfaceMesh && MO.spawnWaterRipple) {
                const wHits = raycaster.intersectObject(MO.waterSurfaceMesh);
                if (wHits.length > 0) {
                    const wp = wHits[0].point;
                    if (MO.getTerrainHeight(wp.x, wp.z) < MO.WATER_LEVEL + 0.04) {
                        MO.spawnWaterRipple(wp.x, wp.z, 1.35, true);
                    }
                }
            }

            // --- INSPEÇÃO INTERATIVA DE AJUDANTES E ACAMPAMENTO (BARRACAS / REFLETORES) ---
            const workerHits = raycaster.intersectObjects(MO.groups.workers.children, true);
            if (workerHits.length > 0) {
                let obj = workerHits[0].object;
                while (obj && obj.userData && obj.userData.interactiveKind !== 'worker') obj = obj.parent;
                if (obj && obj.userData && obj.userData.interactiveKind === 'worker') {
                    const w = state.workers.find(item => item.id === obj.userData.workerId);
                    if (w) {
                        MO.showToast(
                            `${w.name}: ${w.statusText} · ⚡${Math.round(w.energy)}% · 💧${Math.round(w.hydration)}% · 🍲${Math.round(w.hunger)}%`,
                            '👷'
                        );
                        return;
                    }
                }
            }

            const campHits = raycaster.intersectObjects(MO.groups.camp.children, true);
            if (campHits.length > 0) {
                let obj = campHits[0].object;
                while (obj && obj.userData && !obj.userData.interactiveKind) obj = obj.parent;
                if (obj && obj.userData) {
                    const kind = obj.userData.interactiveKind;
                    if (kind === 'camp-floodlight') {
                        const fl = state.camp.floodlights[obj.userData.lightIdx];
                        if (fl && fl.built) {
                            fl.manualOn = !fl.manualOn;
                            MO.SoundFX.playElectricSwitch();
                            MO.showToast(`Refletor #${fl.id + 1}: ${fl.manualOn || state.isNight ? 'Ligado 💡' : 'Desligado'}`, '💡');
                        } else if (fl) {
                            MO.completeFloodlightBuild(fl);
                        }
                        return;
                    } else if (kind === 'camp-tent') {
                        const tn = state.camp.tents[obj.userData.tentIdx];
                        if (tn && !tn.built) {
                            MO.completeTentBuild(tn);
                            MO.showToast(`Barraca #${tn.id + 1} armada!`, '⛺');
                        } else if (tn) {
                            const occ = tn.occupiedBy !== null ? state.workers.find(x => x.id === tn.occupiedBy) : null;
                            MO.showToast(occ ? `Barraca #${tn.id + 1}: ${occ.name} dormindo 💤` : `Barraca #${tn.id + 1}: Pronta para descanso`, '⛺');
                        }
                        return;
                    } else if (kind === 'camp-cooler') {
                        MO.showToast('Bebedouro 20L: mantém a equipe hidratada nos dias quentes!', '💧');
                        return;
                    } else if (kind === 'camp-mess') {
                        if (state.camp.messHall && !state.camp.messHall.built) {
                            MO.completeMessBuild();
                        } else {
                            MO.showToast('Refeitório & Fogareiro: pausa pro café, almoço e abrigo da chuva!', '🍲');
                        }
                        return;
                    }
                }
            }

            // --- POSICIONAMENTO LIVRE NA CIDADE INFINITA (Estradas, Ruas, Casas, Prédios, Fazendas...) ---
            if (state.city && state.city.activeBuildTool && MO.cityManager) {
                const thCity = intersectTerrain(raycaster);
                if (thCity.length > 0 && MO.cityManager.handlePlacementPointerDown(thCity[0].point)) {
                    return;
                }
            }

            // --- FASE 0 COMPARTILHADA: CAPINA DO MATO & TERRAPLANAGEM ---
            if (state.phase === 0) {
                if (state.tool === 'clear-weeds') {
                    const wHits = raycaster.intersectObjects(MO.groups.weeds.children, true);
                    for (let h of wHits) {
                        if (h.object.userData.weedObj && !h.object.userData.weedObj.cleared) {
                            MO.clearWeedItem(h.object.userData.weedObj);
                            return;
                        }
                    }
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        const p = th[0].point;
                        const nearW = state.weeds.find(w => !w.cleared && Math.hypot(w.x - p.x, w.z - p.z) < 1.1);
                        if (nearW) MO.clearWeedItem(nearW);
                    }
                    return;
                }
                if (state.tool === 'level') {
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        state.isLevelingTerrain = true;
                        const p = th[0].point;
                        MO.paintLevelWeight(p.x, p.z, 1.75, 0.48);
                        MO.updateTerrainGeometry();
                        MO.spawnBurst(p.x, p.y + 0.1, p.z, 0x7a654d, 8);
                        MO.SoundFX.playDirtShovel();
                    }
                    return;
                }
            }

            // --- INTERAÇÃO GLOBAL COM INSUMOS DA MASSEIRA (FASES 2, 3, 5) ---
            if (state.phase >= 2 && state.tool !== 'erase') {
                const supHits = raycaster.intersectObjects(MO.groups.physicsSupplies.children, true);
                if (supHits.length > 0) {
                    const item = supHits[0].object.userData.physicalSupply;
                    if (item && !item.consumed) {
                        if (item.type === 'bucket' && state.mortarCharges > 0 && state.bucketCharges < 4) {
                            MO.fillBucketFromMixer();
                        }
                        state.draggedItem = { kind: 'supply', ref: item, startX: e.clientX, startY: e.clientY };
                        return;
                    }
                }

                const mixHit = raycaster.intersectObject(MO.mixer.mixerStirHitbox);
                if (mixHit.length > 0) {
                    if (state.sand === 3 && state.cement === 1 && state.water === 1 && state.mortarCharges === 0) {
                        state.isStirringMixer = true;
                        state.lastStirPos.set(e.clientX, e.clientY);
                        MO.mixer.hoeGroup.visible = true;
                        MO.showToast('Mova o mouse dentro da masseira para bater a massa!', '🥄');
                    } else if (state.mortarCharges > 0) {
                        MO.fillBucketFromMixer();
                    } else {
                        MO.showToast('Jogue 3 Areia, 1 Cimento e 1 Água na masseira primeiro!', '⚠️');
                    }
                    return;
                }
            }

            // --- DELEGAÇÃO PARA MODOS PONTE, PRÉDIO OU TORRE ---
            if (state.mode !== 'house') {
                const plugin = MO.modes[state.mode];
                if (plugin && plugin.handlePointerDown) {
                    plugin.handlePointerDown(raycaster);
                }
                return;
            }

            // --- MODO CASA (FASES 1 a 5) ---
            if (state.phase === 1) {
                if (state.tool === 'level') {
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        state.isLevelingTerrain = true;
                        const p = th[0].point;
                        MO.paintLevelWeight(p.x, p.z, 1.65, 0.45);
                        MO.updateTerrainGeometry();
                        MO.spawnBurst(p.x, p.y + 0.1, p.z, 0x7a654d, 8);
                        MO.SoundFX.playDirtShovel();
                    }
                    return;
                }

                if (state.tool === 'door' || state.tool === 'window') {
                    const bpHits = raycaster.intersectObjects(MO.groups.blueprint.children);
                    for (let h of bpHits) {
                        if (h.object.userData.wallSegment) {
                            MO.toggleWallOpening(h.object.userData.wallSegment, state.tool);
                            MO.SoundFX.playHammerWood();
                            return;
                        }
                    }
                    return;
                }

                if (state.tool === 'muro') {
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        const p = th[0].point;
                        const c = MO.worldToGrid(p);
                        const center = MO.gridToWorldCenter(c.gx, c.gz);
                        const ori = Math.abs(p.x - center.x) > Math.abs(p.z - center.z) ? 'V' : 'H';
                        const mx = ori === 'V' ? (p.x > center.x ? center.x + 0.48 : center.x - 0.48) : center.x;
                        const mz = ori === 'H' ? (p.z > center.z ? center.z + 0.48 : center.z - 0.48) : center.z;
                        state.muros.push({ x: mx, z: mz, ori, built: false });
                        MO.renderMurosAndStairsBlueprint();
                        MO.SoundFX.playBrickClack();
                    }
                    return;
                }

                if (state.tool === 'stair') {
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        const c = MO.worldToGrid(th[0].point);
                        const center = MO.gridToWorldCenter(c.gx, c.gz);
                        state.stairs.push({ x: center.x, z: center.z, built: false });
                        MO.renderMurosAndStairsBlueprint();
                        MO.SoundFX.playHammerWood();
                    }
                    return;
                }

                if (state.tool === 'erase') {
                    const msHits = raycaster.intersectObjects(MO.groups.muroStair.children, true);
                    if (msHits.length > 0) {
                        const mr = msHits[0].object.userData.muroRef;
                        const sr = msHits[0].object.userData.stairRef;
                        if (mr) { state.muros = state.muros.filter(m => m !== mr); MO.renderMurosAndStairsBlueprint(); MO.showToast('Muro removido!', '🗑️'); return; }
                        if (sr) { state.stairs = state.stairs.filter(s => s !== sr); MO.renderMurosAndStairsBlueprint(); MO.showToast('Escada removida!', '🗑️'); return; }
                    }
                    const bpHits = raycaster.intersectObjects(MO.groups.blueprint.children);
                    for (let h of bpHits) {
                        if (h.object.userData.wallSegment && h.object.userData.wallSegment.opening) {
                            MO.toggleWallOpening(h.object.userData.wallSegment, h.object.userData.wallSegment.opening);
                            return;
                        }
                    }
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        isDrawingRect = true;
                        dragStartCell = MO.worldToGrid(th[0].point);
                        MO.selectionPreview.material.color.setHex(0xf43f5e);
                        MO.updateSelectionPreview(dragStartCell, dragStartCell);
                    }
                    return;
                }

                if (state.tool === 'room') {
                    const th = intersectTerrain(raycaster);
                    if (th.length > 0) {
                        isDrawingRect = true;
                        dragStartCell = MO.worldToGrid(th[0].point);
                        MO.selectionPreview.material.color.setHex(0x38bdf8);
                        MO.updateSelectionPreview(dragStartCell, dragStartCell);
                    }
                    return;
                }
            }

            if (state.phase === 2) {
                if (state.tool === 'rebar' && state.looseRebars.length > 0) {
                    const rHits = raycaster.intersectObjects(MO.groups.looseRebars.children, true);
                    if (rHits.length > 0) {
                        const rObj = rHits[0].object.userData.rebarObj;
                        if (rObj && !rObj.installed) {
                            state.draggedItem = { kind: 'rebar', ref: rObj };
                            rObj.mesh.rotation.set(0, 0, 0);
                            return;
                        }
                    }
                }

                const cHits = raycaster.intersectObjects(state.columns.map(c => c.hitbox));
                if (cHits.length > 0) {
                    const col = cHits[0].object.userData.column;
                    if (state.tool === 'erase') {
                        MO.eraseColumn(col);
                    } else if (state.tool === 'dig' && !col.dug) {
                        col.dug = true;
                        col.ringMesh.material.color.setHex(0x38bdf8);
                        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), MO.mats.hole);
                        hole.position.y = 0.03;
                        col.holeMesh = hole;
                        col.meshGroup.add(hole);
                        MO.spawnBurst(col.x, col.terrainY + 0.1, col.z, 0x5c4632, 9);
                        MO.SoundFX.playDirtShovel();
                        if (state.columns.every(c => c.dug)) { MO.selectTool('rebar'); MO.showToast('Sapatas cavadas! Peça as Armaduras.', '⛓️'); }
                    } else if (state.tool === 'formwork') {
                        if (!col.hasRebar) MO.showToast('Encaixe a armadura de aço antes da caixaria!', '⚠️');
                        else if (!col.hasFormwork) {
                            MO.attachWoodFormworkToColumn(col);
                            MO.SoundFX.playHammerWood();
                            if (state.columns.every(c => c.hasFormwork)) { MO.selectTool('mixer'); MO.showToast('Caixarias prontas! Prepare o concreto na Masseira.', '🥣'); }
                        }
                    } else if (state.tool === 'pour-col') {
                        if (!col.hasFormwork) MO.showToast('Pregue a caixaria antes de concretar!', '⚠️');
                        else if (state.bucketCharges <= 0) MO.showToast('Balde vazio! Abasteça na Masseira.', '🪣');
                        else if (!col.concreted) {
                            state.bucketCharges = Math.max(0, state.bucketCharges - 1);
                            MO.concreteColumn(col);
                            MO.updateBucketUI();
                            if (state.columns.every(c => c.concreted)) MO.showToast('Todas as colunas prontas! Avance para Alvenaria →', '✅');
                        }
                    }
                }
                return;
            }

            if (state.phase === 3) {
                if (state.tool === 'erase') {
                    const wHits = raycaster.intersectObjects(MO.groups.walls.children);
                    for (let h of wHits) {
                        const sl = h.object.userData.wallSlot;
                        if (sl && sl.placed) { sl.placed = false; sl.mesh.visible = false; sl.guideMesh.visible = true; MO.SoundFX.playBrickClack(); return; }
                        if (sl && sl.hasMortar) { sl.hasMortar = false; sl.mortarMesh.visible = false; sl.guideMesh.material.color.setHex(0xf59e0b); return; }
                    }
                    const fHits = raycaster.intersectObjects(MO.groups.floor.children);
                    for (let h of fHits) {
                        const ft = h.object.userData.floorTile;
                        if (ft && ft.concreted) {
                            ft.concreted = false;
                            MO.resources.removeAndDispose(MO.groups.floor, ft.slabMesh);
                            ft.slabMesh = null;
                            ft.hitbox.visible = true;
                            return;
                        }
                    }
                    return;
                }

                if (state.tool === 'prop') {
                    const vHits = raycaster.intersectObjects(MO.groups.walls.children);
                    for (let h of vHits) {
                        const vw = h.object.userData.voidWall;
                        if (vw && !vw.hasProp) {
                            vw.hasProp = true;
                            vw.propGroup.visible = true;
                            MO.SoundFX.playHammerWood();
                            MO.showToast('Escora instalada no vão! Verga liberada.', '🪵');
                            return;
                        }
                    }
                    return;
                }

                if (state.tool === 'floor') {
                    const fHits = raycaster.intersectObjects(MO.groups.floor.children);
                    if (fHits.length > 0 && fHits[0].object.userData.floorTile) {
                        MO.pourFloorTile(fHits[0].object.userData.floorTile);
                    }
                    return;
                }

                const msHits = raycaster.intersectObjects(MO.groups.muroStair.children, true);
                if (msHits.length > 0) {
                    const mr = msHits[0].object.userData.muroRef;
                    const sr = msHits[0].object.userData.stairRef;
                    if (mr && !mr.built) {
                        mr.built = true; MO.renderMurosAndStairsBlueprint(); MO.SoundFX.playBrickClack();
                        MO.showToast('Segmento de muro construído!', '🧱'); return;
                    }
                    if (sr && !sr.built) {
                        sr.built = true; MO.renderMurosAndStairsBlueprint(); MO.SoundFX.playMortarSquish();
                        MO.showToast('Escada externa concretada!', '🪜'); return;
                    }
                }

                const bHits = raycaster.intersectObjects(MO.groups.looseBricks.children, true);
                if (bHits.length > 0) {
                    const bObj = bHits[0].object.userData.looseBrick;
                    if (bObj && !bObj.placed) {
                        if (state.selectedBrickInHand) state.selectedBrickInHand.mesh.scale.set(1, 1, 1);
                        state.selectedBrickInHand = bObj;
                        bObj.mesh.scale.set(1.22, 1.22, 1.22);
                        MO.SoundFX.playBrickClack();
                        MO.showToast('Tijolo selecionado! Clique na parede para assentar.', '🧱');
                        return;
                    }
                }

                const wHits = raycaster.intersectObjects(MO.groups.walls.children);
                for (let h of wHits) {
                    const slot = h.object.userData.wallSlot;
                    if (!slot || slot.placed) continue;
                    const unplaced = slot.wallRef.slots.filter(s => !s.placed);
                    const low = Math.min(...unplaced.map(s => s.row));
                    if (slot.row > low) { MO.showToast('Complete a fiada de baixo primeiro!', '⚠️'); return; }

                    if (!slot.hasMortar) {
                        if (state.bucketCharges <= 0) { MO.showToast('Balde vazio! Abasteça na Masseira para passar argamassa.', '🪣'); return; }
                        slot.hasMortar = true;
                        slot.mortarMesh.visible = true;
                        slot.guideMesh.material.color.setHex(0x10b981);
                        slot.guideMesh.material.opacity = 0.30;
                        state.bucketCharges = Math.max(0, state.bucketCharges - 0.25);
                        MO.SoundFX.playMortarSquish();
                        MO.updateBucketUI();
                        return;
                    }

                    if (slot.isLintel && !slot.wallRef.hasProp) {
                        MO.showToast('Instale a Escora Vão antes de colocar a verga sobre porta/janela!', '⚠️');
                        return;
                    }

                    if (!state.selectedBrickInHand) {
                        const nextB = state.looseBricks.find(b => !b.placed);
                        if (!nextB) { MO.showToast('Acabaram os tijolos! Clique em + Palete.', '🧱'); return; }
                        state.selectedBrickInHand = nextB;
                    }

                    const brick = state.selectedBrickInHand;
                    brick.placed = true; brick.mesh.visible = false; brick.mesh.scale.set(1, 1, 1);
                    state.selectedBrickInHand = state.looseBricks.find(b => !b.placed) || null;
                    if (state.selectedBrickInHand) state.selectedBrickInHand.mesh.scale.set(1.22, 1.22, 1.22);
                    MO.animateBrickDrop(slot);
                    return;
                }
            }

            if (state.phase === 4) {
                if (state.tool === 'erase') {
                    const mHits = raycaster.intersectObjects(MO.groups.mep.children);
                    if (mHits.length > 0 && mHits[0].object.userData.mepNode) {
                        const nd = mHits[0].object.userData.mepNode;
                        MO.resources.removeAndDispose(MO.groups.mep, nd.mesh);
                        state.elecNodes = state.elecNodes.filter(n => n !== nd);
                        state.plumbNodes = state.plumbNodes.filter(n => n !== nd);
                        MO.showToast('Ponto MEP removido!', '🗑️');
                    }
                    return;
                }

                if (state.tool === 'elec') {
                    const wHits = raycaster.intersectObjects(state.walls.map(w => w.finishHitbox));
                    if (wHits.length > 0) {
                        MO.placeElectricalNode(wHits[0].object.userData.finishWall, wHits[0].point);
                    }
                    return;
                }

                if (state.tool === 'plumb') {
                    const hasTank = state.plumbNodes.some(n => n.type === 'tank');
                    if (!hasTank) {
                        const ft = state.floorTiles[0];
                        const pt = ft ? new THREE.Vector3(ft.x, state.houseBaseY + MO.WALL_HEIGHT, ft.z) : new THREE.Vector3(0, 2, 0);
                        MO.placePlumbingNode('tank', pt);
                        return;
                    }
                    const wHits = raycaster.intersectObjects(state.walls.map(w => w.finishHitbox));
                    if (wHits.length > 0) {
                        MO.placePlumbingNode('fixture', wHits[0].point);
                        return;
                    }
                    const tHits = intersectTerrain(raycaster);
                    if (tHits.length > 0) {
                        MO.placePlumbingNode('sewage', tHits[0].point);
                    }
                    return;
                }
            }

            if (state.phase === 5) {
                if (state.tool === 'roof') {
                    MO.buildRealGableRoofStage();
                    return;
                }

                const wHits = raycaster.intersectObjects(state.walls.map(w => w.finishHitbox));
                if (wHits.length > 0) {
                    const fw = wHits[0].object.userData.finishWall;
                    if (state.tool === 'beam-fw' && !fw.hasBeamFormwork) {
                        fw.hasBeamFormwork = true;
                        if (fw.beamFormworkGroup) fw.beamFormworkGroup.visible = true;
                        const mx = (fw.x1 + fw.x2) / 2, mz = (fw.z1 + fw.z2) / 2;
                        MO.spawnBurst(mx, state.houseBaseY + MO.WALL_HEIGHT + 0.15, mz, 0x9e744a, 8, 0.06);
                        MO.SoundFX.playHammerWood();
                        if (state.walls.every(w => w.hasBeamFormwork)) {
                            MO.showToast('Caixaria e tábuas de todas as cintas pregadas! Agora selecione Concretar Cinta.', '🪣');
                            MO.selectTool('beam');
                        }
                    } else if (state.tool === 'beam' && !fw.hasTopBeam) {
                        if (!fw.hasBeamFormwork) {
                            MO.showToast('Monte primeiro a Caixaria de madeira da cinta (🪵 1. Caixaria Cinta) antes de concretar!', '⚠️');
                            return;
                        }
                        fw.hasTopBeam = true;
                        fw.topBeamMesh.visible = true;
                        if (fw.beamFormworkGroup) fw.beamFormworkGroup.visible = false;
                        if (fw.propGroup) fw.propGroup.visible = false;
                        MO.SoundFX.playMortarSquish();
                        if (state.walls.every(w => w.hasTopBeam)) {
                            MO.showToast('Cinta superior concretada e desformada! Selecione Telhado para montar as 2 águas.', '🏠');
                            MO.selectTool('roof');
                        }
                    } else if (state.tool === 'plaster' && !fw.isPlastered) {
                        fw.isPlastered = true;
                        fw.plasterGroup.visible = true;
                        fw.slots.forEach(s => { s.guideMesh.visible = false; });
                        MO.SoundFX.playMortarSquish();
                        if (state.walls.every(w => w.isPlastered)) {
                            MO.showToast('Reboco concluído! Instale as Esquadrias (portas e janelas).', '🚪');
                            MO.selectTool('fixtures');
                        }
                    } else if (state.tool === 'fixtures') {
                        if (!fw.opening) { MO.showToast('Esta parede não possui vão de porta ou janela.', 'ℹ️'); return; }
                        if (!fw.hasFixture && fw.fixtureGroup) {
                            fw.hasFixture = true;
                            fw.fixtureGroup.visible = true;
                            MO.SoundFX.playHammerWood();
                            MO.showToast(fw.opening === 'door' ? 'Porta de madeira instalada!' : 'Janela de vidro instalada!', '🚪');
                        }
                    } else if (state.tool === 'paint') {
                        if (!fw.isPlastered) { MO.showToast('Reboque esta parede antes de pintar!', '⚠️'); return; }
                        fw.isPainted = true;
                        fw.plasterMat.color.set(state.paintColorHex);
                        MO.SoundFX.playMortarSquish();
                        if (state.walls.every(w => w.isPainted)) {
                            MO.showToast('🏆 OBRA 100% CONCLUÍDA! Arquitetura finalizada com sucesso!', '🎉');
                        }
                    } else if (state.tool === 'erase') {
                        if (fw.isPainted) { fw.isPainted = false; fw.plasterMat.color.setHex(0xd6d3d1); }
                        else if (fw.hasFixture) { fw.hasFixture = false; fw.fixtureGroup.visible = false; }
                        else if (fw.isPlastered) { fw.isPlastered = false; fw.plasterGroup.visible = false; }
                        else if (fw.hasTopBeam) { fw.hasTopBeam = false; fw.topBeamMesh.visible = false; if (fw.beamFormworkGroup) fw.beamFormworkGroup.visible = true; }
                        else if (fw.hasBeamFormwork) { fw.hasBeamFormwork = false; if (fw.beamFormworkGroup) fw.beamFormworkGroup.visible = false; }
                    }
                }
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch' && activePointers.has(e.pointerId)) {
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (activePointers.size === 2) {
                    const m = getTouchPairMetrics();
                    if (m && pinchStartDist > 0) {
                        const scale = pinchStartDist / Math.max(10, m.dist);
                        camOrbit.radius = Math.max(10, Math.min(82, pinchStartRadius * scale));
                        camOrbit.targetRadius = camOrbit.radius;
                        camOrbit.theta -= (m.midX - camOrbit.prevX) * 0.007;
                        camOrbit.phi = Math.max(0.28, Math.min(1.36, camOrbit.phi - (m.midY - camOrbit.prevY) * 0.007));
                        camOrbit.prevX = m.midX;
                        camOrbit.prevY = m.midY;
                    }
                    return;
                }
                if (
                    touchOrbitCandidate &&
                    touchOrbitCandidate.id === e.pointerId &&
                    !state.draggedItem &&
                    !state.isStirringMixer &&
                    !state.isLevelingTerrain &&
                    !isDrawingRect
                ) {
                    const moved = Math.hypot(e.clientX - touchOrbitCandidate.startX, e.clientY - touchOrbitCandidate.startY);
                    if (moved > 8) {
                        camOrbit.isDragging = true;
                        camOrbit.prevX = e.clientX;
                        camOrbit.prevY = e.clientY;
                        touchOrbitCandidate = null;
                    }
                }
            }

            if (camOrbit.isDragging) {
                const dx = e.clientX - camOrbit.prevX;
                const dy = e.clientY - camOrbit.prevY;
                if (camOrbit.isPanning) {
                    const panFactor = camOrbit.radius * 0.0022;
                    const sinT = Math.sin(camOrbit.theta);
                    const cosT = Math.cos(camOrbit.theta);
                    camOrbit.target.x -= (dx * cosT + dy * sinT) * panFactor;
                    camOrbit.target.z -= (-dx * sinT + dy * cosT) * panFactor;
                    if (camOrbit.targetGoal) {
                        camOrbit.targetGoal.x = camOrbit.target.x;
                        camOrbit.targetGoal.z = camOrbit.target.z;
                    }
                } else {
                    camOrbit.theta -= dx * 0.007;
                    camOrbit.phi = Math.max(0.28, Math.min(1.36, camOrbit.phi - dy * 0.007));
                }
                camOrbit.prevX = e.clientX;
                camOrbit.prevY = e.clientY;
                return;
            }

            if (state.city && state.city.activeBuildTool && MO.cityManager) {
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const thCity = intersectTerrain(raycaster);
                if (thCity.length > 0) {
                    if (MO.cityManager.isDraggingPlacement()) {
                        MO.cityManager.handlePlacementPointerMove(thCity[0].point);
                        return;
                    } else if (MO.cityManager.updatePlacementPreview) {
                        MO.cityManager.updatePlacementPreview(thCity[0].point);
                    }
                }
            } else if (MO.placementGhost && MO.placementGhost.visible) {
                MO.placementGhost.visible = false;
            }

            if (state.isLevelingTerrain && (state.phase === 0 || (state.mode === 'house' && state.phase === 1)) && state.tool === 'level') {
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const th = intersectTerrain(raycaster);
                if (th.length > 0) {
                    const p = th[0].point;
                    MO.paintLevelWeight(p.x, p.z, 1.65, 0.25);
                    MO.updateTerrainGeometry();
                    const now = performance.now();
                    if (now - state.lastShovelTime > 150) {
                        MO.spawnBurst(p.x, p.y + 0.08, p.z, 0x7a654d, 5);
                        MO.SoundFX.playDirtShovel();
                        state.lastShovelTime = now;
                    }
                }
                return;
            }

            if (state.isStirringMixer) {
                const { stationGroup, hoeGroup, mixerFillMat, mixerBarGroup, mixerBarFill } = MO.mixer;
                const distMoved = Math.hypot(e.clientX - state.lastStirPos.x, e.clientY - state.lastStirPos.y);
                state.lastStirPos.set(e.clientX, e.clientY);

                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const th = intersectTerrain(raycaster);
                if (th.length > 0) {
                    const lx = Math.max(-0.55, Math.min(0.55, th[0].point.x - stationGroup.position.x));
                    const lz = Math.max(-0.38, Math.min(0.38, th[0].point.z - stationGroup.position.z));
                    hoeGroup.position.x += (lx - hoeGroup.position.x) * 0.45;
                    hoeGroup.position.z += (lz - hoeGroup.position.z) * 0.45;
                    hoeGroup.rotation.y = Math.atan2(lx, lz);
                }

                if (distMoved > 1.5) {
                    state.mixProgress = Math.min(100, state.mixProgress + distMoved * 0.20);
                    const r = state.mixProgress / 100;
                    mixerFillMat.color.copy(new THREE.Color(0xc99a56)).lerp(new THREE.Color(0x5b636c), r);
                    mixerBarGroup.visible = true;
                    mixerBarFill.scale.x = Math.max(0.01, r);
                    mixerBarFill.position.x = -0.52 * (1 - r);

                    const now = performance.now();
                    if (now - state.lastScrapeTime > 125) {
                        MO.SoundFX.playMixerScrape();
                        MO.spawnBurst(stationGroup.position.x + hoeGroup.position.x, stationGroup.position.y + 0.32, stationGroup.position.z + hoeGroup.position.z, 0x94a3b8, 3, 0.04);
                        state.lastScrapeTime = now;
                    }
                    MO.updateMixerVisuals();

                    if (state.mixProgress >= 100) {
                        state.isStirringMixer = false;
                        hoeGroup.visible = false;
                        mixerBarGroup.visible = false;
                        state.mortarCharges = 12;
                        state.sand = 0; state.cement = 0; state.water = 0;
                        MO.SoundFX.playMortarSquish();
                        MO.updateMixerVisuals();
                        MO.showToast('Massa no ponto! Clique ou arraste o Balde na masseira.', '✅');
                    }
                }
                return;
            }

            if (state.mode === 'house' && state.phase === 3 && state.selectedBrickInHand && !state.draggedItem) {
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const wHits = raycaster.intersectObjects(MO.groups.walls.children);
                let shown = false;
                for (let h of wHits) {
                    const sl = h.object.userData.wallSlot;
                    if (sl && !sl.placed) {
                        const low = Math.min(...sl.wallRef.slots.filter(s => !s.placed).map(s => s.row));
                        if (sl.row === low) {
                            MO.brickHoverGhost.visible = true;
                            MO.brickHoverGhost.position.set(sl.x, sl.y + 0.015, sl.z);
                            MO.brickHoverGhost.rotation.y = sl.ori === 'V' ? Math.PI / 2 : 0;
                            MO.brickHoverGhost.material.color.setHex(sl.hasMortar ? 0x34d399 : 0xfbbf24);
                            shown = true;
                            break;
                        }
                    }
                }
                if (!shown) MO.brickHoverGhost.visible = false;
            } else {
                MO.brickHoverGhost.visible = false;
            }

            if (state.draggedItem) {
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const th = intersectTerrain(raycaster);
                if (th.length > 0) {
                    const pt = th[0].point;
                    const item = state.draggedItem.ref;
                    const ty = MO.getTerrainHeight(pt.x, pt.z);

                    if (state.draggedItem.kind === 'rebar') {
                        item.mesh.position.set(pt.x, ty + 0.35, pt.z);
                    } else if (state.draggedItem.kind === 'supply') {
                        item.mesh.position.set(pt.x, ty + 0.65, pt.z);
                        const dMix = Math.hypot(pt.x - MO.mixer.stationGroup.position.x, pt.z - MO.mixer.stationGroup.position.z);
                        if (dMix < 1.1) {
                            if (item.type === 'bucket') {
                                if (state.mortarCharges > 0 && state.bucketCharges < 4) MO.fillBucketFromMixer();
                            } else {
                                item.mesh.rotation.z = 1.05;
                                if (MO.addIngredient(item.type)) {
                                    item.consumed = true;
                                    item.mesh.visible = false;
                                    state.draggedItem = null;
                                }
                            }
                        } else {
                            item.mesh.rotation.z = 0;
                            if (item.type === 'bucket' && state.bucketCharges > 0) applyBucketAtPoint(pt);
                        }
                    }
                }
                return;
            }

            if (isDrawingRect && state.mode === 'house' && state.phase === 1) {
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const th = intersectTerrain(raycaster);
                if (th.length > 0) MO.updateSelectionPreview(dragStartCell, MO.worldToGrid(th[0].point));
                return;
            }

            // Mouse/dedo passando sobre a água cria ondulações em tempo real
            const nowHover = performance.now();
            if (nowHover - (state.lastWaterHover || 0) > 95 && MO.waterSurfaceMesh && MO.spawnWaterRipple) {
                state.lastWaterHover = nowHover;
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const wHits = raycaster.intersectObject(MO.waterSurfaceMesh);
                if (wHits.length > 0) {
                    const wp = wHits[0].point;
                    if (MO.getTerrainHeight(wp.x, wp.z) < MO.WATER_LEVEL + 0.04) {
                        MO.spawnWaterRipple(wp.x, wp.z, 0.70, false);
                    }
                }
            }
        });

        function endPointer(e) {
            if (e.pointerType === 'touch') {
                activePointers.delete(e.pointerId);
                if (touchOrbitCandidate && touchOrbitCandidate.id === e.pointerId) {
                    touchOrbitCandidate = null;
                }
            }
            if (activePointers.size < 2) {
                camOrbit.isDragging = false;
                camOrbit.isPanning = false;
            }
            if (state.city && state.city.activeBuildTool && MO.cityManager && MO.cityManager.isDraggingPlacement()) {
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const thCity = intersectTerrain(raycaster);
                MO.cityManager.handlePlacementPointerUp(thCity.length > 0 ? thCity[0].point : null);
                return;
            }
            state.isStirringMixer = false;
            state.isLevelingTerrain = false;
            MO.mixer.hoeGroup.visible = false;

            if (state.draggedItem) {
                const { kind, ref, startX, startY } = state.draggedItem;
                state.draggedItem = null;

                if (kind === 'supply') {
                    if (ref.type !== 'bucket' && startX !== undefined && Math.hypot(e.clientX - startX, e.clientY - startY) < 8) {
                        if (MO.addIngredient(ref.type)) {
                            ref.consumed = true;
                            ref.mesh.visible = false;
                            return;
                        }
                    }
                    ref.mesh.rotation.z = 0;
                    ref.vy = 0;
                    ref.grounded = false;
                } else if (kind === 'rebar') {
                    let snapped = null;
                    for (let col of state.columns) {
                        if (!col.hasRebar && Math.hypot(ref.mesh.position.x - col.x, ref.mesh.position.z - col.z) < 0.8) {
                            snapped = col; break;
                        }
                    }
                    if (snapped && snapped.dug) {
                        ref.installed = true;
                        snapped.hasRebar = true;
                        ref.mesh.position.set(snapped.x, snapped.terrainY + 0.02, snapped.z);
                        ref.mesh.rotation.set(0, 0, 0);
                        MO.SoundFX.playMetalClang();
                        if (state.columns.every(c => c.hasRebar)) {
                            MO.selectTool('formwork');
                            MO.showToast('Armaduras encaixadas! Pregue a Caixaria nas colunas.', '🪵');
                        }
                    } else {
                        if (snapped && !snapped.dug) MO.showToast('Cave a sapata antes de encaixar a armadura!', '⚠️');
                        ref.vy = 0; ref.grounded = false; ref.mesh.rotation.z = Math.PI / 2 - 0.2;
                    }
                }
                return;
            }

            if (isDrawingRect && state.mode === 'house' && state.phase === 1) {
                isDrawingRect = false;
                MO.selectionPreview.visible = false;
                setMouseNDC(e);
                raycaster.setFromCamera(mouse, camera);
                const th = intersectTerrain(raycaster);
                if (th.length > 0) {
                    const endC = MO.worldToGrid(th[0].point);
                    const minX = Math.min(dragStartCell.gx, endC.gx), maxX = Math.max(dragStartCell.gx, endC.gx);
                    const minZ = Math.min(dragStartCell.gz, endC.gz), maxZ = Math.max(dragStartCell.gz, endC.gz);
                    for (let x = minX; x <= maxX; x++) {
                        for (let z = minZ; z <= maxZ; z++) {
                            if (state.tool === 'erase') state.occupiedCells.delete(`${x},${z}`);
                            else state.occupiedCells.add(`${x},${z}`);
                        }
                    }
                    MO.rebuildBlueprintFromCells();
                }
            }
        }

        window.addEventListener('pointerup', endPointer);
        window.addEventListener('pointercancel', endPointer);

        window.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('wheel', e => {
            e.preventDefault();
            camOrbit.radius = Math.max(10, Math.min(82, camOrbit.radius + e.deltaY * 0.012));
            camOrbit.targetRadius = camOrbit.radius;
        }, { passive: false });
    };
})(window.MO = window.MO || {});

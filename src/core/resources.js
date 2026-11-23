// =========================================================================
// CORE: CICLO DE VIDA E DESCARTE SEGURO DE RECURSOS THREE.JS
// =========================================================================
(function(MO) {
    const protectedResources = new Set();

    const TEXTURE_SLOTS = [
        'map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap',
        'emissiveMap', 'alphaMap', 'aoMap', 'specularMap', 'envMap',
        'lightMap', 'gradientMap'
    ];

    function isDisposable(res) {
        return Boolean(res && typeof res.dispose === 'function');
    }

    function collectMaterialTextures(mat, outSet) {
        if (!mat || typeof mat !== 'object') return;
        for (let i = 0; i < TEXTURE_SLOTS.length; i++) {
            const tex = mat[TEXTURE_SLOTS[i]];
            if (tex && typeof tex.dispose === 'function') {
                outSet.add(tex);
            }
        }
    }

    function protectMaterial(mat) {
        if (!mat) return;
        if (Array.isArray(mat)) {
            for (let i = 0; i < mat.length; i++) protectMaterial(mat[i]);
            return;
        }
        protectedResources.add(mat);
        const textures = new Set();
        collectMaterialTextures(mat, textures);
        textures.forEach(tex => protectedResources.add(tex));
    }

    function protect(...items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item) continue;
            if (Array.isArray(item)) {
                protect(...item);
            } else if (item.isMaterial) {
                protectMaterial(item);
            } else {
                protectedResources.add(item);
            }
        }
    }

    function protectMaterials(mapObj) {
        if (!mapObj || typeof mapObj !== 'object') return;
        Object.values(mapObj).forEach(protectMaterial);
    }

    function isProtected(res) {
        return protectedResources.has(res);
    }

    function traverseSubtree(node, visitor) {
        if (!node) return;
        if (typeof node.traverse === 'function') {
            node.traverse(visitor);
            return;
        }
        visitor(node);
        if (Array.isArray(node.children)) {
            for (let i = 0; i < node.children.length; i++) {
                traverseSubtree(node.children[i], visitor);
            }
        }
    }

    function disposeNodes(roots) {
        const geometries = new Set();
        const materials = new Set();
        const textures = new Set();

        const visit = (node) => {
            if (!node) return;
            // THREE.Sprite no Three.js r128 compartilha uma geometria interna global
            if (!node.isSprite && node.geometry && isDisposable(node.geometry)) {
                geometries.add(node.geometry);
            }
            if (node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                for (let i = 0; i < mats.length; i++) {
                    const mat = mats[i];
                    if (mat && isDisposable(mat)) {
                        materials.add(mat);
                    }
                }
            }
        };

        for (let i = 0; i < roots.length; i++) {
            traverseSubtree(roots[i], visit);
        }

        let disposedGeos = 0;
        let disposedMats = 0;
        let disposedTexs = 0;

        geometries.forEach(geo => {
            if (!protectedResources.has(geo)) {
                geo.dispose();
                disposedGeos++;
            }
        });

        materials.forEach(mat => {
            if (protectedResources.has(mat)) return;
            collectMaterialTextures(mat, textures);
            mat.dispose();
            disposedMats++;
        });

        textures.forEach(tex => {
            if (!protectedResources.has(tex) && isDisposable(tex)) {
                tex.dispose();
                disposedTexs++;
            }
        });

        return { geometries: disposedGeos, materials: disposedMats, textures: disposedTexs };
    }

    function disposeObject3D(root) {
        if (!root) return { geometries: 0, materials: 0, textures: 0 };
        return disposeNodes([root]);
    }

    function removeAndDispose(parent, child) {
        if (!child) return { geometries: 0, materials: 0, textures: 0 };
        if (parent && typeof parent.remove === 'function') {
            parent.remove(child);
        }
        return disposeNodes([child]);
    }

    function clearGroup(group) {
        if (!group || !Array.isArray(group.children)) {
            return { geometries: 0, materials: 0, textures: 0 };
        }
        const detached = group.children.slice();
        while (group.children.length > 0) {
            group.remove(group.children[0]);
        }
        return disposeNodes(detached);
    }

    MO.resources = {
        protect,
        protectMaterials,
        isProtected,
        disposeObject3D,
        removeAndDispose,
        clearGroup,
        getProtectedCount: () => protectedResources.size
    };

    if (MO.mats) {
        protectMaterials(MO.mats);
    }
})(window.MO = window.MO || {});

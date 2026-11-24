// =========================================================================
// WORLD: REGION MANAGER (REGIÕES, LOTES CONSTRUTÍVEIS & COORDENADAS)
// =========================================================================
(function(MO) {
    function createLotRecord(spec = {}) {
        const halfW = spec.halfW !== undefined ? spec.halfW : (MO.GRID_SIZE / 2);
        const halfD = spec.halfD !== undefined ? spec.halfD : (MO.GRID_SIZE / 2);
        return {
            id: spec.id || 'lot-1',
            regionId: spec.regionId || 'main-valley',
            label: spec.label || 'Lote Principal',
            originX: spec.originX !== undefined ? spec.originX : 0,
            originZ: spec.originZ !== undefined ? spec.originZ : MO.GRID_OFFSET_Z,
            halfW,
            halfD,
            bank: spec.bank || 'west',
            allowedModes: Array.isArray(spec.allowedModes) ? spec.allowedModes.slice() : ['house', 'bridge', 'building', 'tower'],
            status: spec.status || 'available', // 'available' | 'active' | 'completed'
            constructionId: spec.constructionId || null
        };
    }

    function createRegionManager() {
        const regions = new Map();
        const lots = new Map();
        let activeRegionId = 'main-valley';
        let activeLotId = 'lot-1';

        function reset() {
            regions.clear();
            lots.clear();
            activeRegionId = 'main-valley';
            activeLotId = 'lot-1';
        }

        function registerRegion(spec = {}) {
            const region = {
                id: spec.id || 'main-valley',
                name: spec.name || 'Vale Principal',
                biome: spec.biome || (MO.state ? MO.state.biome : 'forest'),
                seed: spec.seed !== undefined ? spec.seed : (MO.state ? MO.state.seed : 1000),
                centerX: spec.centerX || 0,
                centerZ: spec.centerZ || 0,
                radius: spec.radius !== undefined ? spec.radius : MO.DIORAMA_R,
                discovered: spec.discovered !== undefined ? Boolean(spec.discovered) : true,
                loaded: spec.loaded !== undefined ? Boolean(spec.loaded) : true,
                neighbors: Array.isArray(spec.neighbors) ? spec.neighbors.map(n => ({ ...n })) : [],
                lotIds: []
            };
            regions.set(region.id, region);
            if (!regions.has(activeRegionId)) {
                activeRegionId = region.id;
            }
            return region;
        }

        function connectRegions(regionAId, regionBId, spec = {}) {
            const rA = regions.get(regionAId);
            const rB = regions.get(regionBId);
            if (!rA || !rB || regionAId === regionBId) return false;
            if (!rA.neighbors.some(n => n.regionId === regionBId)) {
                rA.neighbors.push({ regionId: regionBId, portalLotId: spec.portalLotId || null, label: spec.label || rB.name });
            }
            if (!rB.neighbors.some(n => n.regionId === regionAId)) {
                rB.neighbors.push({ regionId: regionAId, portalLotId: spec.portalLotId || null, label: spec.label || rA.name });
            }
            return true;
        }

        function getConnectedRegions(regionId = activeRegionId) {
            const r = regions.get(regionId);
            if (!r) return [];
            return r.neighbors
                .map(edge => ({ edge, region: regions.get(edge.regionId) || null }))
                .filter(entry => entry.region !== null);
        }

        function discoverRegion(regionId, loadNow = true) {
            const r = regions.get(regionId);
            if (!r) return null;
            r.discovered = true;
            r.loaded = Boolean(loadNow);
            return r;
        }

        function registerLot(spec = {}) {
            const regionId = spec.regionId || activeRegionId;
            if (!regions.has(regionId)) {
                registerRegion({ id: regionId });
            }
            const lot = createLotRecord({ ...spec, regionId });
            lots.set(lot.id, lot);
            const region = regions.get(regionId);
            if (!region.lotIds.includes(lot.id)) {
                region.lotIds.push(lot.id);
            }
            return lot;
        }

        function getRegion(id = activeRegionId) {
            return regions.get(id) || null;
        }

        function getAllRegions() {
            return Array.from(regions.values());
        }

        function getLot(id = activeLotId) {
            return lots.get(id) || null;
        }

        function getLotsForRegion(regionId = activeRegionId) {
            const region = regions.get(regionId);
            if (!region) return [];
            return region.lotIds.map(id => lots.get(id)).filter(Boolean);
        }

        function getActiveLot() {
            return lots.get(activeLotId) || null;
        }

        function setActiveLot(lotId) {
            const lot = lots.get(lotId);
            if (!lot) return null;
            activeLotId = lot.id;
            activeRegionId = lot.regionId;
            return lot;
        }

        function getNextAvailableLot(regionId = activeRegionId, mode = null) {
            const list = getLotsForRegion(regionId);
            return list.find(l => l.status === 'available' && (!mode || l.allowedModes.includes(mode))) || null;
        }

        function lotToWorld(lotOrId, localX, localZ) {
            const lot = typeof lotOrId === 'string' ? getLot(lotOrId) : lotOrId;
            if (!lot) return { x: localX, z: localZ };
            return { x: lot.originX + localX, z: lot.originZ + localZ };
        }

        function worldToLot(lotOrId, worldX, worldZ) {
            const lot = typeof lotOrId === 'string' ? getLot(lotOrId) : lotOrId;
            if (!lot) return { x: worldX, z: worldZ };
            return { x: worldX - lot.originX, z: worldZ - lot.originZ };
        }

        function serialize() {
            return {
                activeRegionId,
                activeLotId,
                regions: getAllRegions().map(r => ({
                    id: r.id,
                    name: r.name,
                    biome: r.biome,
                    seed: r.seed,
                    centerX: r.centerX,
                    centerZ: r.centerZ,
                    radius: r.radius,
                    discovered: r.discovered,
                    loaded: r.loaded,
                    neighbors: r.neighbors.map(n => ({ ...n }))
                })),
                lots: Array.from(lots.values()).map(l => ({ ...l, allowedModes: l.allowedModes.slice() }))
            };
        }

        function restore(data) {
            reset();
            if (!data) return;
            if (Array.isArray(data.regions)) {
                data.regions.forEach(r => registerRegion(r));
            }
            if (Array.isArray(data.lots)) {
                data.lots.forEach(l => registerLot(l));
            }
            if (data.activeRegionId && regions.has(data.activeRegionId)) {
                activeRegionId = data.activeRegionId;
            }
            if (data.activeLotId && lots.has(data.activeLotId)) {
                activeLotId = data.activeLotId;
            }
        }

        return {
            reset,
            registerRegion,
            connectRegions,
            getConnectedRegions,
            discoverRegion,
            registerLot,
            getRegion,
            getAllRegions,
            getLot,
            getLotsForRegion,
            getActiveLot,
            setActiveLot,
            getNextAvailableLot,
            lotToWorld,
            worldToLot,
            serialize,
            restore
        };
    }

    MO.createRegionManager = createRegionManager;
    MO.regionManager = createRegionManager();
})(window.MO = window.MO || {});

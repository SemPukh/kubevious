const Promise = require('the-promise');
const _ = require('the-lodash');
const HashUtils = require('kubevious-helpers').HashUtils;

class MarkerAccessor {
    constructor(context, dataStore) {
        this._logger = context.logger.sublogger('MarkerAccessor');
        this._dataStore = dataStore;
    }

    get logger() {
        return this._logger;
    }

    queryAll() {
        return this._dataStore.table('markers')
            .queryMany();
    }

    queryAllMarkerStatuses() {
        return this._dataStore.table('marker_statuses')
            .queryMany();
    }

    queryAllMarkerItems() {
        return this._dataStore.table('marker_items')
            .queryMany();
    }

    queryAllMarkerLogs() {
        return this._dataStore.table('marker_logs')
            .queryMany();
    }

    exportMarkers() {
        return this.queryAll()
            .then(result => {
                return {
                    kind: 'markers',
                    items: result,
                };
            });
    }

    getMarker(name) {
        return this._dataStore.table('markers')
            .query({ name: name });
    }

    createMarker(config, target) {
        return Promise.resolve()
            .then((() => {
                if (target) {
                    if (config.name != target.name) {
                        return this._dataStore.table('markers')
                            .delete(target);
                    }
                }
            }))
            .then(() => {
                return this._dataStore.table('markers')
                    .createOrUpdate({
                        name: config.name,
                        shape: config.shape,
                        color: config.color,
                        propagate: config.propagate,
                    })
            });
    }

    deleteMarker(name) {
        return this._dataStore.table('markers')
            .delete({
                name: name,
            });
    }

    importMarkers(markers, deleteExtra) {
        var markers = markers.items.map(x => this._makeDbMarker(x));
        return this._dataStore.table('markers')
            .synchronizer(null, !deleteExtra)
            .execute(markers);
    }

    _makeDbMarker(marker) {
        var markerObj = {
            name: marker.name,
            enabled: marker.enabled,
            color: marker.color,
            shape: marker.shape,
            propagate: marker.propagate,
            date: new Date(),
        }
        var hash = HashUtils.calculateObjectHash(markerObj);
        markerObj.hash = hash;
        return markerObj;
    }

}

module.exports = MarkerAccessor;

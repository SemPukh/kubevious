const Promise = require('the-promise');
const _ = require('the-lodash');

class MarkerCache {
    constructor(context) {
        this._context = context;
        this._logger = context.logger.sublogger('MarkerCache');

        context.database.onConnect(this._onDbConnected.bind(this));

        this._userMarkers = [];
        this._markerConfigDict = {};

        this._listMarkerStatuses = [];
        this._markerExecResultDict = {};
        this._markerResultsDict = {};
    }

    get logger() {
        return this._logger;
    }

    _onDbConnected() {
        this._logger.info('[_onDbConnected] ...');

        return Promise.resolve()
            .then(() => this._refreshMarkerConfigs())
            .then(() => this._refreshExecutionStatuses())
            .then(() => this._recalculateMarkerList())
            .then(() => this._notifyMarkerResults())
    }

    triggerListUpdate() {
        return Promise.resolve()
            .then(() => this._refreshMarkerConfigs())
            .then(() => this._recalculateMarkerList())
            .then(() => this._notifyMarkerResults())
    }

    _refreshExecutionStatuses() {
        var executionContext = {
            markerStatuses: {},
            markerItems: [],
            markerLogs: [],
        }

        return Promise.all([
            this._context.markerAccessor.queryAllMarkerStatuses()
                .then(result => {
                    executionContext.markerStatuses = _.makeDict(result, x => x.marker_id);
                }),
            this._context.markerAccessor.queryAllMarkerItems()
                .then(result => {
                    executionContext.markerItems = result;
                }),
            this._context.markerAccessor.queryAllMarkerLogs()
                .then(result => {
                    executionContext.markerLogs = result;
                }),
        ])
            .then(() => this._acceptExecutionContext(executionContext));
    }

    acceptExecutionContext(executionContext) {
        this._acceptExecutionContext(executionContext);
        this._recalculateMarkerList();
        this._notifyMarkerResults();
    }

    _acceptExecutionContext(executionContext) {
        this._markerExecResultDict = {};

        console.log('executionContext', executionContext)

        for (var status of _.values(executionContext.markerStatuses)) {
            this._fetchMarkerExecResult(status.marker_name).status = status;
            status.hash = status.hash.toString('hex');
            delete status.marker_name;
        }
        for (var item of executionContext.markerItems) {
            this._fetchMarkerExecResult(item.marker_name).items.push(item);
            delete item.marker_name;
        }
        for (var log of executionContext.markerLogs) {
            this._fetchMarkerExecResult(log.marker_name).logs.push(log);
            delete log.marker_name;
        }
    }

    _fetchMarkerExecResult(name) {
        if (!this._markerExecResultDict[name]) {
            this._markerExecResultDict[name] = {
                name: name,
                status: null,
                items: [],
                logs: [],
            }
        }
        return this._markerExecResultDict[name];
    }

    _acceptMarkerItems(items) {
        this._markerResultsDict = {};
        for (var x of items) {
            if (!this._markerResultsDict[x.marker_name]) {
                this._markerResultsDict[x.marker_name] = {
                    name: x.marker_name,
                    items: [],
                }
            }

            this._markerResultsDict[x.marker_name].items.push({
                dn: x.dn,
            })
        }
        this._notifyMarkerItems();
    }

    _buildMarkerList() {
        var userMarkers = [];
        for (var marker of _.values(this._markerConfigDict)) {
            var userMarker = {
                name: marker.name,
            }
            userMarkers.push(userMarker);
        }
        userMarkers = _.orderBy(userMarkers, x => x.name);
        return userMarkers;
    }

    _buildMarkerStatusList() {
        var userMarkers = [];
        for (var marker of _.values(this._markerConfigDict)) {
            var userMarker = this._buildMarkerStatus(marker.name);
            userMarkers.push(userMarker);
        }

        userMarkers = _.orderBy(userMarkers, x => x.name);

        return userMarkers;
    }

    _buildMarkerConfig(marker) {
        var userMarker = {
            name: marker.name,
            color: marker.color,
            shape: marker.shape,
            propagate: marker.propagate,
        }
        return userMarker;
    }

    _buildMarkerStatus(name) {
        var info = this._buildMarkerInfo(name);
        delete info.items;
        delete info.logs;
        return info;
    }

    _buildMarkerResult(name) {
        var info = this._buildMarkerInfo(name);
        delete info.item_count;
        return info;
    }

    _buildMarkerInfo(name) {
        var info = {
            name: name,
            is_current: false,
            error_count: 0,
            item_count: 0,
            items: [],
            logs: [],
        };

        var markerConfig = this._markerConfigDict[name];
        if (markerConfig) {
            info.color = markerConfig.color
            info.shape = markerConfig.shape

            console.log('_markerExecResultDict', this._markerExecResultDict)
            var markerExecResult = this._markerExecResultDict[name];
            if (markerExecResult) {
                var status = markerExecResult.status;
                if (status) {
                    if (markerConfig.hash == status.hash) {
                        info.is_current = true;
                    }
                    info.error_count = status.error_count;
                    info.item_count = status.item_count;
                }

                info.items = markerExecResult.items;
                info.logs = markerExecResult.logs;
            }
        }

        return info;
    }

    _recalculateMarkerList() {
        this._userMarkers = this._buildMarkerList();
        this._listMarkerStatuses = this._buildMarkerStatusList();

        this._context.websocket.update({ kind: 'markers-statuses' }, this.queryMarkerStatusList());
    }

    queryMarkerList() {
        return this._userMarkers;
    }

    queryMarkerStatusList() {
        return this._listMarkerStatuses;
    }

    _notifyMarkerResults() {
        this._markerResultsDict = {};
        for (var markerResult of _.values(this._markerExecResultDict)) {
            this._markerResultsDict[markerResult.name] = this._buildMarkerResult(markerResult.name);
        }

        var data = _.values(this._markerResultsDict).map(x => ({
            target: { name: x.name },
            value: x,
        }));

        return this._context.websocket.updateScope({ kind: 'marker-result' }, data);
    }

    _refreshMarkerConfigs() {
        return this._context.markerAccessor.queryAll()
            .then(result => {
                this._markerConfigDict = _.makeDict(result, x => x.name);
            });
    }

    _notifyMarkerItems() {
        var items = _.values(this._markerResultsDict).map(x => ({
            target: { name: x.name },
            value: x,
        }));
        this._context.websocket.updateScope({ kind: 'marker-result' }, items);
    }

    getMarkerResult(name) {
        if (this._markerResultsDict[name]) {
            return this._markerResultsDict[name];
        }
        return null;
    }

    queryMarker(name) {
        var marker = this._markerConfigDict[name];
        if (!marker) {
            return null;
        }
        var userMarker = this._buildMarkerConfig(marker);
        return userMarker;
    }
}

module.exports = MarkerCache;

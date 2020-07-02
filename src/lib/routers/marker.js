const _ = require('the-lodash');

module.exports = {
    url: '/api/v1',

    setup: ({ router, logger, context, reportUserError }) => {

        /**** Marker Configuration ***/

        // List Makers
        router.get('/markers/', (req, res) => {
            var result = context.markerCache.queryMarkerList();
            return result;
        })

        // Get Marker
        router.get('/marker/:name', (req, res) => {
            var result = context.markerCache.queryMarker(req.params.name);
            return result;
        })

        // Create Marker
        router.post('/marker/:name', (req, res) => {
            var newMarker = null;
            return context.markerAccessor
                .createMarker(req.body, { name: req.params.name })
                .then(result => {
                    newMarker = result;
                })
                .finally(() => context.markerCache.triggerListUpdate())
                .then(() => {
                    return newMarker;
                })
        })

        // Delete Marker
        router.delete('/marker/:name', (req, res) => {
            return context.markerAccessor
                .deleteMarker(req.params.name)
                .finally(() => context.markerCache.triggerListUpdate())
                .then(() => {
                    return {};
                });
        })

        // Export Makers
        router.get('/markers/export', (req, res) => {
            return context.markerAccessor
                .exportMarkers();
        })

        // Import Makers
        router.post('/markers/import', (req, res) => {

            if (req.body.data.kind != 'markers') {
                reportUserError('Invalid data provided for import');
            }

            return context.markerAccessor
                .importMarkers(req.body.data, req.body.deleteExtra)
                .finally(() => context.markerCache.triggerListUpdate())
                .then(() => {
                    return {};
                });
        })

        /**** Marker Operational ***/

        // List Rules Statuses
        router.get('/marker-statuses/', (req, res) => {
            var result = context.markerCache.queryMarkerStatusList();
            return result;
        })

        // Get Marker Result
        router.get('/marker-result/:name', (req, res) => {
            var result = context.markerCache.getMarkerResult(req.params.name)
            return result;
        })

    },

}

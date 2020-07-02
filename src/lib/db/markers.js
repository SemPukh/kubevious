module.exports = function(meta) {
    meta
    .table('markers')
        .key('name')
            .settable()
        .field('shape')
        .field('color')
        .field('propagate')
            .from(value => value ? true : false)

    .table('marker_items')
        .key('id')
        .field('marker_name')
        .field('dn')

    .table('marker_logs')
        .key('id')
        .field('marker_name')
        .field('kind')
        .field('msg')

    .table('marker_statuses')
        .key('id')
        .field('marker_name')
        .field('hash')
        .to(value => _.isString(value) ? Buffer.from(value, 'hex') : value)
        .from(value => value ? value.toString('hex') : null)
        .field('date')
        .field('error_count')
        .field('item_count')
}

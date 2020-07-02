const Promise = require('the-promise');

module.exports = function(logger, driver) {
    logger.info("MIGRATING v4");

    var queryies = [

        "CREATE TABLE IF NOT EXISTS `marker_statuses` (" +
        "`id` int unsigned NOT NULL AUTO_INCREMENT," +
        "`marker_name` varchar(128) NOT NULL," +
        "`hash` BINARY(32) NOT NULL," +
        "`date` DATETIME NOT NULL," +
        "`error_count` int unsigned NOT NULL," +
        "`item_count` int unsigned NOT NULL," +
        "PRIMARY KEY (`id`)," +
        "KEY `marker_name` (`marker_name`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=latin1;"

        ,

        "CREATE TABLE IF NOT EXISTS `marker_logs` (" +
        "`id` int unsigned NOT NULL AUTO_INCREMENT," +
        "`marker_name` varchar(128) NOT NULL," +
        "`kind` varchar(128) NOT NULL," +
        "`msg` json NOT NULL," +
        "PRIMARY KEY (`id`)," +
        "KEY `marker_name` (`marker_name`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=latin1;"

    ];

    return Promise.serial(queryies, x => driver.executeSql(x));
}

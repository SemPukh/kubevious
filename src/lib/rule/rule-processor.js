const Promise = require('the-promise');
const _ = require('the-lodash');
const KubikRuleProcessor = require('kubevious-kubik').RuleProcessor;


class RuleProcessor
{
    constructor(context, dataStore)
    {
        this._context = context;
        this._logger = context.logger.sublogger("RuleProcessor");
        this._dataStore = dataStore;

        this._ruleStatusesSynchronizer = 
            this._dataStore.table('rule_statuses')
                .synchronizer();

        this._ruleItemsSynchronizer = 
            this._dataStore.table('rule_items')
                .synchronizer();

        this._ruleLogsSynchronizer = 
            this._dataStore.table('rule_logs')
                .synchronizer();

        this._markerItemsSynchronizer = 
            this._dataStore.table('marker_items')
                .synchronizer();

        this._markerStatusesSynchronizer =
            this._dataStore.table('marker_statuses')
                .synchronizer();

        this._markerLogsSynchronizer =
            this._dataStore.table('marker_logs')
                .synchronizer();
    }

    get logger() {
        return this._logger;
    }

    execute(state, tracker)
    {
        this._logger.info("[execute] date: %s, count: %s", 
            state.date.toISOString(),
            state.getCount())

        var executionContext = {
            ruleStatuses: {},
            ruleItems: [],
            ruleLogs: [],
            markerItems: [],
            markerLogs: [],
            markerStatuses: {},
        }

        return this._fetchRules()
            .then(rules => {
                return tracker.scope("execute", (childTracker) => {
                    return this._processRules(state, rules, executionContext, childTracker);
                });
            })
            .then(() => this._saveRuleData(executionContext))
            .then(() => this._context.ruleCache.acceptExecutionContext(executionContext))
            .then(() => this._context.markerCache.acceptExecutionContext(executionContext))
            .then(() => {
                this.logger.info('[execute] END');
            })
    }

    _fetchRules()
    {
        return this._context.ruleAccessor
            .queryEnabledRules()
            .then(result => {
                return result;
            });
    }

    _processRules(state, rules, executionContext, tracker)
    {
        return Promise.serial(rules, x => {

            return tracker.scope(x.name, (childTracker) => {
                return this._processRule(state, x, executionContext)
            });

        });
    }
    
    _processRule(state, rule, executionContext)
    {
        this.logger.info('[_processRule] Begin: %s', rule.name);
        this.logger.verbose('[_processRule] Begin: ', rule);

        executionContext.ruleStatuses[rule.name] = {
            rule_name: rule.name,
            hash: rule.hash,
            date: new Date(),
            error_count: 0,
            item_count: 0
        };

        var processor = new KubikRuleProcessor(state, rule);
        return processor.process()
            .then(result => {
                this.logger.silly('[_processRule] RESULT: ', result);
                this.logger.silly('[_processRule] RESULT ITEMS: ', result.ruleItems);

                if (result.success)
                {
                    for(var dn of _.keys(result.ruleItems))
                    {
                        this.logger.debug('[_processRule] RuleItem: %s', dn);

                        var ruleItemInfo = result.ruleItems[dn];

                        var ruleItem = {
                            errors: 0,
                            warnings: 0
                        };

                        var alertsToRaise = [];

                        if (ruleItemInfo.errors) {

                            if (ruleItemInfo.errors.messages)
                            {
                                ruleItem.errors = ruleItemInfo.errors.messages.length;
                                for(var msg of ruleItemInfo.errors.messages)
                                {
                                    alertsToRaise.push({ 
                                        severity: 'error',
                                        message:  'Rule ' + rule.name + ' failed. ' + msg
                                    });
                                }
                            }
                            else
                            {
                                ruleItem.errors = 1;
                                alertsToRaise.push({ 
                                    severity: 'error',
                                    message:  'Rule ' + rule.name + ' failed.'
                                });
                            }
                        }
                        else if (ruleItemInfo.warnings)
                        {
                            if (ruleItemInfo.warnings.messages)
                            {
                                ruleItem.warnings = ruleItemInfo.warnings.messages.length;
                                for(var msg of ruleItemInfo.warnings.messages)
                                {
                                    alertsToRaise.push({ 
                                        severity: 'warn',
                                        message:  'Rule ' + rule.name + ' failed. ' + msg
                                    });
                                }
                            }
                            else
                            {
                                ruleItem.warnings = 1;
                                alertsToRaise.push({ 
                                    severity: 'warn',
                                    message:  'Rule ' + rule.name + ' failed.'
                                });
                            }
                        }

                        var shouldUseRuleItem = false;

                        for(var alertInfo of alertsToRaise)
                        {
                            shouldUseRuleItem = true;

                            state.raiseAlert(dn, {
                                id: 'rule-' + rule.name,
                                severity: alertInfo.severity,
                                msg: alertInfo.message,
                                source: {
                                    kind: 'rule',
                                    id: rule.name
                                }
                            });
                        }

                        if (ruleItemInfo.marks)
                        {
                            for(var marker of _.keys(ruleItemInfo.marks))
                            {
                                state.raiseMarker(dn, marker);
                                shouldUseRuleItem = true;
                                if (!ruleItem.markers) {
                                    ruleItem.markers = [];
                                }
                                ruleItem.markers.push(marker);

                                executionContext.markerItems.push({
                                    marker_name: marker,
                                    dn: dn
                                });
                            }
                        }

                        if (shouldUseRuleItem)
                        {
                            executionContext.ruleStatuses[rule.name].item_count++;

                            ruleItem.rule_name = rule.name;
                            ruleItem.dn = dn;
                            executionContext.ruleItems.push(ruleItem);
                        }
                    }
                }
                else
                {
                    this.logger.error('[_processRule] Failed: ', result.messages);

                    for(var msg of result.messages)
                    {
                        executionContext.ruleLogs.push({
                            rule_name: rule.name,
                            kind: 'error',
                            msg: msg
                        });

                        executionContext.ruleStatuses[rule.name].error_count++;
                    }
                }
            });
    }

    _saveRuleData(executionContext)
    {
        return this._context.database.driver.executeInTransaction(() => {
            return Promise.resolve()
                .then(() => this._syncRuleStatuses(executionContext))
                .then(() => this._syncRuleItems(executionContext))
                .then(() => this._syncRuleLogs(executionContext))
                .then(() => this._syncMarkerStatuses(executionContext))
                .then(() => this._syncMarkerItems(executionContext))
                .then(() => this._syncMarkerLogs(executionContext));
        });
    }

    _syncRuleStatuses(executionContext)
    {
        this.logger.info('[_syncRuleStatuses] Begin');
        this.logger.debug('[_syncRuleStatuses] Begin', executionContext.ruleStatuses);
        return this._ruleStatusesSynchronizer.execute(_.values(executionContext.ruleStatuses));
    }

    _syncRuleItems(executionContext)
    {
        this.logger.info('[_syncRuleItems] Begin');
        this.logger.debug('[_syncRuleItems] Begin', executionContext.ruleItems);
        return this._ruleItemsSynchronizer.execute(executionContext.ruleItems);
    }

    _syncRuleLogs(executionContext)
    {
        this.logger.info('[_syncRuleLogs] Begin');
        this.logger.debug('[_syncRuleLogs] Begin', executionContext.ruleLogs);
        return this._ruleLogsSynchronizer.execute(executionContext.ruleLogs);
    }

    _syncMarkerStatuses(executionContext)
    {
        this.logger.info('[_syncMarkerStatuses] Begin');
        this.logger.debug('[_syncMarkerStatuses] Begin', executionContext.markerStatuses);
        return this._markerStatusesSynchronizer.execute(_.values(executionContext.markerStatuses));
    }

    _syncMarkerLogs(executionContext)
    {
        this.logger.info('[_syncMarkerLogs] Begin');
        this.logger.debug('[_syncMarkerLogs] Begin', executionContext.markerLogs);
        return this._markerLogsSynchronizer.execute(executionContext.markerLogs);
    }

    _syncMarkerItems(executionContext)
    {
        this.logger.info('[_syncMarkerItems] Begin');
        this.logger.debug('[_syncMarkerItems] Begin', executionContext.markerItems);
        return this._markerItemsSynchronizer.execute(executionContext.markerItems);
    }
    
}

module.exports = RuleProcessor;

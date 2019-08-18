
/* 
jshint -W097 */// jshint strict:false
/*jslint node: true */
//jshint esversion:6

"use strict";

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const Controller = require(__dirname + '/lib/bravia');
const ping = require(__dirname + '/lib/ping');

let isConnected = null;
let device;

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
let adapter;

let powerStatus = null;

function startAdapter(options) {
    options = options || {};

    
    Object.assign(options, {
        name: 'sony-bravia',
        stateChange: function (id, state) {            
            if (id && state && !state.ack) {
               handleStateCommand(id, state);
            }
        },
        ready: main
    });

    adapter = new utils.Adapter(options);

    return adapter;
}

function handleStateCommand(id, state) {
    adapter.log.debug("handleStateCommand called for id=" + id);

    if (id.endsWith("info.triggerUpdateStatus")) {    
        if (state.val != null && state.val) {
            setImmediate(() => {
                checkStatus(); 
            });
        }
        return;
    } else if (id.endsWith("info.powerstatus")) {
        return; // ignored
    }else if (id.endsWith("info.powerstatus")) {
        return;// ignored
    }
    id = id.substring(id.lastIndexOf('.') + 1);
    device.send(id);
} 

function setConnected(_isConnected) {
    if (isConnected !== _isConnected) {
        isConnected = _isConnected;
        adapter.setState('info.connection', {
            val: isConnected,
            ack: true
        });
    }
}

function main() {

    if (adapter.config.ip && adapter.config.ip !== '0.0.0.0' && adapter.config.psk) {
        device = new Controller(adapter.config.ip, '80', adapter.config.psk, 5000);
        // in this template all states changes inside the adapters namespace are subscribed
        adapter.subscribeStates('*');
        powerStatus = "";
        checkStatus();

        let interval = 60000;
        if (adapter.config.syncseconds != null && Number(adapter.config.syncseconds) >= 0) {

            interval = Number(adapter.config.syncseconds) * 1000;
        }
    
        if (interval > 0) {
            adapter.log.debug("Starting refresh timer(interval=" + interval + " milli-seconds)");
            setInterval(checkStatus, interval);        
        } else {
            adapter.log.debug("Disabled refresh timer because interval=" + interval);
        }

    } else {
        adapter.log.error("Please configure the Sony Bravia adapter");
    }

}
function checkStatus() {
    ping.probe(adapter.config.ip, {
        log: adapter.log.debug
    }, function (err, result) {        
        if (err) {
            adapter.log.error(err);
        }
        if (result) {
            setConnected(result.alive);

            if (device != null && result.alive) {
                adapter.log.debug("device.getPowerStatus()...");
                device.getPowerStatus().then(response => {                            
                    adapter.log.debug("device.getPowerStatus: response=" + JSON.stringify(response));
                    try {
                    if (response != null) {
                        if (response.status != null) {
                            adapter.log.debug("device.getPowerStatus: status=" + response.status);
                                let powerStatusChanged = powerStatus != response.status;

                                powerStatus = response.status;
                            adapter.setState('info.powerstatus', {
                                val: response.status,
                                ack: true
                            });
                        } else {
                                powerStatus = "errorstatus";
                            adapter.setState('info.powerstatus', {
                                val: "errorstatus",
                                ack: true
                            });
                        }
                        
                            adapter.getState('info.triggerUpdateStatus', function (err, s) {
                                if (s != null && (s.val == null || s.val)) adapter.setState('info.triggerUpdateStatus', {
                                    val: false,
                                    ack: true
                                });
                        });

                    } else {
                            powerStatus = "errornoresponse";
                        adapter.setState('info.powerstatus', {
                            val: "errornoresponse",
                            ack: true
                        });
                    }
                    } catch (e) {
                        adapter.log.error("device.getPowerStatus crash after response=" + response + ". e=" + e + " stack=" + e.stack);

                    }

                }, reject => {
                    adapter.log.debug("device.getPowerStatus failed ..." + reject);
                    powerStatus = "errorcon";
                    adapter.setState('info.powerstatus', {
                        val: "errorcon",
                        ack: true
                    });
                });
            } else {
                powerStatus = "errorping";
                adapter.setState('info.powerstatus', {
                    val: "errorping",
                    ack: true
                });
            }
        } else {
            powerStatus = "errorping";
            adapter.setState('info.powerstatus', {
                val: "errorping",
                ack: true
            });
        }
    });
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} 
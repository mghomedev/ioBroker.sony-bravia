/* 
jshint -W097 */ // jshint strict:false
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
    } else if (id.endsWith("triggerUpdateSpeakerAndVolumeStatus")) {
        if (state.val != null && state.val) {
            setImmediate(() => {
                refreshInputAndVolumeInformation();
            });
        }
        return;
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

function isRefreshInputAndVolumeInformationPossible() {
    if (adapter == null || device == null) {
        adapter.log.debug("isRefreshInputAndVolumeInformationPossible=false (instance missing)");

        return false;
    }
    if (powerStatus != "active") {
        adapter.log.debug("isRefreshInputAndVolumeInformationPossible=false");
        return false;
    } else {
        adapter.log.debug("isRefreshInputAndVolumeInformationPossible=true");
    }
    return true;
}

function handleVolumeInformationResponse(response, soundSettingsTargetSystemOrNull) {

    let minVolume = 0;
    let maxVolume = 100;
    if (response.minVolume != null) {
        minVolume = response.minVolume;
    }
    if (response.maxVolume != null) {
        maxVolume = response.maxVolume;
    }

    let volume = response.volume;
    adapter.log.debug("refreshInformationVolumeLevel=" + volume);


    if (maxVolume != 100 && minVolume != 0 && maxVolume > minVolume) {
        volume = (volume - minVolume) * 100 / (maxVolume - minVolume);
    }

    let isSpeaker = response.target != null && response.target.indexOf("speaker") >= 0;
    let isHeadphone = response.target != null && response.target.indexOf("headphone") >= 0;

    let soundSettingsTargetSystemIsHeadphone = soundSettingsTargetSystemOrNull != null && soundSettingsTargetSystemOrNull.indexOf("headphone") >= 0;

    if (response.target == null || response.target == "" || isSpeaker) {
        adapter.setState("audio.volumeSpeaker", {
            val: volume,
            ack: true
        });


        adapter.setState("audio.muteSpeaker", {
            val: response.mute,
            ack: true
        });
    }

    if (response.target == null || response.target == "" || isHeadphone) {
        // note that IP cannot change headphone volume see https://pro-bravia.sony.net/faq/134/
        adapter.setState("audio.volumeHeadphone", {
            val: volume,
            ack: true
        });

        adapter.setState("audio.muteHeadphone", {
            val: response.mute,
            ack: true
        });
    }

    if (response.target == null || response.target == "" ||
        soundSettingsTargetSystemOrNull == null || soundSettingsTargetSystemOrNull == "" ||
        soundSettingsTargetSystemIsHeadphone == isHeadphone) {
        adapter.setState("audio.volume", {
            val: volume,
            ack: true
        });

        adapter.setState("audio.mute", {
            val: response.mute,
            ack: true
        });
    }

    if (soundSettingsTargetSystemOrNull == null || soundSettingsTargetSystemOrNull == "") {
        adapter.setState("audio.target", {
            val: response.target,
            ack: true
        });
    } else {
        adapter.setState("audio.target", {
            val: soundSettingsTargetSystemOrNull,
            ack: true
        });
    }


}

function refreshInformationVolumeLevel() {

    if (!isRefreshInputAndVolumeInformationPossible()) {
        adapter.log.debug("refreshInformationVolumeLevel not possible in current state.");

        return;
    }
    try {
        adapter.log.debug("refreshInformationVolumeLevel...");
        device.getSoundSettingsTargetSystemOrNull().then(soundSettingsTargetSystemOrNull => {

            adapter.log.debug("soundSettingsTargetSystemOrNull=" + soundSettingsTargetSystemOrNull);

            device.getVolumeInformation().then(response => {
                adapter.log.debug("refreshInformationVolumeLevel.res=" + JSON.stringify(response));

                try {

                    if (Array.isArray(response)) {
                        response.forEach(element => {
                            handleVolumeInformationResponse(element, soundSettingsTargetSystemOrNull);
                        });
                    } else {
                        handleVolumeInformationResponse(response, soundSettingsTargetSystemOrNull);
                    }

                } catch (er) {
                    adapter.log.error("refreshInformationVolumeLevel response processing error:" + er);

                }

            }, reject => {
                adapter.log.debug("refreshInformationVolumeLevel FAILED:" + reject);
            });
        });
    } catch (e) {
        adapter.log.error("refreshInformationVolumeLevel crash:" + e);

    }
}

function refreshInputAndVolumeInformation() {
    if (!isRefreshInputAndVolumeInformationPossible()) return;

    adapter.log.debug("refreshInputAndVolumeInformation...");

    refreshInformationVolumeLevel();
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
                                }, function () {
                                    try {
                                        if (powerStatusChanged || isRefreshInputAndVolumeInformationPossible()) {
                                            refreshInputAndVolumeInformation();
                                        }
                                    } catch (er) {
                                        adapter.log.error("device.getPowerStatus crash during refreshInputAndVolumeInformation after response=" + response + ". er=" + er + " stack=" + er.stack);
                                    }
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
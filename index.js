'use strict';

var cbusUtils    = require('./cbus-utils.js');
var cbusClient = require('./cgate-client.js');
var Service, Characteristic, Accessory, uuid;

var CBusAccessory;
var CBusLightAccessory;
var CBusDimmerAccessory;
var CBusMotionAccessory;

//==========================================================================================
//  Exports block
//==========================================================================================
module.exports = function(homebridge) {
    //--------------------------------------------------
    //  Setup the global vars
    //--------------------------------------------------
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;
    uuid = homebridge.hap.uuid;

    //--------------------------------------------------
    //  Setup the CBus accessories
    //--------------------------------------------------

    /* Load */
    CBusAccessory        = require('./accessories/accessory.js')(Service, Characteristic, Accessory, uuid);
    CBusLightAccessory   = require('./accessories/light-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
    CBusDimmerAccessory  = require('./accessories/dimmer-accessory.js')(Service, Characteristic, CBusLightAccessory, uuid);
    CBusMotionAccessory   = require('./accessories/motion-accessory.js')(Service, Characteristic, CBusAccessory, uuid);

    /* Fix inheritance, since we've loaded our classes before the Accessory class has been loaded */
    cbusUtils.fixInheritance(CBusAccessory, Accessory);
    cbusUtils.fixInheritance(CBusLightAccessory, CBusAccessory);
    cbusUtils.fixInheritance(CBusDimmerAccessory, CBusLightAccessory);
    cbusUtils.fixInheritance(CBusMotionAccessory, CBusAccessory);

    //--------------------------------------------------
    //  Register ourselfs with homebridge
    //--------------------------------------------------

    homebridge.registerPlatform("homebridge-cbus", "CBus", CBusPlatform);
};

//==========================================================================================
//  CBus Platform
//==========================================================================================

function CBusPlatform(log, config) {
    //--------------------------------------------------
    //  vars definition
    //--------------------------------------------------
    this.clientIpAddress     = undefined;
    this.clientControlPort   = undefined;
    this.clientEventPort     = undefined;
    this.clientStatusPort    = undefined;
    this.clientCbusName      = undefined;
    this.clientNetwork       = undefined;
    this.clientApplication   = undefined;
    this.clientDebug         = undefined;
    this.config	             = config;
    this.log                 = log;
    this.foundAccessories    = [];
    this.client              = undefined;

    //--------------------------------------------------
    //  vars setup, required and default overrides
    //--------------------------------------------------

    /* Client IP */
    if (typeof(config.client_ip_address) == "undefined" || typeof(config.client_cbusname) == "undefined") {
        throw new Error('You must specify the client IP address and CBus name in your config file.');
    }

    this.clientIpAddress = config.client_ip_address;
    this.clientCbusName = config.client_cbusname;

    /* Client Control Port */
    if (typeof(config.client_controlport) != "undefined") {
      this.clientControlPort = config.client_contolport;
    }

    /* Client Event Port */
    if (typeof(config.client_eventport) != "undefined") {
      this.clientEventPort = config.client_eventport;
    }

    /* Client Status Port */
    if (typeof(config.client_statusport) != "undefined") {
      this.clientStatusPort = config.client_statusport;
    }

    /* Client Network Address */
    if (typeof(config.client_network) != "undefined") {
      this.clientNetwork = config.client_network;
    }

    /* Client Application Address */
    if (typeof(config.client_application) != "undefined") {
      this.clientApplication = config.client_application;
    }

    /* Client Debug */
    if (typeof(config.client_debug) != "undefined") {
      this.clientDebug = config.client_debug;
    }
};

// Invokes callback(accessories[])
CBusPlatform.prototype.accessories = function(callback) {
    //--------------------------------------------------
    //  Initiate the CBus client
    //--------------------------------------------------

    this.log.info("Connecting to the local CBus server...");

    this.client = new cbusClient(this.clientIpAddress, this.clientControlPort, this.clientEventPort, this.clientStatusPort, this.clientCbusName, this.clientNetwork, this.clientApplication, this.clientDebug);

    // listen for data from the client and ensure that the homebridge UI is updated
    this.client.on("remoteData", function(data){
        if(this.clientDebug){
            this.log.info("[remoteData] id:"+data.group);
        }
        var devs = this.foundAccessories;
        for (var i = 0; i < devs.length; i++) {
            var dev = devs[i];
            if(dev.id == data.group){
                if(this.clientDebug){
                    this.log.info("[remoteDataFound] id:"+data.group+" type:"+dev.type+" level:"+data.level);
                }
                if(dev.type == "light"){
                    if(data.level > 0) {
                        dev.lightService.getCharacteristic(Characteristic.On).setValue(true, undefined, 'remoteData');
                    } else if (data.level == 0) {
                        dev.lightService.getCharacteristic(Characteristic.On).setValue(false, undefined, 'remoteData');    
                    }
                } else if (dev.type == "dimmer"){
                    if (data.level == 0) {
                        dev.lightService.getCharacteristic(Characteristic.On).setValue(false, undefined, 'remoteData');    
                    } else if (data.level == 100) { 
                        dev.lightService.getCharacteristic(Characteristic.On).setValue(true, undefined, 'remoteData');   
                    } 
                    dev.lightService.getCharacteristic(Characteristic.Brightness).setValue(data.level, undefined, 'remoteData');
                    
                } else if (dev.type == "motion"){
                    dev.motionService.getCharacteristic(Characteristic.MotionDetected).setValue(data.level > 0 ? true:false);
                }
                
            }
        }
    }.bind(this));

    this.client.connect(function() {
        this.log.info('CBus Client is listening to CGate on ' + this.client.clientIpAddress +'... Debug: '+this.client.clientDebug);

        this.log.info("Registering the accessories list...");
        this.foundAccessories = []; /* reset */

        for (var accessoryData of this.config.accessories) {

            // make sure we use uuid_base so we dont see uuid collisions
            accessoryData.uuid_base = accessoryData.id;

            var accessory = this.accessoryFactory(accessoryData);
            if (accessory) {
                this.foundAccessories.push(accessory);
            } else {
                this.log.error("Ignoring unknown accessory (type: %s).", accessoryData.type);
            }
        }

        callback(this.foundAccessories.sort(function (a, b) {
            return (a.name > b.name) - (a.name < b.name);
        }));
    }.bind(this));
};

CBusPlatform.prototype.accessoryFactory = function(entry) {
    if (!entry.type) {
        return undefined;
    }

    switch (entry.type.toLowerCase())
    {
        case "light":
            return new CBusLightAccessory(this, entry);
        case "dimmer":
            return new CBusDimmerAccessory(this, entry);
        case "motion":
            return new CBusMotionAccessory(this, entry);
        default:
            return undefined;
    }
};
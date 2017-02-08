'use strict';

const CGateClient = require('./cgate-client.js');
const CBusNetId = require('./cbus-netid.js');
const cbusUtils = require('./cbus-utils.js');

let Service, Characteristic, Accessory, uuid;
let CBusAccessory, CBusLightAccessory, CBusDimmerAccessory, CBusMotionAccessory, CBusSecurityAccessory, CBusShutterAccessory;

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

    // load
    CBusAccessory = require('./accessories/accessory.js')(Service, Characteristic, Accessory, uuid);
    CBusLightAccessory = require('./accessories/light-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
    CBusDimmerAccessory = require('./accessories/dimmer-accessory.js')(Service, Characteristic, CBusLightAccessory, uuid);
    CBusMotionAccessory = require('./accessories/motion-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
    CBusSecurityAccessory = require('./accessories/security-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
    CBusShutterAccessory = require('./accessories/shutter-accessory.js')(Service, Characteristic, CBusAccessory, uuid);

    // fix inheritance, since we've loaded our classes before the Accessory class has been loaded
    cbusUtils.fixInheritance(CBusAccessory, Accessory);
    cbusUtils.fixInheritance(CBusLightAccessory, CBusAccessory);
    cbusUtils.fixInheritance(CBusDimmerAccessory, CBusLightAccessory);
    cbusUtils.fixInheritance(CBusMotionAccessory, CBusAccessory);
    cbusUtils.fixInheritance(CBusSecurityAccessory, CBusAccessory);
    cbusUtils.fixInheritance(CBusShutterAccessory, CBusAccessory);
	
	// register ourself with homebridge
    homebridge.registerPlatform("homebridge-cbus", "CBus", CBusPlatform);
};

//==========================================================================================
//  CBus Platform
//==========================================================================================

function CBusPlatform(log, config) {
    //--------------------------------------------------
    //  vars definition
    //--------------------------------------------------
	
    this.config	             = config;
    this.log                 = log;
    this.foundAccessories    = [];
    this.client              = undefined;

    //--------------------------------------------------
    //  setup vars
    //--------------------------------------------------

    // client IP and port
    if (typeof(config.client_ip_address) === `undefined`) {
        throw new Error('client IP address missing');
    }
    this.cgateIpAddress = config.client_ip_address;
	this.cgateControlPort = (typeof(config.client_contolport) !== 'undefined') ? config.client_contolport : undefined;
	
	// project name, network and default application
	try {
		this.project = CBusNetId.validatedProjectName(config.client_cbusname);
	} catch (ex) {
		throw new Error(`illegal client_cbusname`);
	}
	this.network = (typeof(config.client_network) !== `undefined`) ? config.client_network : undefined;
	this.application = (typeof(config.client_application) !== `undefined`) ? config.client_application : undefined;
		
    // debug
    this.clientDebug = (typeof(config.client_debug) != `undefined`) ? config.client_debug : false;
}

// Invokes callback(accessories[])
CBusPlatform.prototype.accessories = function(callback) {
    //--------------------------------------------------
    //  Initiate the CBus client
    //--------------------------------------------------

    this.log.info("Connecting to the local C-Gate server...");

    this.client = new CGateClient(this.cgateIpAddress, this.cgateControlPort,
        this.project, this.network, this.application,
        this.log, this.clientDebug);

    // listen for data from the client and ensure that the homebridge UI is updated
    this.client.on('remoteData', function(data) {
        if(this.clientDebug){
            this.log.info("[remote] id:" + data.netId.moduleId);
        }

        // TODO change this to a map
        if (typeof data.netId == undefined) {
            this.log.info("[remote] :" + data.netId.moduleId);
        }
        var devs = this.foundAccessories;
        for (var i = 0; i < devs.length; i++) {
            var dev = devs[i];
            if(dev.id == data.netId.moduleId) {
                if(this.clientDebug) {
                    this.log.info(`[remote] id: ${data.netId.moduleId} ${data.netId}, type: ${dev.type}, level: ${data.level}%`);
                }
                
                // if we found a device, it must be supported
                dev.processClientData(data.level);
            }
        }
    }.bind(this));

    this.client.connect(function() {
        this.log.info("Registering the accessories list...");
        this.foundAccessories = []; /* reset */

        for (let accessoryData of this.config.accessories) {
            // make sure we use uuid_base so we dont see uuid collisions
            // unused? accessoryData.uuid_base = accessoryData.id;

			try {
				let accessory = this.accessoryFactory(accessoryData);
				this.foundAccessories.push(accessory);
			} catch (ex) {
				this.log.error(`Unable to instantiate accessory of type '${accessoryData.type}' (reason: ${ex}). ABORTING`);
				process.exit(0);
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

    switch (entry.type.toLowerCase()) {
        case "light":
            return new CBusLightAccessory(this, entry);
            
        case "dimmer":
            return new CBusDimmerAccessory(this, entry);
            
        case "motion":
            return new CBusMotionAccessory(this, entry);
            
        case "security":
            return new CBusSecurityAccessory(this, entry);
            
        case "shutter":
            return new CBusShutterAccessory(this, entry);
            
        default:
            throw `unknown accessory`;
    }
};

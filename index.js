'use strict';

const util = require('util');
const chalk = require('chalk');
const debug = require('debug')('cbus');
const debugLevel = require('debug')('cbus:level');

const CGateClient = require(`./cgate-client.js`);
const CGateDatabase = require(`./cgate-database.js`);

const CBusNetId = require(`./cbus-netid.js`);
const cbusUtils = require(`./cbus-utils.js`);

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
	this.accessoryDefinitions = new Map([
		[ "light", CBusLightAccessory ],
		[ "dimmer", CBusDimmerAccessory ],
		[ "motion", CBusMotionAccessory ],
		[ "security", CBusSecurityAccessory ],
		[ "shutter", CBusShutterAccessory ]
	]);
	
	//--------------------------------------------------
	//  vars definition
	//--------------------------------------------------
    this.config	             = config;
    this.log                 = log;
    this.registeredAccessories = undefined;
    this.client = undefined;
    this.database = undefined;

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
		throw new Error(`illegal client_cbusname: ${config.client_cbusname}`);
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
	debug(`Connecting to the local C-Gate server...`);

    this.client = new CGateClient(this.cgateIpAddress, this.cgateControlPort,
        this.project, this.network, this.application,
        this.log, this.clientDebug);
    
    this.database = new CGateDatabase(new CBusNetId(this.project, this.network), this.log);

    // listen for data from the client and ensure that the homebridge UI is updated
    this.client.on(`event`, function(message) {
    	if (message.netId) {
    		const tag = this.database ? this.database.getTag(message.netId) : `NYI`;
    		
    		let sourceTag;
    		if (typeof message.sourceunit !== `undefined`) {
    			const sourceId = new CBusNetId(this.project, this.network, `p`, message.sourceunit);
				sourceTag = this.database.getTag(sourceId);
			} else {
				sourceTag = `unknown`;
			}
			
			// lookup accessory
			let output;
			const accessory = this.registeredAccessories.get(message.netId.getHash());
			if (accessory) {
				// process if found
				output = `registered accessory ${chalk.red.bold(accessory.name)} (${accessory.type}: '${tag}') set to level ${message.level}%`;
				accessory.processClientData(message);
			} else {
				output = `unregistered accessory ('${chalk.red.bold(tag)}') set to level ${message.level}%`;
			}
			
			if (sourceTag) {
				output = `${output}, by '${chalk.red.bold(sourceTag)}'`;
			}
			
			debugLevel(output);
		}
    }.bind(this));

    this.client.connect(function() {
		this.database.fetch(this.client, () => {
			debug(`Successfully fetched ${this.database.applications.length} applications, ${this.database.groupMap.size} groups and ${this.database.unitMap.size} units from C-Gate.`);
		});
    	
		const accessories = this._createAccessories();
		
		// build the lookup map
		this.registeredAccessories = new Map();
		for (const accessory of accessories) {
			this.registeredAccessories.set(accessory.netId.getHash(), accessory);
		}
		
		// hand them back to the callback to fire them up
		debug("Registering the accessories list...");
		callback(accessories);
    }.bind(this));
};

// return a map of newly minted accessories
CBusPlatform.prototype._createAccessories = function () {
	debug("Loading the accessories list...");
	
	const accessories = [];
	
	for (let accessoryData of this.config.accessories) {
		try {
			const accessory = this.createAccessory(accessoryData);
			accessories.push(accessory);
		} catch (ex) {
			this.log.error(`Unable to instantiate accessory of type '${accessoryData.type}' (reason: ${ex}). ABORTING`);
			process.exit(0);
		}
	}
	
	// sort them for good measure
	accessories.sort(function (a, b) {
		return (a.name > b.name) - (a.name < b.name);
	});
	
	return accessories;
};

CBusPlatform.prototype.createAccessory = function(entry) {
	console.assert(typeof entry.type === `string`, `accessory missing type property`);
	
	const constructor = this.accessoryDefinitions.get(entry.type);
	if (!constructor) {
		throw new (`unknown accessory type '${entry.type}'`);
	}
	
	return new constructor(this, entry);
};

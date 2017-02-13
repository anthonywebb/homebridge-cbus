'use strict';

const util = require('util');

const xml2js = require('xml2js');

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
    this.log.info(`Connecting to the local C-Gate server...`);

    this.client = new CGateClient(this.cgateIpAddress, this.cgateControlPort,
        this.project, this.network, this.application,
        this.log, this.clientDebug);

    // listen for data from the client and ensure that the homebridge UI is updated
    this.client.on(`event`, function(message) {
    	if (message.netId) {
			const dbLabel = this.getNetLabel(message.netId);
			
			// lookup accessory
			const accessory = this.registeredAccessories.get(message.netId.getModuleId());
			if (accessory) {
				// process if found
				this.log.info(`[remote] ${message.netId} ${accessory.name} (${accessory.type}), level: ${message.level}%`);
				accessory.processClientData(message);
			} else {
				this.log.info(`[remote] ${message.netId} not registered ('${dbLabel}')`);
			}
		}
    }.bind(this));

    this.client.connect(function() {
		this.client.getDB(result => {
			// const portion = result.snippet.content.slice(0, 200);
			this.log.info(`snippet ${util.inspect(result.snippet)} (${result.snippet.content.length} bytes)`);
			
			xml2js.parseString(result.snippet.content, {
				normalizeTags: true
			}, (err, result) => {
				this.applications = new Map();
				result.network.application.forEach(srcApplication => {
					const application = {
						address: cbusUtils.integerise(srcApplication.address[0]),
						name: srcApplication.tagname[0],
						groups: new Map()
					};
					this.applications.set(application.address, application);
					
					// now descend into groups
					srcApplication.group.forEach(srcGroup => {
						const group = {
							address: cbusUtils.integerise(srcGroup.address[0]),
							name: srcGroup.tagname[0]
						};
						application.groups.set(group.address, group);
					});
				});
				// this.log.info(`done`);
				// console.log(util.inspect(this.applications));
			});
		});
    	
		const accessories = this._createAccessories();
		
		// build the lookup map
		this.registeredAccessories = new Map();
		for (const accessory of accessories) {
			this.registeredAccessories.set(accessory.netId.getModuleId(), accessory);
		}
		
		// hand them back to the callback to fire them up
		this.log.info("Registering the accessories list...");
		callback(accessories);
    }.bind(this));
};

CBusPlatform.prototype.getNetLabel = function(netId) {
	console.assert(this.project === netId.project, `getGroupName can only search in default project`);
	console.assert(this.network === netId.network, `getGroupName can only search in default network`);
	
	let name;
	if (typeof netId.application != `undefined`) {
		// we have an application identifier
		const application = this.applications.get(netId.application);
		if (application) {
			// we found the application
			if (typeof netId.group == `undefined`) {
				// we don't have a group; use the application name
				name = application.name;
			} else {
				// group is defined
				const group = application.groups.get(netId.group);
				if (group) {
					// we found the group
					name = group.name;
				}
			}
		}
	} else {
		name = `network`;
	}
	
	if (typeof name == `undefined`) {
		name = `not-found`;
	}
	
	return name;
};

// return a map of newly minted accessories
CBusPlatform.prototype._createAccessories = function () {
	this.log.info("Loading the accessories list...");
	
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
	if (!entry.type) {
		throw `every accessory must have a type`;
	}
	
	const constructor = this.accessoryDefinitions.get(entry.type);
	if (!constructor) {
		throw `unknown accessory type '${entry.type}`;
	}
	
	return new constructor(this, entry);
};

'use strict';

const chalk = require('chalk');

require('./hot-debug.js');

const log = require('debug')('cbus:platform');
const logLevel = require('debug')('cbus:level');
const logClient = require('debug')('cbus:client');

const CGateClient = require(`./lib/cgate-client.js`);
const CGateDatabase = require(`./lib/cgate-database.js`);

const CBusNetId = require(`./lib/cbus-netid.js`);
const cbusUtils = require(`./lib/cbus-utils.js`);

// ==========================================================================================
// Exports block
// ==========================================================================================

module.exports = function (homebridge) {
	//--------------------------------------------------
	//  Setup the global vars
	//--------------------------------------------------
	const Service = homebridge.hap.Service;
	const Characteristic = homebridge.hap.Characteristic;
	const Accessory = homebridge.hap.Accessory;
	const uuid = homebridge.hap.uuid;

	//--------------------------------------------------
	//  Setup the CBus accessories
	//--------------------------------------------------

	// load
	const CBusAccessory = require('./accessories/accessory.js')(Service, Characteristic, Accessory, uuid);
	const CBusLightAccessory = require('./accessories/light-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusDimmerAccessory = require('./accessories/dimmer-accessory.js')(Service, Characteristic, CBusLightAccessory, uuid);
	const CBusMotionAccessory = require('./accessories/motion-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusSecurityAccessory = require('./accessories/security-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusShutterAccessory = require('./accessories/shutter-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusSwitchAccessory = require('./accessories/switch-accessory.js')(Service, Characteristic, CBusAccessory, uuid);

	// fix inheritance, since we've loaded our classes before the Accessory class has been loaded
	cbusUtils.fixInheritance(CBusAccessory, Accessory);
	cbusUtils.fixInheritance(CBusLightAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusDimmerAccessory, CBusLightAccessory);
	cbusUtils.fixInheritance(CBusMotionAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusSecurityAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusShutterAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusSwitchAccessory, CBusAccessory);

	// register ourself with homebridge
	homebridge.registerPlatform('homebridge-cbus', 'CBus', CBusPlatform);

	// build the accessory definition map
	module.exports.accessoryDefinitions = {
		light: CBusLightAccessory,
		dimmer: CBusDimmerAccessory,
		motion: CBusMotionAccessory,
		security: CBusSecurityAccessory,
		shutter: CBusShutterAccessory,
		switch: CBusSwitchAccessory
	};
};

// ==========================================================================================
// CBus Platform
// ==========================================================================================

function CBusPlatform(ignoredLog, config) {
	// log is now unused

	//--------------------------------------------------
	//  vars definition
	//--------------------------------------------------
	this.config = config;

	this.registeredAccessories = undefined;
	this.client = undefined;
	this.database = undefined;

	//--------------------------------------------------
	//  setup vars
	//--------------------------------------------------

	// client IP and port
	if (typeof config.client_ip_address === `undefined`) {
		throw new Error('client IP address missing');
	}
	this.cgateIpAddress = config.client_ip_address;
	this.cgateControlPort = (typeof config.client_contolport === `undefined`) ? undefined : config.client_contolport;

	// project name, network and default application
	try {
		this.project = CBusNetId.validatedProjectName(config.client_cbusname);
	} catch (err) {
		throw new Error(`illegal client_cbusname: ${config.client_cbusname}`);
	}

	this.network = (typeof config.client_network === `undefined`) ? undefined : config.client_network;
	this.application = (typeof config.client_application === `undefined`) ? undefined : config.client_application;

	//--------------------------------------------------
	//  setup logging
	//--------------------------------------------------
	log.enable(true);

	// if set, client_debug overrides the setting in the environment
	if (typeof config.client_debug !== `undefined`) {
		logClient.enable(config.client_debug);
	}
}

// Invokes callback(accessories[])
CBusPlatform.prototype._processEvent = function (message) {
	if (message.netId) {
		const tag = this.database ? this.database.getTag(message.netId) : `NYI`;

		let source;
		if (typeof message.sourceunit !== `undefined`) {
			const sourceId = new CBusNetId(this.project, this.network, `p`, message.sourceunit);
			source = this.database.getNetworkEntity(sourceId);
		}

		// lookup accessory
		let output;
		const accessory = this.registeredAccessories.get(message.netId.getHash());
		if (accessory) {
			// process if found
			output = `${chalk.red.bold(accessory.name)} (${accessory.type}) set to level ${message.level}%`;
			accessory.processClientData(message);
		} else {
			output = `${chalk.red.bold.italic(tag)} (unregistered) set to level ${message.level}%`;
		}

		if (source) {
			let sourceType = source.unitType;
			output = `${output}, by '${chalk.red.bold(source.tag)} (${sourceType})'`;
		}

		logLevel(output);
	} else if (message.code === 700) {
		log(`heartbeat @ ${message.time}`);
	}
};

CBusPlatform.prototype.accessories = function (callback) {
	//--------------------------------------------------
	//  Initiate the CBus client
	//--------------------------------------------------
	log(`Connecting to the local C-Gate server…`);

	this.client = new CGateClient(this.cgateIpAddress, this.cgateControlPort,
		this.project, this.network, this.application,
		this.clientDebug);

	this.database = new CGateDatabase(new CBusNetId(this.project, this.network));

	// listen for data from the client and ensure that the homebridge UI is updated
	this.client.on(`event`, function (message) {
		this._processEvent(message);
	}.bind(this));

	this.client.connect(function () {
		this.database.fetch(this.client, () => {
			log(`Successfully fetched ${this.database.applications.length} applications, ${this.database.groups.size} groups and ${this.database.units.size} units from C-Gate.`);
			this.database.exportToJSON(`homebridge-cbus.json`);
		});

		const accessories = this._createAccessories();

		// build the lookup map
		this.registeredAccessories = new Map();
		for (const accessory of accessories) {
			this.registeredAccessories.set(accessory.netId.getHash(), accessory);
		}

		// hand them back to the callback to fire them up
		log('Registering the accessories list…');
		callback(accessories);
	}.bind(this));
};

// return a map of newly minted accessories
CBusPlatform.prototype._createAccessories = function () {
	log('Loading the accessories list…');

	const accessories = [];

	for (let accessoryData of this.config.accessories) {
		try {
			const accessory = this.createAccessory(accessoryData);
			accessories.push(accessory);
		} catch (err) {
			log(`Unable to instantiate accessory of type '${accessoryData.type}' (reason: ${err}). ABORTING`);
			process.exit(0);
		}
	}

	// sort them for good measure
	// accessories.sort(function (a, b) {
	// 	return (a.name > b.name) - (a.name < b.name);
	// });

	return accessories;
};

CBusPlatform.prototype.createAccessory = function (entry) {
	console.assert(typeof entry.type === `string`, `accessory missing type property`);

	const constructor = module.exports.accessoryDefinitions[entry.type];
	if (!constructor) {
		throw new Error(`unknown accessory type '${entry.type}'`);
	}

	return new constructor(this, entry);
};

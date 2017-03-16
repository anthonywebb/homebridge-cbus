'use strict';

var fs = require('fs');

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
	// globals
	const Service = homebridge.hap.Service;
	const Characteristic = homebridge.hap.Characteristic;
	const Accessory = homebridge.hap.Accessory;
	const uuid = homebridge.hap.uuid;

	// load accessories
	const CBusAccessory = require('./accessories/accessory.js')(Service, Characteristic, Accessory, uuid);
	const CBusLightAccessory = require('./accessories/light-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusDimmerAccessory = require('./accessories/dimmer-accessory.js')(Service, Characteristic, CBusLightAccessory, uuid);
	const CBusMotionAccessory = require('./accessories/motion-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusSecurityAccessory = require('./accessories/security-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusShutterAccessory = require('./accessories/shutter-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusFanAccessory = require('./accessories/fan-accessory.js')(Service, Characteristic, CBusAccessory, uuid);
	const CBusSwitchAccessory = require('./accessories/switch-accessory.js')(Service, Characteristic, CBusAccessory, uuid);

	// fix inheritance, since we've loaded our classes before the Accessory class has been loaded
	cbusUtils.fixInheritance(CBusAccessory, Accessory);
	cbusUtils.fixInheritance(CBusLightAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusDimmerAccessory, CBusLightAccessory);
	cbusUtils.fixInheritance(CBusMotionAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusSecurityAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusShutterAccessory, CBusAccessory);
	cbusUtils.fixInheritance(CBusFanAccessory, CBusAccessory);
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
		fan: CBusFanAccessory,
		switch: CBusSwitchAccessory
	};
};

// ==========================================================================================
// CBusPlatform
// ==========================================================================================

function CBusPlatform(ignoredLog, config) {
	// stash vars
	this.config = config;

	this.registeredAccessories = undefined;
	this.client = undefined;
	this.database = undefined;

	// client IP and port
	if (typeof config.client_ip_address === `undefined`) {
		log('client IP address missing');
		process.exit(1);
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

	// platform export path
	// TODO more rigorous check please!
	this.platformExportPath = this.config.platform_export;

	// logging
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

		// lookup accessory
		let output;
		const accessory = this.registeredAccessories[message.netId.toString()];
		if (accessory) {
			output = `${chalk.red.bold(accessory.name)} (${accessory.type}) set to level ${message.level}%`;
		} else {
			output = `${chalk.red.bold.italic(tag)} (not-registered) set to level ${message.level}%`;
		}

		// append source info, if applicable
		if (typeof message.sourceunit !== `undefined`) {
			const sourceId = new CBusNetId(this.project, this.network, `p`, message.sourceunit);
			const source = this.database.getNetworkEntity(sourceId);
			output = `${output}, by ${chalk.red.bold(source.tag)} (${source.unitType})`;
		}

		logLevel(output);

		if (accessory) {
			// process if found
			const err = (message.code !== 730);
			accessory.processClientData(err, message);
		}
	} else if (message.code === 700) {
		log(`Heartbeat @ ${message.time}`);
	} else if (message.code === 751) {
		log(`Tag information changed.`);
	}
};

CBusPlatform.prototype.accessories = function (callback) {
	// initiate the CBus client
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
			const stats = this.database.getStats();
			log(`Successfully fetched ${stats.numApplications} applications, ${stats.numGroups} groups and ${stats.numUnits} units from C-Gate.`);

			// export platform file is platform_export property is set
			if (this.config.platform_export) {
				this.database.exportPlatform(this.platformExportPath, this);
			}
		});

		const accessories = this._createAccessories();

		// build the lookup map
		this.registeredAccessories = {};
		for (const accessory of accessories) {
			this.registeredAccessories[accessory.netId.toString()] = accessory;
		}

		// hand them back to the callback to fire them up
		log('Registering the accessories list…');
		callback(accessories);
	}.bind(this));
};

// return a map of newly minted accessories
CBusPlatform.prototype._createAccessories = function () {
	log('Loading the accessories list…');

	if (typeof this.config.accessories === `undefined`) {
		log(`Your config.json file is missing the 'accessories' section for this platform. (Check spelling!)`);
		process.exit(0);
	}

	const accessories = [];

	for (let config of this.config.accessories) {
		if (config.enabled === false) {
			log(`Skipping disabled accessory '${config.name}' (${config.type})`);
		} else {
			try {
				const accessory = this.createAccessory(config);
				accessories.push(accessory);
			} catch (err) {
				log(`Unable to instantiate accessory '${config.name}' (${config.type}) reason: ${err}. ABORTING`);
				process.exit(0);
			}
		}
	}

	return accessories;
};

CBusPlatform.prototype.createAccessory = function (config) {
	console.assert(typeof config.type === `string`, `accessory missing type property`);

	const constructor = module.exports.accessoryDefinitions[config.type];
	if (!constructor) {
		throw new Error(`unknown accessory type '${config.type}'`);
	}

	return new constructor(this, config);
};

'use strict';

const fs = require('fs');
const util = require('util');

require('../hot-debug.js');
const log = require('debug')('cbus:export');

const _ = require('lodash');
const bytes = require('bytes');
const moment = require('moment');
const stringify = require('json-stable-stringify');

const CBusNetId = require('./cbus-netid.js');

module.exports = CGateExport;

// CGateExport
function CGateExport(database) {
	this.database = database;
}

function _getScaffolding(platform) {
	const config = _.clone(platform.config);
	config.accessories = [`ACCESSORIES_PLACEHOLDER`];

	let data = {
		exported: moment().format(),	// annotate the output with the export time
		platforms: [config]
	};

	let compare = function (keyA, keyB) {
		// determine the key order
		function getRank(key) {
			const KEY_RANK = [
				`exported`,
				`platform`, `name`,
				`client_ip_address`, `client_controlport`,
				`client_cbusname`, `client_network`, `client_application`,
				`platform_export`,
				`application`
			];
			let rank = _.findIndex(KEY_RANK, o => o === key);
			return (rank === -1) ? KEY_RANK.length : rank;
		}

		return getRank(keyA.key) > getRank(keyB.key);
	};

	return stringify(data, { cmp: compare, space: 2 })
		.replace(/^ {6}"accessories": /mg, `\n      "accessories": `)
		.replace(/^ {6}"platform_export": /mg, `\n      "platform_export": `);
}

function _flattenAccessories(accessories) {
	let compare = function (keyA, keyB) {
		// determine the key order, or KEY_ORDER.length if not found
		function getRank(key) {
			const KEY_RANK = [`netId`, `type`, `network`, `application`, `id`, `name`, `dbTag`, `invert`, `activeDuration`, `enabled`];
			const rank = _.findIndex(KEY_RANK, o => o === key);
			return (rank === -1) ? KEY_RANK.length : rank;
		}

		return getRank(keyA.key) > getRank(keyB.key);
	};

	let flattened = stringify(accessories, {cmp: compare});

	// remove the square backets around the entire string
	flattened = flattened.slice(1, flattened.length - 1);

	if (flattened.length !== 0) {
		flattened = flattened.replace(/\},/g, `},\n`)		// put a newline after all `},`
		.replace(/\{/g, `{ `)			// put a space after all `{`
		.replace(/\}/g, ` }`)			// put a space before all `}`
		.replace(/":/g, `": `)			// put space after colons
		.replace(/,"/g, `, "`)			// put space between commas and quotes (property key start)
		.replace(/^/gm, `        `);	// indent lines
	}

	return flattened;
}

/**
 * merge the database with the accessory list
 */
CGateExport.prototype._buildUnifiedAccessoryList = function (platform) {
	let accessories = [];

	// create accessory definitions from db
	_.forOwn(this.database.groups, (group, netIdStr) => {
		// build up the definition of the platform (minus the accessories
		let dbNetId = CBusNetId.parse(netIdStr);
		const inferredType = (typeof group.inferredType === `undefined`) ? `unknown` : group.inferredType;
		let accessory = {
			type: inferredType,
			network: dbNetId.network,
			application: dbNetId.application,
			id: dbNetId.group,
			name: group.tag,
			enabled: false,
			_netId: dbNetId,
		};

		accessories.push(accessory);
	});

	// iterate through loaded accessories, adding/modifying entries as necessary
	_.forEach(platform.config.accessories, config => {
		const configNetId = new CBusNetId(
			platform.config.client_cbusname,
			config.network || platform.config.client_network,
			config.application || platform.config.client_application,
			config.id);

		let found = _.find(accessories, o => o._netId.isEquals(configNetId));

		// create new shadow
		if (found) {
			// modify found to match
			if (found.name !== config.name) {
				// stash away dbTag
				found.dbtag = found.name;
				found.name = config.name;
			}
			found.type = config.type;
			found.enabled = (config.enabled !== false);
		} else {
			let shadow = _.clone(config);
			shadow._netId = configNetId;
			accessories.push(shadow);
		}
	});

	// removing network and application properties where unnecessary
	const defaultNetId = new CBusNetId(platform.config.client_cbusname, platform.config.client_network, platform.config.client_application);
	_.forEach(accessories, shadow => {
		if (shadow._netId.isSameNetwork(defaultNetId)) {
			delete shadow.network;
		}

		if (shadow._netId.isSameApplication(defaultNetId)) {
			delete shadow.application;
		}

		if (shadow.enabled === true) {
			delete shadow.enabled;
		}

		shadow._hash = shadow._netId.getHash();
	});

	// sort by _hash
	accessories = _.sortBy(accessories, o => o._hash);

	// remove _hash property
	_.forEach(accessories, o => {
		delete o._hash;
		delete o._netId;
	});

	return accessories;
};

CGateExport.prototype._stringifyPlatform = function (platform) {
	let scaffolding = _getScaffolding(platform);

	// build accessory section
	let accessories = this._buildUnifiedAccessoryList(platform);

	const [enabled, disabled] = _.partition(accessories, o => (o.enabled !== false));
	const flatEnabled = _flattenAccessories(enabled);
	const flatDisabled = _flattenAccessories(disabled);

	let accStr = '';
	if (flatEnabled.length > 0) {
		accStr += flatEnabled;
		if (flatDisabled.length > 0) {
			accStr += `,\n\n`;
		}
	}

	if (flatDisabled.length > 0) {
		accStr += flatDisabled;
	}

	// merge accessories into scaffolding
	return scaffolding.replace(/^ +"ACCESSORIES_PLACEHOLDER"$/gm, accStr) + `\n`;
};

CGateExport.prototype._stringifyDatabase = function () {
	const data = {
		exported: moment().format(),	// // annotate the output with the export time
		statistics: this.database.getStats(),
		applications: this.database.applications,
		groups: this.database.groups,
		units: this.database.units,
		unrecognisedUnits: this.database.unrecognisedUnits
	};

	let compare = function (a, b) {
		// `exported` keyword comes first
		if (a.key === `exported`) {
			return -1;
		}

		// netIds
		if (a.key.startsWith(`//`) && b.key.startsWith(`//`)) {
			const aId = CBusNetId.parse(a.key);
			const bId = CBusNetId.parse(b.key);

			return CBusNetId.compare(aId, bId);
		}

		// all other keys
		function getRank(key) {
			const KEY_RANK = [
				`exported`, `statistics`,
				`tag`, `unitId`, `channelNumber`, `groupId`, `type`
			];
			let rank = _.findIndex(KEY_RANK, o => o === key);
			return (rank === -1) ? KEY_RANK.length : rank;
		}

		return getRank(a.key) > getRank(b.key);
	};

	return stringify(data, {cmp: compare, space: 2});
};

CGateExport.prototype.exportDatabase = function (path, callback) {
	let output;

	try {
		output = this._stringifyDatabase();
	}  catch (ex) {
		log(`Database failed to stringify: ${ex.stack}`);
	}

	if (output) {
		fs.writeFile(path, output, function (err) {
			if (err) {
				log(`Database failed to export: ${err}`);
			} else {
				const numBytes = fs.statSync(path).size;
				log(`Database exported to ${path} (${bytes(numBytes, {unitSeparator: ' '})})`);
			}

			if (callback) {
				callback(err);
			}
		});
	}
};

CGateExport.prototype.exportPlatform = function (path, platform, callback) {
	let output;
	try {
		output = this._stringifyPlatform(platform);
	} catch (ex) {
		log(`Platform failed to stringify: ${ex.stack}`);
	}

	if (output) {
		fs.writeFile(path, output, function (err) {
			if (err) {
				log(`Platform failed to export: ${err}`);
			} else {
				const numBytes = fs.statSync(path).size;
				log(`Platform exported to ${path} (${bytes(numBytes, {unitSeparator: ' '})})`);

				if (callback) {
					callback(err);
				}
			}
		});
	}
};

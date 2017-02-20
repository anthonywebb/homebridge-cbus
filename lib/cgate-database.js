'use strict';

const fs = require('fs');
const util = require('util');

require('../hot-debug.js');
const log = require('debug')('cbus:db');

const _ = require('lodash');
const bytes = require('bytes');

const xml2js = require('xml2js');
const lodash = require('lodash');
const stringify = require('json-stable-stringify');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');

module.exports = CGateDatabase;

// CGateDatabase loads the objeect database from C-Gate, parsing it into three lists:
// * applications
// * groups
// * units
function CGateDatabase(netId) {
	// the netId must be in the format //${project}//${network}
	console.assert((typeof netId.application === `undefined`) && (typeof netId.group === `undefined`));
	this.netId = netId;

	// array of applications
	this.applications = undefined;

	// array of groups
	this.groups = undefined;

	// array of units
	this.units = undefined;
}

function _getScaffolding(platform) {
	const config = _.clone(platform.config);
	config.accessories = [`ACCESSORIES_PLACEHOLDER`];

	let data = {
		platforms: [config]
	};

	let compare = function (keyA, keyB) {
		// determine the key order
		function getRank(key) {
			const KEY_RANK = [
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
		.replace(/^      "accessories": /mg, `\n      "accessories": `)
		.replace(/^      "platform_export": /mg, `\n      "platform_export": `)
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

	// lose the [  ]
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

CGateDatabase.prototype._buildUnifiedAccessoryList = function (platform) {
	let accessories = [];

	// create accessory definitions
	_.forOwn(this.groups, (group, netIdStr) => {
		// build up the definition of the platform (minus the accessories
		let dbNetId = CBusNetId.parse(netIdStr);
		let loaded = platform.registeredAccessories[netIdStr];

		let accessory;
		if (loaded) {
			// build accessory definition from loaded accessory
			accessory = {
				type: loaded.type,
				id: loaded.netId.group,
				name: loaded.name
			};

			if (accessory.name !== group.tag) {
				accessory.dbTag = group.tag;
			}
		} else {
			// build accessory definition from db entry
			accessory = {
				type: `unknown`,
				id: dbNetId.group,
				name: group.tag,
				enabled: false
			};
		}

		// add network if it's not the default
		if (dbNetId.network !== platform.config.client_network) {
			accessory.network = dbNetId.network;
		}

		// add application if it's not the default
		if (dbNetId.application !== platform.config.client_application) {
			accessory.application = dbNetId.application;
		}

		accessory._hash = dbNetId.getHash();

		accessories.push(accessory);
	});

	// sort by _hash
	accessories = _.sortBy(accessories, o => o._hash);

	// remove _hash property
	return _.map(accessories, o => _.omit(o, '_hash'));
};

CGateDatabase.prototype.stringifyPlatform = function (platform) {
	let scaffolding = _getScaffolding(platform);

	// build accessory section
	let accessories = this._buildUnifiedAccessoryList(platform);

	const enabled = _.filter(accessories, o => ((typeof o.enabled === `undefined`) || (o.enabled === true)));
	const disabled = _.filter(accessories, o => (o.enabled === false));
	console.assert((enabled.length + disabled.length) === accessories.length);

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

CGateDatabase.prototype.exportPlatform = function (path, platform, callback) {
	const output = this.stringifyPlatform(platform);

	fs.writeFile(path, output, function (err) {
		if (err) {
			log.log(`Platform failed to export: ${err}`);
		} else {
			const numBytes = fs.statSync(path).size;
			const byteStr = bytes(numBytes, {unitSeparator:' '});
			log(`Platform exported to ${path} (${byteStr})`);

			if (callback) {
				callback(err);
			}
		}
	});
};

CGateDatabase.prototype.stringifyDatabase = function () {
	const data = {
		applications: this.applications,
		groups: this.groups,
		units: this.units
	};

	let compare = function (a, b) {
		if (a.key.startsWith(`//`) && b.key.startsWith(`//`)) {
			const aId = CBusNetId.parse(a.key);
			const bId = CBusNetId.parse(b.key);

			return CBusNetId.compare(aId, bId);
		}

		return a.key < b.key ? -1 : 1;
	};

	return stringify(data, {cmp: compare, space: 2});
};

CGateDatabase.prototype.exportDatabase = function (path, callback) {
	const jsonStr = this.stringifyDatabase();

	fs.writeFile(path, jsonStr, function (err) {
		if (err) {
			log.log(`Database failed to export: ${err}`);
		} else {
			const numBytes = fs.statSync(path).size;
			log(`Database exported to ${path} (${bytes(numBytes, {unitSeparator:' '})})`);
		}

		if (callback) {
			callback(err);
		}
	});
};

CGateDatabase.prototype.getStats = function () {
	return {
		numApplications: Object.keys(this.applications).length,
		numGroups: Object.keys(this.groups).length,
		numUnits: Object.keys(this.units).length
	};
};

CGateDatabase.prototype.fetch = function (client, callback) {
	console.assert((client.project === this.netId.project) && (client.network === this.netId.network));

	log(`Fetching database`);
	client.getDB(this.netId, result => {
		const dbxml = result.snippet.content;
		const byteStr = bytes(dbxml.length, {unitSeparator:' '});
		log(`Parsing database (${byteStr})`);

		xml2js.parseString(dbxml, {
			normalizeTags: true,
			explicitArray: false
		}, (err, databaseXML) => {
			console.assert(!err, `dbgetxml parse failure`, err);
			const result = _parseXML(databaseXML, new CBusNetId(this.netId.project, this.netId.network));
			this.applications = result.applications;
			this.groups = result.groups;
			this.units = result.units;

			if (callback) {
				callback();
			}
		});
	});
};

/**
 * create a result entity that contains 3 arrays: applications, groups, units
 */
function _parseXML(databaseXML, baseNetwork) {
	const result = {
		applications: {},
		groups: {},
		units: {}
	};

	// build object for applications and groups
	_arrayize(databaseXML.network.application).forEach(srcApp => {
		const appId = new CBusNetId(baseNetwork.project, baseNetwork.network, cbusUtils.integerise(srcApp.address));
		const application = {
			tag: srcApp.tagname
		};
		result.applications[appId.toString()] = application;

		// now descend into groups
		_arrayize(srcApp.group).forEach(srcGroup => {
			const groupId = new CBusNetId(baseNetwork.project, baseNetwork.network, appId.application, cbusUtils.integerise(srcGroup.address));
			const group = {
				tag: srcGroup.tagname
			};

			// only add if _not_ a placeholder group
			if ((groupId.group !== 255) && (group.tag !== `<Unused>`)) {
				result.groups[groupId.toString()] = group;
			}
		});
	});

	// build object for physical units
	_arrayize(databaseXML.network.unit).forEach(srcUnit => {
		const netId = new CBusNetId(baseNetwork.project, baseNetwork.network, `p`, cbusUtils.integerise(srcUnit.address));
		const unit = {
			tag: srcUnit.tagname,
			partName: srcUnit.unitname,
			firmwareVersion: srcUnit.firmwareversion,
			serialNumber: srcUnit.serialnumber,
			catalogNumber: srcUnit.catalognumber,
			unitType: srcUnit.unittype
		};
		result.units[netId.toString()] = unit;
	});

	return result;
}

function _arrayize(element) {
	return Array.isArray(element) ? element : [element];
}

CGateDatabase.prototype.getTag = function (netId) {
	const props = this.getNetworkEntity(netId);

	let result;
	if (typeof props === `undefined`) {
		result = netId.toString();
	} else {
		result = props.tag;
	}

	return result;
};

CGateDatabase.prototype.getNetworkEntity = function (netId) {
	if (typeof this.applications === `undefined`) {
		return undefined;
	}
	console.assert(this.groupMap !== `undefined`, `if we have this.applications, then we should have this.groupMsp`);

	// TODO perhaps change to throw?
	console.assert(this.netId.project === netId.project, `getGroupName can only search in default project`);
	console.assert(this.netId.network === netId.network, `getGroupName can only search in default network`);

	let result;
	const identifier = netId.toString();

	if (netId.isApplicationId(netId)) {
		result = this.applications[identifier];
	} else if (netId.isGroupId()) {
		result = this.groups[identifier];
	} else if (netId.isUnitId()) {
		result = this.units[identifier];
	} else {
		console.assert(netId.isNetworkId());
		// fall through as undefined
	}

	return result;
};

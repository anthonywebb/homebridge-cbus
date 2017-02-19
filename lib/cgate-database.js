'use strict';

const fs = require('fs');

require('../hot-debug.js');
const log = require('debug')('cbus:db');

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

	// array containing applications
	this.applications = undefined;

	// array containing groups
	this.groups = undefined;

	// lookup map for groups
	//this.groupMap = undefined;

	// map of physical devices
	this.units = undefined;
}

CGateDatabase.prototype.exportToJSON = function (path) {
	const data = {
		applications: this.applications,
		groups: this.groups,
		units: this.units
	};

	let compare = function (a, b) {
		if (a.key.startsWith(`//`) && b.key.startsWith(`//`)) {
			const aId = CBusNetId.parse(a.key);
			const bId = CBusNetId.parse(b.key);

			if (aId.project !== bId.project) {
				return aId.project < bId.project ? -1 : 1;
			}

			if (aId.network !== bId.network) {
				return aId.network < bId.network ? -1 : 1;
			}

			let aApp = (typeof aId.application === `undefined`) ? 256 : aId.application;
			let bApp = (typeof bId.application === `undefined`) ? 256 : bId.application;

			if (aApp !== bApp) {
				return aApp < bApp ? -1 : 1;
			}


			let aGroup = (typeof aId.group === `undefined`) ? aId.unitAddress : aId.group;
			let bGroup = (typeof bId.group === `undefined`) ? bId.unitAddress : bId.group;

			if (aGroup !== bGroup) {
				return aGroup < bGroup ? -1 : 1;
			}
		}

		return a.key < b.key ? -1 : 1;
	};

	fs.writeFile(path, stringify(data, { cmp: compare, space: 2 }), function (err) {
		if (err) {
			log.log(`Failed to export: ${err}`);
		} else {
			log(`Database exported to ${path}`);
		}
	});
};

CGateDatabase.prototype.fetch = function (client, callback) {
	console.assert((client.project === this.netId.project) && (client.network === this.netId.network));

	log(`Fetching database`);
	client.getDB(this.netId, result => {
		const dbxml = result.snippet.content;
		log(`Parsing database (${dbxml.length} bytes)`);

		xml2js.parseString(dbxml, {
			normalizeTags: true,
			explicitArray: false
		}, (err, databaseXML) => {
			console.assert(!err, `dbgetxml parse failure`, err);
			const result = _parseXML(databaseXML, new CBusNetId(this.netId.project, this.netId.network));
			this.applications = result.applications;
			this.groups = result.groups;
			this.units = result.units;

			// build group map
			// const groupMap = new Map();
			// result.groups.forEach(group => {
			// 	const netId = new CBusNetId(this.netId.project, this.netId.network, group.application, group.address);
			// 	groupMap.set(netId.getHash(), group);
			// });
			// this.groupMap = groupMap;

			// build unit map
			// const unitMap = new Map();
			// result.units.forEach(unit => {
			// 	const netId = new CBusNetId(this.netId.project, this.netId.network, `p`, unit.address);
			// 	unitMap.set(netId.getHash(), unit);
			// });
			// this.unitMap = unitMap;

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

	// create map of maps containing groups (by application, by group address)
	_arrayize(databaseXML.network.application).forEach(srcApp => {
		const appId = new CBusNetId(baseNetwork.project, baseNetwork.network, cbusUtils.integerise(srcApp.address));
		const application = {
			tag: srcApp.tagname
		};
		result.applications[appId.toString()] = application;

		// now descend into groups
		_arrayize(srcApp.group).forEach(srcGroup => {
			const groupId = new CBusNetId(baseNetwork.project, baseNetwork.network, appId.application, cbusUtils.integerise(srcApp.address));
			const group = {
				// application: application.address,
				// address: cbusUtils.integerise(srcGroup.address),
				tag: srcGroup.tagname
			};
			result.groups[groupId.toString()] = group;
		});
	});

	// create map of physical devices
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
		//
		//
		// .find(element => {
		// 	return element.address === netId.application;
		// });
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

'use strict';

const fs = require('fs');
const util = require('util');

require('../hot-debug.js');
const log = require('debug')('cbus:db');

const _ = require('lodash');
const chalk = require('chalk');
const bytes = require('bytes');

const xml2js = require('xml2js');
const lodash = require('lodash');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');
const UNIT_TYPES = require(`../resources/unit-types.json`);

module.exports = CGateDatabase;


const DEFAULT_CBUS_APPLICATION = 56;

// CGateDatabase loads the object database from C-Gate, parsing it into three lists:
// * applications
// * groups
// * units
function CGateDatabase(netId) {
	// the netId must be in the format //${project}/
	console.assert(netId.isProjectId());
	this.netId = netId;

	// maps
	this.applications = undefined;
	this.groups = undefined;
	this.units = undefined;
	this.unrecognisedUnits = undefined;
}

function _getUnitTypeInfo(typeName) {
	return UNIT_TYPES[typeName];
}

CGateDatabase.prototype.getStats = function () {
	return {
		numApplications: Object.keys(this.applications).length,
		numGroups: Object.keys(this.groups).length,
		numUnits: Object.keys(this.units).length
	};
};

CGateDatabase.prototype.fetch = function (client, callback) {
	console.assert((client.project === this.netId.project));

	log(`Fetching database`);
	client.getDB(this.netId, result => {
		const dbxml = result.snippet.content;
		const byteStr = bytes(dbxml.length, {unitSeparator:' '});
		log(`Parsing database (${byteStr})`);

		xml2js.parseString(dbxml, {
			normalizeTags: true,
			explicitArray: false
		}, (err, database) => {
			console.assert(!err, `dbgetxml parse failure`, err);

			try {
				const result = _processDatabase(database, new CBusNetId(this.netId.project, this.netId.network));

				this.applications = result.applications;
				this.groups = result.groups;
				this.units = result.units;
				this.unrecognisedUnits = result.unrecognisedUnits;

				// if a unitType isn't listed in resources/unit-types.json we won't
				// know what accessory types it should be mapped to
				// --> not necessarily a problem.
				if (!_.isEmpty(result.unrecognisedUnits)) {
					log(`${chalk.red(`WARNING`)}: not processing unit types: `);
					log(util.inspect(result.unrecognisedUnits, {colors: true}));
				}

				// patch up types
				this._patchDevicesToGroups();
				this._inferGroupTypes();
			} catch (ex) {
				console.error(`${chalk.red.bold(`ERROR`)} failed to load C-Gate database: ${ex.stack}`);
				process.exit(1);
			}

			if (callback) {
				callback();
			}
		});
	});
};

function _extractApplicationsAndGroups (network, projectName, result) {
	_.forEach(_arrayise(network.application), srcApp => {
		const appId = new CBusNetId(projectName, network.address, cbusUtils.integerise(srcApp.address));
		result.applications[appId.toString()] = {
			tag: srcApp.tagname
		};

		// add groups -- it is possible (though improbable) that the application will have none
		if (typeof srcApp.group !== `undefined`) {
			// now descend into groups (it is possible, though unlikely, that there are none)
			_.forEach(_arrayise(srcApp.group), srcGroup => {
				const groupId = new CBusNetId(projectName, network.address, appId.application, cbusUtils.integerise(srcGroup.address));
				const group = {
					tag: srcGroup.tagname
				};

				// add groups (except placeholders)
				if ((groupId.group !== 255) && (group.tag !== `<Unused>`)) {
					result.groups[groupId.toString()] = group;
				}
			});
		}
	});
}

function _extractUnits(network, projectName, result) {
	_.forEach(_arrayise(network.unit), srcUnit => {
		// find the property section listing wanted attributes
		// in: <PP Name="GroupAddress" Value="0x19 0x1a 0x1b 0x1d 0x33 0x34 0x1f 0x1e 0x21 0x22 0x23 0x24 0xff 0xff 0xff 0xff"/>
		// out: "0x19 0x1a 0x1b 0x1d 0x33 0x34 0x1f 0x1e 0x21 0x22 0x23 0x24 0xff 0xff 0xff 0xff"
		function extractProperty(propertyName) {
			// nb. could be undefined
			return srcUnit.properties[propertyName]; // `GroupAddress`;
		}

		function extractNumbers(propertyName) {
			let valueStr = extractProperty(propertyName);

			let result;
			if (typeof valueStr !== `undefined`) {
				result = _.map(valueStr.split(` `), o => parseInt(o, 16));
			}

			return result;
		}

		function _extractGroupAddresses(unit, unitId) {
			let groups;

			// only keep as many groups as we expect
			const unitInfo = _getUnitTypeInfo(srcUnit.unittype);
			if (typeof unitInfo === `undefined`) {
				// record unrecognised unittype
				if (typeof result.unrecognisedUnits[srcUnit.unittype] === `undefined`) {
					result.unrecognisedUnits[srcUnit.unittype] = [];
				}
				result.unrecognisedUnits[srcUnit.unittype].push({tag: unit.tag, netId: unitId});
			} else {
				let numGroups = unitInfo.outputCount;
				if (typeof numGroups !== `undefined`) {
					groups = extractNumbers(`GroupAddress`);
					groups = _.slice(groups, 0, numGroups);
				}

				// it's possible that the application has not been set, if so, default to the lighting application
				// TODO check that this is the right behaviour
				if (typeof unit.application !== `number`) {
					unit.application = DEFAULT_CBUS_APPLICATION;
				}
				console.assert(typeof unit.application === `number`);

				// replace address with string representation of netId ('255' with null)
				groups = _.map(groups, o => (o === 255) ? null : new CBusNetId(projectName, network.address, unit.application, cbusUtils.integerise(o)).toString());
			}

			return groups;
		}

		// flatten <PP> section to .properties
		srcUnit.properties = _.reduce(srcUnit.pp, (result, o) => {
			result[o.$.Name] = o.$.Value;
			return result;
		}, {});
		delete srcUnit.pp;

		// construct unit
		const netId = new CBusNetId(projectName, network.address, `p`, cbusUtils.integerise(srcUnit.address));
		const unit = {
			tag: srcUnit.tagname,
			partName: srcUnit.unitname,
			firmwareVersion: srcUnit.firmwareversion,
			serialNumber: srcUnit.serialnumber,
			catalogNumber: srcUnit.catalognumber,
			unitType: srcUnit.unittype,
			application: _.nth(extractNumbers(`Application`), 0)
		};

		// process group addresses
		const groups = _extractGroupAddresses(unit, netId.toString());
		if (!_.isEmpty(groups)) {
			unit.controlledBy = groups;
		}

		// asssign the inferred type
		const unitInfo = _getUnitTypeInfo(srcUnit.unittype);
		if (typeof unitInfo !== `undefined`) {
			unit.inferredType = unitInfo.type;
		}

		result.units[netId.toString()] = unit;
	});
}

/**
 * create a result entity that contains the arrays:
 * applications:
 * groups:
 * units:
 * unrecognisedUnits: object mapping type: [ unit]
 */
function _processDatabase(database) {
	const result = {
		applications: {},
		groups: {},
		units: {},
		unrecognisedUnits: {}
	};

	const project = database.installation.project;
	const networks = _arrayise(project.network);
	const projectName = project.address;
	_.forEach(networks, network => {
		_extractApplicationsAndGroups(network, projectName, result);
		_extractUnits(network, projectName, result);
	});

	return result;
}

CGateDatabase.prototype._patchDevicesToGroups = function () {
	function link(unit, unitId, channelNumber, group, groupId, inferredType) {
		// it's possible (though unlikely) that the group hasn't been defined
		const unitLabel = cbusUtils.formatTag(`${unit.tag}/${channelNumber}`, unitId);
		const groupLabel = cbusUtils.formatTag((group ? group.tag : `unknown`), groupId);
		log(`linking ${unitLabel} as ${chalk.red.bold(inferredType)} to ${groupLabel}`);

		// add link to group
		if (typeof group !== `undefined`) {
			if (typeof group.controls === `undefined`) {
				group.controls = [];
			}
			group.controls.push({
				tag: unit.tag,
				unitId: unitId,
				channelNumber: channelNumber,
				inferredType: inferredType
			});
		}

		// add link to unit
		const entry = {
			groupId: groupId,
			channelNumber: channelNumber
		};
		if (typeof group !== `undefined`) {
			entry.tag = group.tag;
		}

		if (typeof unit.controlLinks === `undefined`) {
			unit._links = [];
		}
		unit._links.push(entry);
	}

	_.forEach(this.units, (unit, unitId) => {
		// for each of a unit's channels that are controlled by a group, link the group to the unit
		if (!_.isEmpty(_.compact(unit.controlledBy))) { // (Array.isArray(unit.groups)) {
			// log(`\nprocessing unit ${unitId} (${unit.unitType} -> ${unit.inferredType})`);
			// log(util.inspect(unit, { breakLength: 100, colors:true}));

			_.forEach(unit.controlledBy, (groupId, channelInd) => {
				if (groupId) {
					const group = this.getNetworkEntity(groupId);
					link(unit, unitId, channelInd + 1, group, groupId, unit.inferredType);
				}
			});

			// clean up
			unit.controlledBy = unit._links;
			delete(unit._links);
		}
	});
};

CGateDatabase.prototype._inferGroupTypes = function () {
	_.forEach(this.groups, (group, groupId) => {
		let types = _.uniq(_.map(group.controls, o => o.inferredType));
		let numTypes = _.size(types);

		const groupLabel = cbusUtils.formatTag(group.tag, groupId);
		if (numTypes === 0) {
			log(`${groupLabel} not directly mapped to a unit`);
		} else if (numTypes === 1) {
			log(`${groupLabel} looks to be a ${chalk.red.bold(types[0])}`);
			group.inferredType = types[0];
		} else {
			log(`${groupLabel} mapped to multiple types: ${types}`);
		}
	});
};

function _arrayise(element) {
	let result;

	if ((typeof element !== `undefined`) && !Array.isArray(element)) {
		result = [element];
	} else {
		result = element;
	}

	return result;
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
		throw new Error(`database access before initialisation`);
	}

	if (typeof netId === `string`) {
		netId = CBusNetId.parse(netId);
	}

	if (this.netId.project !== netId.project) {
		throw new Error(`getNetworkEntity unable to search outside default project`);
	}

	let result;
	const identifier = netId.toString();

	if (netId.isApplicationId(netId)) {
		result = this.applications[identifier];
	} else if (netId.isGroupId()) {
		result = this.groups[identifier];
	} else if (netId.isUnitId()) {
		result = this.units[identifier];
	} else {
		console.assert(netId.isNetworkId() || netId.isProjectId());
		// fall through as undefined
	}

	return result;
};

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

module.exports = CGateDatabase;


const DEFAULT_CBUS_APPLICATION = 56;

// CGateDatabase loads the objeect database from C-Gate, parsing it into three lists:
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

let UNIT_TYPES;

function _getUnitTypeInfo(typeName) {
	// lazily load unit types
	if (typeof UNIT_TYPES === `undefined`) {
		const typesJSON = fs.readFileSync(`./resources/unit-types.json`);
		UNIT_TYPES = JSON.parse(typesJSON);
	}

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
			const result = _processDatabase(database, new CBusNetId(this.netId.project, this.netId.network));

			this.applications = result.applications;
			this.groups = result.groups;
			this.units = result.units;
			this.unrecognisedUnits = result.unrecognisedUnits;

			if (!_.isEmpty(result.unrecognisedUnits)) {
				log(`${chalk.red(`WARNING`)}: unknown unit types encountered: `);
				log(util.inspect(result.unrecognisedUnits, {colors: true}));
			}

			// patch up types
			this._patchDevicesToGroups(result);

			if (callback) {
				callback();
			}
		});
	});
};

function _extractApplicationsAndGroups (network, projectName, result) {
	_arrayize(network.application).forEach(srcApp => {
		const appId = new CBusNetId(projectName, network.address, cbusUtils.integerise(srcApp.address));
		result.applications[appId.toString()] = {
			tag: srcApp.tagname
		};

		// add groups -- it is possible (though improbable) that the application will have none
		if (typeof srcApp.group !== `undefined`) {
			// now descend into groups (it is possible, though unlikely, that there are none)
			_arrayize(srcApp.group).forEach(srcGroup => {
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
	_arrayize(network.unit).forEach(srcUnit => {
		// find the property section listing wanted attributes
		// in: <PP Name="GroupAddress" Value="0x19 0x1a 0x1b 0x1d 0x33 0x34 0x1f 0x1e 0x21 0x22 0x23 0x24 0xff 0xff 0xff 0xff"/>
		// out: "0x19 0x1a 0x1b 0x1d 0x33 0x34 0x1f 0x1e 0x21 0x22 0x23 0x24 0xff 0xff 0xff 0xff"
		function extractProperty(propertyName) {
			let result = srcUnit.properties[propertyName]; // `GroupAddress`;

			// if (typeof result === `undefined`) {
			// 	log(`WARNING: parameter ${propertyName} missing in ${util.inspect(srcUnit)}`);
			// }

			return result;
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
	_.forEach(project.network, network => {
		_extractApplicationsAndGroups(network, project.address, result);
		_extractUnits(network, project.address, result);
	});

	return result;
}

CGateDatabase.prototype._patchDevicesToGroups = function () {
	function link(unit, unitId, channelNumber, group, groupId, type) {
		// it's possible (though unlikely) that the group hasn't been defined
		log(`linking ${chalk.red.bold(unit.tag)}/${channelNumber} (${unitId}) as ${type} to ${chalk.red.bold(group ? group.tag : `unknown`)} (${groupId})`);

		// add link to group
		if (typeof group !== `undefined`) {
			if (typeof group.controls === `undefined`) {
				group.controls = [];
			}
			group.controls.push({
				tag: unit.tag,
				unitId: unitId,
				channelNumber: channelNumber,
				type: type
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
		if (!_.isEmpty(_.compact(unit.controlledBy))) { // (Array.isArray(unit.groups)) {
			log(`\nprocessing unit ${unitId} (${unit.unitType} -> ${unit.inferredType})`);
			log(util.inspect(unit, { breakLength: 100, colors:true}));

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

'use strict';

const net = require('net');
const util = require('util');
const log = require('util').log;

const EventEmitter = require('events').EventEmitter;

const xml2js = require('xml2js');
const chalk = require('chalk');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');

module.exports = CGateDatabase;

function CGateDatabase(netId, log) {
	// the netId must be in the format //${project}//${network}
	console.assert((typeof netId.application == `undefined`) && (typeof netId.group == `undefined`));
	this.netId = netId;
	
	// array containing applications
	this.applications = undefined;

	// array containing groups
	this.groups = undefined;
	
	// lookup map for groups
	this.groupMap = undefined;
	
	// map of physical devices
	this.units = undefined;
	
	this.log = log;
}

CGateDatabase.prototype.fetch = function(client, callback) {
	console.assert((client.project == this.netId.project) && (client.network == this.netId.network));
	
	client.getDB(this.netId, result => {
		const dbxml = result.snippet.content;
		this.log.info(`dbgetxml ${util.inspect(result.snippet)} (${dbxml.length} bytes)`);
		
		xml2js.parseString(dbxml, {
			normalizeTags: true
		}, (err, databaseXML) => {
			console.assert(!err, `dbgetxml parse failure`, err);
			const result = _parseXML(databaseXML, this.log);
			this.applications = result.applications;
			this.groups = result.groups;
			this.units = result.units;
			
			// build group map
			const groupMap = new Map();
			result.groups.forEach(group => {
				const netId = new CBusNetId(this.netId.project, this.netId.network, group.application, group.address);
				groupMap.set(netId.getModuleId(), group);
			});
			this.groupMap = groupMap;
			
			// build unit map
			
			
			if (callback) {
				callback();
			}
		});
	});
};

function _parseXML(databaseXML, log) {
	let groupCount = 0;
	
	// create 3 arrays: applications, groups, units
	const applications = [],
		groups = [],
		units = [];
	
	// create map of maps containing groups (by application, by group address)
	databaseXML.network.application.forEach(srcApplication => {
		const application = {
			address: cbusUtils.integerise(_getFirstAndOnlyChild(srcApplication.address)),
			name: _getFirstAndOnlyChild(srcApplication.tagname),
		};
		applications.push(application);
		
		// now descend into groups
		srcApplication.group.forEach(srcGroup => {
			const group = {
				application: application.address,
				address: cbusUtils.integerise(_getFirstAndOnlyChild(srcGroup.address)),
				name: _getFirstAndOnlyChild(srcGroup.tagname)
			};
			groups.push(group);
		});
	});
	
	// create map of physical devices
	databaseXML.network.unit.forEach(srcUnit => {
		const unit = {
			tag: _getFirstAndOnlyChild(srcUnit.tagname),
			partName: _getFirstAndOnlyChild(srcUnit.unitname),
			address: cbusUtils.integerise(_getFirstAndOnlyChild(srcUnit.address)),
			firmwareVersion: _getFirstAndOnlyChild(srcUnit.firmwareversion),
			serialNumber: _getFirstAndOnlyChild(srcUnit.serialnumber),
			catalogNumber: _getFirstAndOnlyChild(srcUnit.catalognumber),
			unitType: _getFirstAndOnlyChild(srcUnit.unittype)
		};
		units.push(unit);
	});
	
	return {
		applications: applications,
		groups: groups,
		units: units
	};
}

function _getFirstAndOnlyChild(element) {
	let value = undefined;
	if (Array.isArray(element)) {
		console.assert(element.length == 1);
		value = element[0];
	}
	return value;
}

CGateDatabase.prototype.getNetLabel = function(netId) {
	if (typeof this.applications == `undefined`) {
		return undefined;
	}
	console.assert(this.groupMap != `undefined`, `if we have this.applications, then we should have this.groupMsp`);
	
	// TODO perhaps change to throw?
	console.assert(this.netId.project === netId.project, `getGroupName can only search in default project`);
	console.assert(this.netId.network === netId.network, `getGroupName can only search in default network`);
	
	let name;
	
	if (netId.isNetworkId(netId)) {
		name = `net${netId.network}`;
	} else if (netId.isApplicationId(netId)) {
		let application = this.applications.find(element => {
			return element.address == netId.application;
		});
		name = application ? application.name : `app${netId.application}`;
	} else {
		let group = this.groupMap.get(netId.getModuleId());
		name = group ? group.name : `group${netId.group}`;
	}
	
	return name;
};

//CGateDatabase.prototype.getUnitLabel = function(netId) {

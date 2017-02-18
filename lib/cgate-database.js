'use strict';

const net = require('net');
const util = require('util');

require("hot-debug");
const log = require('debug')('cbus:db');

const EventEmitter = require('events').EventEmitter;

const xml2js = require('xml2js');
const chalk = require('chalk');

const cbusUtils = require('./cbus-utils.js');
const CBusNetId = require('./cbus-netid.js');

module.exports = CGateDatabase;

/*
 
 CGateDatabase loads the objeect database from C-Gate, parsing it into three lists:
 	* applications
 	* groups
 	* units

 */

function CGateDatabase(netId) {
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
}

CGateDatabase.prototype.fetch = function(client, callback) {
	console.assert((client.project == this.netId.project) && (client.network == this.netId.network));
	
	log(`Fetching database`);
	client.getDB(this.netId, result => {
		const dbxml = result.snippet.content;
		log(`Parsing database (${dbxml.length} bytes)`);
		
		xml2js.parseString(dbxml, {
			normalizeTags: true,
			explicitArray: false
		}, (err, databaseXML) => {
			console.assert(!err, `dbgetxml parse failure`, err);
			const result = _parseXML(databaseXML);
			this.applications = result.applications;
			this.groups = result.groups;
			this.units = result.units;
			
			// build group map
			const groupMap = new Map();
			result.groups.forEach(group => {
				const netId = new CBusNetId(this.netId.project, this.netId.network, group.application, group.address);
				groupMap.set(netId.getHash(), group);
			});
			this.groupMap = groupMap;
			
			// build unit map
			const unitMap = new Map();
			result.units.forEach(unit => {
				const netId = new CBusNetId(this.netId.project, this.netId.network, `p`, unit.address);
				unitMap.set(netId.getHash(), unit);
			});
			this.unitMap = unitMap;
			
			if (callback) {
				callback();
			}
		});
	});
};

function _parseXML(databaseXML) {
	let groupCount = 0;
	
	// create 3 arrays: applications, groups, units
	const applications = [],
		groups = [],
		units = [];
	
	// create map of maps containing groups (by application, by group address)
	_arrayize(databaseXML.network.application).forEach(srcApplication => {
		const application = {
			address: cbusUtils.integerise(srcApplication.address),
			name: srcApplication.tagname,
		};
		applications.push(application);
		
		// now descend into groups
		_arrayize(srcApplication.group).forEach(srcGroup => {
			const group = {
				application: application.address,
				address: cbusUtils.integerise(srcGroup.address),
				name: srcGroup.tagname
			};
			groups.push(group);
		});
	});
	
	// create map of physical devices
	_arrayize(databaseXML.network.unit).forEach(srcUnit => {
		const unit = {
			tag: srcUnit.tagname,
			partName: srcUnit.unitname,
			address: cbusUtils.integerise(srcUnit.address),
			firmwareVersion: srcUnit.firmwareversion,
			serialNumber: srcUnit.serialnumber,
			catalogNumber: srcUnit.catalognumber,
			unitType: srcUnit.unittype
		};
		units.push(unit);
	});
	
	return {
		applications: applications,
		groups: groups,
		units: units
	};
}

function _arrayize(element) {
	return Array.isArray(element) ? element : [element];
}

CGateDatabase.prototype.getTag = function(netId) {
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
	} else if (netId.isGroupId()) {
		let group = this.groupMap.get(netId.getHash());
		name = group ? group.name : `group${netId.group}`;
	} else {
		console.assert(netId.isUnitId());
		const hash = netId.getHash();
		let unit = this.unitMap.get(hash);
		name = unit ? unit.tag : `unit${netId.unitAddress}`;
	}
	
	return name;
};

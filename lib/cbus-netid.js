'use strict';

module.exports = CBusNetId;

const test = require('tape');
const util = require('util');

const cbusUtils = require('./cbus-utils.js');


// object representing C-Bus network id (netId) in one of the following formats:
// network -- '//SHAC/254'
// application: '//SHAC/254/56'
// group address: '//SHAC/254/56/191'
// unit address: '//SHAC/254/p/22'
function CBusNetId(project, network, param3, param4) {
	// project
	if (typeof project === `undefined`) {
		throw new Error(`netIds must have a project`);
	}
	this.project = CBusNetId.validatedProjectName(project);
	
	// network
	if (typeof network === `undefined`) {
		throw new Error(`netIds must have a network`);
	}
	this.network = cbusUtils.integerise(network);
	
	if (param3 === `p`) {
		// unit address
		this.unitAddress = cbusUtils.integerise(param4);
		if (typeof this.unitAddress === `undefined`) {
			throw new Error(`unit netIds must have a unitAddress`);
		}
	} else {
		// application and group
		this.application = cbusUtils.integerise(param3);
		this.group = cbusUtils.integerise(param4);
		
		if ((typeof this.group !== `undefined`) && (typeof this.application === `undefined`)) {
			throw new Error(`group netIds must have an application`);
		}
	}
}

CBusNetId.prototype.toString = function () {
	let result = `//${this.project}/${this.network}`;
	
	if (typeof this.application != 'undefined') {
		result = (`${result}/${this.application}`);
		
		if (typeof this.group != 'undefined') {
			result = (`${result}/${this.group}`)
		}
	}
	
	return result;
};

CBusNetId.prototype.inspect = function (depth, options) {
	return this.toString();
};

CBusNetId.prototype.getHash = function () {
	let hash;
	
	if (this.isUnitId()) {
		hash = (0x1 << 24) | ((this.network & 0xFF) << 16) | (this.unitAddress & 0xFF);
	} else {
		hash = ((this.network & 0xFF) << 16) | ((this.application & 0xFF) << 8) | (this.group & 0xFF);
	}
	
	return hash.toString(16);
};

CBusNetId.prototype.isNetworkId = function () {
	return (typeof this.application === `undefined`) && (typeof this.unitAddress === `undefined`);
};

CBusNetId.prototype.isApplicationId = function () {
	return (typeof this.application !== `undefined`) && (typeof this.group === `undefined`);
};

CBusNetId.prototype.isGroupId = function () {
	return !this.isApplicationId() && (typeof this.group !== `undefined`);
};

CBusNetId.prototype.isUnitId = function () {
	return (typeof this.unitAddress !== `undefined`);
};

// static factory method
CBusNetId.parse = function (netIdString) {
	const NETID_REGEX = /^\/\/([A-Z][A-Z0-9]{0,7})\/(\d{1,3})(?:\/(p|\d{1,3})(?:\/(\d{1,3}))?)?$/;
    const components = netIdString.match(NETID_REGEX);
    
    if (!components) {
    	throw new Error(`badly formed netid: '${netIdString}'`);
	}
	
    return new CBusNetId(components[1], components[2], components[3], components[4]);
};

// static factory method
CBusNetId.validatedProjectName = function (name) {
	if (name.match(/^([A-Z][A-Z0-9]{0,7})$/) == null) {
		throw new Error(`illegal project name (format /[A-Z][A-Z0-9]{0,7}/) '${name}`);
	}
	
	return name;
};

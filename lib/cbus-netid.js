'use strict';

module.exports = CBusNetId;

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
	let result;

	if (this.isNetworkId()) {
		result = `//${this.project}/${this.network}`;
	} else if (this.isApplicationId()) {
		result = `//${this.project}/${this.network}/${this.application}`;
	} else if (this.isGroupId()) {
		result = `//${this.project}/${this.network}/${this.application}/${this.group}`;
	} else {
		result = `//${this.project}/${this.network}/p/${this.unitAddress}`;
	}

	return result;
};

CBusNetId.prototype.inspect = function () {
	return this.toString();
};

CBusNetId.prototype.getHash = function () {
	let hash;

	if (this.isUnitId()) {
		hash = (0x2 << 24) | (this.network << 16) | this.unitAddress;
	} else {
		hash = (0x1 << 24) | (this.network << 16) | (this.application << 8) | this.group;
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
	if (!name.match(/^([A-Z][A-Z0-9]{0,7})$/)) {
		throw new Error(`illegal project name (format /[A-Z][A-Z0-9]{0,7}/) '${name}`);
	}

	return name;
};

// assumes both are CBusNetId
CBusNetId.compare = function (a, b) {
	console.assert((a instanceof CBusNetId) && (b instanceof CBusNetId));

	// alphabetical order on project name
	if (a.project !== b.project) {
		return a.project < b.project ? -1 : 1;
	}

	// unitIds after all other Ids
	if (a.isUnitId() !== b.isUnitId()) {
		return a.isUnitId() ? 1 : -1;
	}

	// otherwise just go by the hash of the address
	return (a.getHash() < b.getHash()) ? -1 : 1;
};

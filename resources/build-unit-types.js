'use strict';

const fs = require('fs');
const util = require('util');
const assert = require('assert');

require('../hot-debug.js');
const log = require('debug')('builder');

const _ = require('lodash');
const chalk = require('chalk');
const xml2js = require('xml2js');
const program = require('commander');
const stringify = require('json-stable-stringify');

// parses the cbusunits.xml distributed by clipsal and creates a json file we can use to
// help intepret the response from DBGETXML
// example unit defnition:
/*
 <Unit>
	 <UnitTitle>Family=Wired;Category=Output Units - Dimmers</UnitTitle>
	 <Description>DIN Rail 8 Channel Dimmer, 1A per Channel</Description>
	 <MarketingURL>http://www.clipsal.com/cis/</MarketingURL>
	 <SupportURL>http://www.clipsal.com/cis/support</SupportURL>
	 <CatalogNumber>5508D1A</CatalogNumber>
	 <AlternativeCatalogNumbers>E5508TD1A</AlternativeCatalogNumbers>
	 <FirmwareRevisions>
		 <Revision>
			 <UnitType>DIMDN8</UnitType>
			 <MinVersion>1.1.00</MinVersion>
			 <MaxVersion>1.1.99</MaxVersion>
			 <UnitSpecName>DIMDN8.xml</UnitSpecName>
			 <ClassName>CBusDinProDimmerUnit</ClassName>
			 <IsDefault>true</IsDefault>
		 </Revision>
	 </FirmwareRevisions>
	 <InputCount>0</InputCount>
	 <OutputCount>8</OutputCount>
	 <GroupCount>16</GroupCount>
	 <Impedance>50000</Impedance>
	 <HasClock>true</HasClock>
	 <HasBurden>true</HasBurden>
	 <CurrentDrawn>0</CurrentDrawn>
	 <CurrentSupplied>200</CurrentSupplied>
	 <IsAddressable>true</IsAddressable>
	 <HasJumpers>false</HasJumpers>
 </Unit>
 */

const TYPE_MAP = {
	'Output Units - Dimmers': `dimmer`,
	'Output Units - Relays': `light`,

};

const DESCRIPTION_MAP = {
	'Shutter Relay': `shutter`,
	'C-Bus Ceiling Sweep Fan Controller': `fan`,
	'Passive Infrared Motion Detector': `motion`,
	'Key Input Unit': `key`,
	'DLT Input Unit': `key`
};

//Object.assign()

function _arrayize(element) {
	return Array.isArray(element) ? element : [element];
}

function _process(input) {
	const unknownCategories = [];
	const output = {};

	function register(unitType, unitInfo) {
		function amend(unitInfo, description) {
			const descriptionArray = _arrayize(unitInfo.description);
			// only add the description if it's not already in the list
			if (!_.includes(descriptionArray, description)) {
				unitInfo.description = descriptionArray;
				unitInfo.description.push(description);
			}
		}

		// if found, then amend
		const found = output[unitType];
		if (typeof found === `undefined`) {
			log(`${chalk.bold(`adding`)} ${chalk.red(unitType)}: ${chalk.green(unitInfo.description)} -> ${chalk.blue(unitInfo.type)}`);
			// grab a fresh copy since the same unitInfo can be passed in twice
			output[unitType] = Object.assign(unitInfo);
		} else {
			log(`${chalk.bold(`amending`)} ${chalk.red(unitType)} with ${chalk.green(unitInfo.description)}`);
			// we've already got a copy -- ensure it is compatible
			console.assert(found.inputCount === unitInfo.inputCount);
			console.assert(found.outputCount === unitInfo.outputCount);
			console.assert(found.type === unitInfo.type);

			amend(found, unitInfo.description);
		}
	}

	function getTypeFromDescription(description) {
		return _.find(DESCRIPTION_MAP, (o, key) => description.includes(key));
	}

	function getTypeFromCategory(category) {
		let type = TYPE_MAP[category];

		if (typeof type === `undefined`) {
			// if not registered, stash it
			if (!_.find(unknownCategories, o => (o === category))) {
				unknownCategories.push(category);
			}
		}

		return type;
	}

	const units = input.cbusunits.units.unit;
	_.forEach(units, unit => {
		// build a unitInfo object
		const unitInfo = {};

		// pluck out easy stuff first
		console.assert(typeof unit.description !== `undefined`);
		unitInfo.description = unit.description;

		if (typeof unit.outputcount !== `undefined`) {
			unitInfo.outputCount = parseInt(unit.outputcount);
		}

		if (typeof unit.inputcount !== `undefined`) {
			unitInfo.inputCount = parseInt(unit.inputcount);
		}

		// parse metadata in title
		assert(typeof unit.unittitle !== `undefined`);
		const title = unit.unittitle.split(`;`);
		let category;
		_.forEach(title, part => {
			let [key, value] = part.split(`=`);
			// log(`.... ${key}: ${value}`);

			if (key === `Category`) {
				category = value;
			}
		});
		console.assert(typeof category !== `undefined`);

		// look up by description first, if not found, look up by category
		unitInfo.type = getTypeFromDescription(unit.description);
		if (typeof unitInfo.type === `undefined`) {
			unitInfo.type = getTypeFromCategory(category);
		}

		// extract unitType from the firmwareRevision tag
		// nb. there can be multiple -- eg. WRP4D1 & WRBPD1
		const revisions = _arrayize(unit.firmwarerevisions.revision);
		const unittypes = _.uniq(_.map(revisions, rev => rev.unittype));

		if (unitInfo.type) {
			// register for each unitType
			_.forEach(unittypes, unitType => register(unitType, unitInfo));
		}
	});

	log(`${chalk.bold(`WARNING unhandled categories`)}: ${util.inspect(unknownCategories, {colors: true})}`);

	return output;
}

function _goForIt(inFile, outFile) {
	const inputData = fs.readFileSync(inFile);

	xml2js.parseString(inputData, {
		normalizeTags: true,
		explicitArray: false
	}, (err, input) => {
		console.assert(!err, `dbgetxml parse failure`, err);

		// comparison file for stringify
		let compare = function (a, b) {
			// determine the key order
			function getRank(key) {
				const KEY_RANK = [
					`type`,
					`description`,
					`inputCount`, `outputCount`,
				];
				return _.findIndex(KEY_RANK, o => o === key);
			}

			const rankA = getRank(a.key);
			const rankB = getRank(b.key);

			if ((rankA === -1) || (rankB === -1)) {
				// if not known keys, sort alpha
				return (a.key > b.key) ? 1 : -1;
			} else {
				// sort by rank
				return (rankA > rankB);
			}
		};

		console.info(`reading from ${inFile}`);
		const output = _process(input);
		fs.writeFileSync(outFile, stringify(output, { cmp: compare, space: 2 }));
		console.info(`written to ${outFile}`);
	});
}

function main() {
	program
		.version('0.0.1')
		.option('-i, --input <filename>', 'cbusunits.xml (input file) as distributed by Clipsal')
		.option('-o, --output <filename>', 'unit-types.json output file')
		.parse(process.argv);

	if (typeof program.input === `undefined`) {
		console.error(`fatal error: input file is required!`);
		process.exit(1);
	} else if (typeof program.output === `undefined`) {
		console.error(`fatal error: output file is required!`);
		process.exit(1);
	} else {
		_goForIt(program.input, program.output);
	}
}

main();

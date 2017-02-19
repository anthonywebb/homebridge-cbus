
// until hot-debug is updated to v1.1.0 (pull-request outstanding)
// we'll place a copy of it here


var createDebug = require('debug'),
	debugModulePath = require.resolve('debug'),
	debugModule = require.cache[debugModulePath];

const _ = require('lodash');

// Yo dawg, heard you like debug...
var hotDebugDebug = createDebug('hot-debug');

// Limit this so we don't leak memory if someone goes crazy and creates instances at runtime.
var maxChangeListeners = +process.env.DEBUG_MAX_HOT || 1024;
var changeListeners = [];


module.exports = debugModule.exports = createHotDebug;

//-------------------------------
// theory of operation
//
// to enable debug channel
// - add namespace to whitelist (.names)
// - remove namespace from blacklist (.skips)
// - if it is still disabled, inform user that domain cannot be enabled as it is blacklisted by wildcard
//
// to disable debug channel
// - remove namespace from whitelist (.names)
// - add namespace to blacklist (.skips)
// - if namespace matches whitelist wildcard, doesn't matter as blacklist is checked first
// - if namespace matches blacklist, doesn't matter because it is already disabled


function _addToArrayUnique(array, item) {
	const found = _.find(array, function(x) {
		return _.isEqual(item, x);
	});
	
	if (!found) {
		array.push(item);
	}
}

function _safeRemoveFromArray(array, item) {
	_.remove(array, function(x) {
		return _.isEqual(item, x);
	});
}

function _namespaceRegexFor(namespace) {
	const r1 = namespace.replace(/\*/g, '.*?');
	return new RegExp('^' + r1 + '$');
}

function _addNamespaceToList(list, namespace) {
	_addToArrayUnique(list, _namespaceRegexFor(namespace));
}

function _removeNamespaceFromList(list, namespace) {
	_safeRemoveFromArray(list, _namespaceRegexFor(namespace));
}

//-------------------------------

Object.keys(createDebug).forEach(function (n) {
	if ( n === 'enable' || n === 'disable' ) return;

	// Settings must be set on the orignal object
	Object.defineProperty(createHotDebug, n, {
		get: function () {
			return createDebug[n];
		},
		set: function (v) {
			createDebug[n] = v;
		}
	});
});

createHotDebug.enable = function () {
	var r = createDebug.enable.apply(this, arguments);
	notifyListeners();
	return r;
};

createHotDebug.disable = function () {
	// Workaround for https://github.com/visionmedia/debug/issues/150
	createDebug.names = [];
	createDebug.skips = [];

	var r = createDebug.disable.apply(this, arguments);
	notifyListeners();
	return r;
};

function createHotDebug(namespace) {
	hotDebugDebug("createHotDebug: %s", namespace);

	var debug = createDebug.apply(this, arguments);

	if ( changeListeners.length >= maxChangeListeners ) {
		hotDebugDebug("createHotDebug: maxChangeListeners reached (%d) - %s will not be hot", maxChangeListeners, namespace);
		return debug;
	}

	listener.namespace = namespace;
	
	debug.enable = function (toEnable) {
		if (typeof toEnable == 'undefined') {
			toEnable = true;
		}
		
		if (toEnable) {
			_addNamespaceToList(createDebug.names, this.namespace);
			_removeNamespaceFromList(createDebug.skips, this.namespace);
			
			if (this.disabled) {
				hotDebugDebug("%s: couldn't be enabled; check -skips for wildcards", this.namespace);
			}
		} else {
			// disable
			_removeNamespaceFromList(createDebug.names, this.namespace);
			_addNamespaceToList(createDebug.skips, this.namespace);
		}
		notifyListeners();
	};
	
	changeListeners.push(listener);

	function listener() {
		var wasEnabled = debug.enabled;
		debug.enabled = createDebug.enabled(namespace);

		if ( wasEnabled !== debug.enabled ) {
			hotDebugDebug("%s: enabled state changed: was %s, now %s", namespace, wasEnabled, debug.enabled);
		}
	}

	return debug;
}

function notifyListeners() {
	hotDebugDebug('notifyListeners: notifying %d listeners', changeListeners.length);

	changeListeners.forEach(function (listener) {
		listener();
	});
}

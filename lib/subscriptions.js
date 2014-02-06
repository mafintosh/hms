var events = require('events');

module.exports = function() {
	var that = new events.EventEmitter();
	var subs = {};

	var publish = function(name, id, origin, data, glob) {
		return function(protocol) {
			if (!glob && protocol.globbing) return;
			protocol[name](id, origin, data);
		};
	};

	that.subscribe = function(id, protocol) {
		var s = subs[id] = subs[id] || [];
		if (s.indexOf(protocol) > -1) return;
		if (id === '*') protocol.globbing = true;
		s.push(protocol);
		that.emit('subscribe', id, protocol, s.length);
	};

	that.unsubscribe = function(id, protocol) {
		var s = subs[id] || [];
		var i = s.indexOf(protocol);
		var len = s.length;
		if (i === -1) return;
		if (len === 1) delete subs[id];
		else s.splice(i, 1);
		if (id === '*') protocol.globbing = false;
		that.emit('unsubscribe', id, protocol, len-1);
	};

	that.publish = function(name, id, origin, data) {
		if (subs[id]) subs[id].forEach(publish(name, id, origin, data, false));
		if (subs['*']) subs['*'].forEach(publish(name, id, origin, data, true));
	};

	that.subscriptions = function() {
		return Object.keys(subs);
	};

	that.clear = function(protocol) {
		Object.keys(subs).forEach(function(id) {
			that.unsubscribe(id, protocol);
		});
	};

	return that;
};
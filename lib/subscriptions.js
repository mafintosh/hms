var events = require('events');

module.exports = function() {
	var that = new events.EventEmitter();
	var subs = {};

	var publish = function(name, id, origin, data) {
		return function(protocol) {
			protocol[name](id, origin, data);
		};
	};

	that.subscribe = function(id, protocol) {
		var s = subs[id] = subs[id] || [];
		if (s.indexOf(protocol) > -1) return;
		s.push(protocol);
		that.emit('subscribe', id, protocol, s.length);
	};

	that.unsubscribe = function(id, protocol) {
		var s = subs[id] || [];
		var i = s.indexOf(protocol);
		if (i === -1) return;
		if (s.length === 1) delete subs[id];
		else s.splice(i, 1);
		that.emit('unsubscribe', id, protocol, s.length === 1 ? 0 : s.length);
	};

	that.publish = function(name, id, origin, data) {
		if (subs[id]) subs[id].forEach(publish(name, id, origin, data));
		if (subs['*']) subs['*'].forEach(publish(name, id, origin, data));
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
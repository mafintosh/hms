var parse = function(env) {
	var map = {};

	env.split(/;|\n|,/).forEach(function(str) {
		str = str.trim();
		if (str[0] === '#') return;
		var i = str.indexOf('=');
		if (i === -1) return;
		var key = str.slice(0, i).trim();
		var val = str.slice(i+1).trim().replace(/(^["'])|(["']$)/g, '');
		if (val) map[key] = val;
		else map[key] = undefined;
	});

	return map;
};

module.exports = parse;
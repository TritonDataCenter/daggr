#!/usr/bin/env node

/*
 * Status: sum, count actions work with hardcoded "key" and "value" fields
 *
 * Roadmap:
 * - Add filtering
 * - Add "-o" support
 */

var mod_path = require('path');
var mod_extsprintf = require('extsprintf');
var mod_getopt = require('posix-getopt');
var mod_strsplit = require('strsplit');

var mod_daggr = require('../lib/daggr');

var sprintf = mod_extsprintf.sprintf;

var daArg0 = mod_path.basename(process.argv[1]);
var daUsage = sprintf([
    'usage: %s ACTION'
].join('\n'), daArg0);

function main()
{
	var parser, option;
	var keys = [];
	var value = '1';
	var action = 'print'
	var mode = 'text';
	var source, rowstream, consumer;

	parser = new mod_getopt.BasicParser('jk:v:', process.argv);
	while ((option = parser.getopt()) !== undefined) {
		switch (option.option) {
		case 'k':
			keys.push(option.optarg);
			break;

		case 'j':
			mode = 'json'
			break;

		case 'v':
			value = option.optarg;
			break;
		}
	}

	if (process.argv.length > parser.optind())
		action = process.argv[parser.optind()];

	source = process.stdin;
	rowstream = new mod_daggr.RowStream({
	    'mode': mode,
	    'stream': source
	});
	consumer = mod_daggr.createConsumer(action, {
	    'mode': mode,
	    'action': action,
	    'key': keys,
            'value': value,
	    'stream': rowstream,
	    'outstream': process.stdout
	});

	if (consumer instanceof Error)
		fatal(consumer.message);

	process.stdin.resume();
}

function usage(message)
{
	console.error('%s: %s', daArg0, message);
	console.error(daUsage);
	process.exit(2);
}

function fatal(message)
{
	console.error('%s: %s', daArg0, message);
	process.exit(1);
}

main();

#!/usr/bin/env node

var mod_path = require('path');
var mod_extsprintf = require('extsprintf');
var mod_getopt = require('posix-getopt');
var mod_strsplit = require('strsplit');

var mod_daggr = require('../lib/daggr');

var sprintf = mod_extsprintf.sprintf;

var daArg0 = mod_path.basename(process.argv[1]);
var daUsage = sprintf([
    'usage: %s [-j] [-k FIELD...] [-f FILTER ...] [-o FIELD...] [-v FIELD] ' +
        '[ACTION]',
    '',
    '%s takes an input stream of plaintext or JSON data and filters it, ',
    'selects certain fields, or aggregates numeric values, optionally grouped ',
    'by a different field.',
    '',
    'Input is assumed to be plaintext by default.  Use -j for JSON data.',
    '',
    'FILTER is a JavaScript expression that will be evaluated for each input ',
    'row.  If the result is not truthy, the row is discarded.  For plaintext ',
    '',
    'FIELD is a JavaScript propety expression, as in "prop1.prop2[...]".  This ',
    'may not be an arbitrary expression, and if the property is not found, ',
    'the result is the JavaScript undefined value.',
    '',
    'The default action is to print the input directly.  In this mode, you ',
    'can filter rows with -f and specify which fields to print with -o.',
    '',
    'Several aggregations are available, which result in no output until ',
    'the input has been fully read, at which point the aggregated result ',
    'is printed.  Available aggregations include:',
    '',
    '    avg',
    '    count',
    '    max',
    '    min',
    '    sum',
    '',
    'With these aggregations, you can use -k to specify another field to ',
    'group the results by.  By default, the value in column 1 is used for ',
    'the aggregation, but you can change this with -v.',
].join('\n'), daArg0, daArg0);

function main()
{
	var parser, option;
	var keys = [];
	var value = '1';
	var action = 'print'
	var mode = 'text';
	var outputs = null;
	var filters = [];
	var source, stream, args, consumer;

	parser = new mod_getopt.BasicParser('f:jk:o:v:', process.argv);
	while ((option = parser.getopt()) !== undefined) {
		switch (option.option) {
		case 'k':
			keys.push(option.optarg);
			break;

		case 'f':
			filters.push(option.optarg);
			break;

		case 'j':
			mode = 'json'
			break;

		case 'o':
			if (outputs === null)
				outputs = [];
			outputs.push(option.optarg);
			break;

		case 'v':
			value = option.optarg;
			break;

		default:
			usage();
		}
	}

	if (process.argv.length > parser.optind())
		action = process.argv[parser.optind()];

	if (outputs === null)
		outputs = [ mode == 'json' ? 'this' : '0' ];

	source = process.stdin;
	stream = new mod_daggr.RowStream({
	    'mode': mode,
	    'stream': source
	});

	args = {
	    'mode': mode,
	    'action': action,
	    'key': keys,
            'value': value,
	    'stream': stream,
	    'outputs': outputs,
	    'outstream': process.stdout
	};

	filters.forEach(function (f) {
		try {
			stream = args['stream'] = 
			    new mod_daggr.FilterStream(args, f);
		} catch (err) {
			fatal('bad filter "' + f + '": ' + err.message);
		}
	});
	
	consumer = mod_daggr.createConsumer(action, args);

	if (consumer instanceof Error)
		fatal(consumer.message);

	process.stdin.resume();
}

function usage(message)
{
	if (arguments.length > 0)
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

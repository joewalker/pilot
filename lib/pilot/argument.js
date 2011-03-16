/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Skywriter.
 *
 * The Initial Developer of the Original Code is
 * Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Joe Walker (jwalker@mozilla.com)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

define(function(require, exports, module) {


var console = require('pilot/console');
var oop = require('pilot/oop');

/**
 * We record where in the input string an argument comes so we can report
 * errors against those string positions.
 * We publish a 'change' event when-ever the text changes.
 * @param text The string (trimmed) that contains the argument
 * @param start The position of the text in the original input string
 * @param end See start
 * @param prefix Knowledge of quotation marks and whitespace used prior to the
 * text in the input string allows us to re-generate the original input from
 * the arguments.
 * @param suffix Any quotation marks and whitespace used after the text.
 * Whitespace is normally placed in the prefix to the succeeding argument, but
 * can be used here when this is the last argument.
 * @constructor
 */
function Argument(text, prefix, suffix, start, end) {
    if (text === undefined) {
        this.text = '';
        this.prefix = '';
        this.suffix = '';
        this.start = Argument.AT_CURSOR;
        this.end = Argument.AT_CURSOR;
    }
    else {
        this.text = text;
        this.prefix = prefix !== undefined ? prefix : '';
        this.suffix = suffix !== undefined ? suffix : '';
        this.start = start !== undefined ? start : Argument.AT_CURSOR;
        this.end = end !== undefined ? end : Argument.AT_CURSOR;
    }
}

/**
 * Return the result of merging these arguments.
 * TODO: What happens when we're merging arguments for the single string
 * case and some of the arguments are in quotation marks?
 */
Argument.prototype.merge = function(following) {
    return new Argument(
        this.text + this.suffix + following.prefix + following.text,
        this.prefix, following.suffix,
        this.start, following.end);
};

/**
 * Returns a new Argument like this one but with the text set to
 * <tt>replText</tt> and the end adjusted to fit.
 * @param replText Text to replace the old text value
 */
Argument.prototype.beget = function(replText, options) {
    var start = this.start;
    var prefix = this.prefix;
    var suffix = this.suffix;

    var quote = (replText.indexOf(' ') >= 0 || replText.length == 0) ?
            '\'' : '';

    if (options) {
        prefix = (options.prefixSpace ? ' ' : '') + quote;
        start = start - this.prefix.length + prefix.length;
    }

    var end = this.end - this.text.length + replText.length;

    if (options) {
        suffix = quote;
        end = end - this.suffix.length + suffix.length;
    }

    return new Argument(replText, prefix, suffix, start, end);
};

/**
 * Returns a new Argument like this one but slid along by <tt>distance</tt>.
 * @param distance The amount to shift the prefix and suffix by (can be
 * negative)
 */
Argument.prototype.begetShifted = function(distance) {
    return new Argument(
        this.text,
        this.prefix, this.suffix,
        this.start + distance, this.end + distance);
};

/**
 * Is there any visible content to this argument?
 */
Argument.prototype.isBlank = function() {
    return this.text === '' &&
            this.prefix.trim() === '' &&
            this.suffix.trim() === '';
};

/**
 * We need to keep track of which assignment we've been assigned to
 */
Argument.prototype.assign = function(assignment) {
    this.assignment = assignment;
};

/**
 *
 */
Argument.prototype.updateCliArgs = function(args, oldArg) {
    // If oldArg appears in our list of args then we need to update
    var updated = false;
    for (var i = 0; i < args.length; i++) {
        if (args[i] === oldArg) {
            args[i] = this;
            updated = true;
        }
    }

    // If we didn't find a slot for the argument earlier, then we add it on to
    // the end of the command line
    if (!updated) {
        // TODO: Perhaps it would be nice to check that oldArg is blank?
        args.push(this);
    }
};

/**
 * We define equals to mean all arg properties are strict equals
 */
Argument.prototype.equals = function(that) {
    if (this === that) {
        return true;
    }
    if (that == null) {
        return false;
    }

    // TODO: can we check that it's not a subtype?
    if (!(that instanceof Argument)) {
        throw new Error('arg2 is not an Argument');
    }

    return this.text === that.text &&
           this.prefix === that.prefix && this.suffix === that.suffix &&
           this.start === that.start && this.end === that.end;
};

/**
 * Helper when we're putting arguments back together
 */
Argument.prototype.toString = function() {
    // TODO: There is a bug here - we should re-escape escaped characters
    // But can we do that reliably?
    return this.prefix + this.text + this.suffix;
};

/**
 * Merge an array of arguments into a single argument.
 * All Arguments in the array are expected to have the same emitter
 */
Argument.merge = function(argArray, start, end) {
    start = (start === undefined) ? 0 : start;
    end = (end === undefined) ? argArray.length : end;

    var joined;
    for (var i = start; i < end; i++) {
        var arg = argArray[i];
        if (!joined) {
            joined = arg;
        }
        else {
            joined = joined.merge(arg);
        }
    }
    return joined;
};

/**
 * We sometimes need a way to say 'this error occurs where the cursor is',
 * which causes it to be sorted towards the top.
 */
Argument.AT_CURSOR = -1;
exports.Argument = Argument;


/**
 * Commands like 'echo' with a single string argument, and used with the
 * special format like: 'echo a b c' effectively have a number of arguments
 * merged together.
 */
function MergedArgument(args, prefix, suffix, start, end) {
    if (!Array.isArray(args)) {
        throw new Error('args is not an array of Arguments');
    }

    this.args = args;
    var arg = Argument.merge(args);
    this.text = arg.text;
    this.prefix = arg.prefix;
    this.suffix = arg.suffix;
    this.start = arg.start;
    this.end = arg.end;
}

oop.inherits(MergedArgument, Argument);

/**
 * Keep track of which assignment we've been assigned to, and allow the
 * original args to do the same.
 */
MergedArgument.prototype.assign = function(assignment) {
    this.args.forEach(function(arg) {
        arg.assign(assignment);
    }, this);

    this.assignment = assignment;
};

/**
 * The standard Argument.beget has a function to add quotes, however this is
 * not needed for MergedArguments which need no quoting, so this version
 * removes the options.quote function.
 */
MergedArgument.prototype.beget = function(replText, options) {
    var start = this.start;
    var prefix = this.prefix;
    var suffix = this.suffix;

    if (options) {
        prefix = options.prefixSpace ? ' ' : '';
        start = start - this.prefix.length + prefix.length;
    }

    var end = this.end - this.text.length + replText.length;

    if (options) {
        suffix = '';
        end = end - this.suffix.length;
    }

    return new MergedArgument(replText, prefix, suffix, start, end);
};

MergedArgument.prototype.equals = function(that) {
    if (this === that) {
        return true;
    }
    if (that == null) {
        return false;
    }

    if (!(that instanceof MergedArgument)) {
        throw new Error('arg2 is not a MergedArgument');
    }

    // TODO: do we need to check that args is the same?

    return this.text === that.text &&
           this.prefix === that.prefix && this.suffix === that.suffix &&
           this.start === that.start && this.end === that.end;
};

exports.MergedArgument = MergedArgument;


/**
 * BooleanNamedArguments are for when we have an argument line --verbose which
 * has a boolean value, and thus the opposite of '--verbose' is ''.
 */
function BooleanNamedArgument(arg) {
    this.arg = arg;

    this.text = arg.text;
    this.prefix = arg.prefix;
    this.suffix = arg.suffix;
    this.start = arg.start;
    this.end = arg.end;
}

oop.inherits(BooleanNamedArgument, Argument);

BooleanNamedArgument.prototype.assign = function(assignment) {
    this.arg.assign(assignment);
    this.assignment = assignment;
};

BooleanNamedArgument.prototype.equals = function(that) {
    if (this === that) {
        return true;
    }
    if (that == null) {
        return false;
    }

    if (!(that instanceof BooleanNamedArgument)) {
        throw new Error('arg2 is not a BooleanNamedArgument');
    }

    // TODO: do we need to check that arg is the same?

    return this.text === that.text &&
           this.prefix === that.prefix && this.suffix === that.suffix &&
           this.start === that.start && this.end === that.end;
};

exports.BooleanNamedArgument = BooleanNamedArgument;

/**
 * A named argument is for cases where we have input in one of the following
 * formats:
 * <ul>
 * <li>--param value
 * <li>-p value
 * <li>--pa value
 * <li>-p:value
 * <li>--param=value
 * <li>etc
 * </ul>
 * The general format is:
 * /--?{unique-param-name-prefix}[ :=]{value}/
 * We model this as a normal argument but with a long prefix.
 */
function NamedArgument(nameArg, valueArg) {
    this.nameArg = nameArg;
    this.valueArg = valueArg;

    this.text = valueArg.text;
    this.start = valueArg.start;
    this.end = valueArg.end;
    this.prefix = nameArg.toString() + valueArg.prefix;
    this.suffix = valueArg.suffix;
}

oop.inherits(NamedArgument, Argument);

NamedArgument.prototype.assign = function(assignment) {
    this.nameArg.assign(assignment);
    this.valueArg.assign(assignment);
    this.assignment = assignment;
};

NamedArgument.prototype.equals = function(that) {
    if (this === that) {
        return true;
    }
    if (that == null) {
        return false;
    }

    if (!(that instanceof NamedArgument)) {
        throw new Error('arg2 is not a NamedArgument');
    }

    // TODO: do we need to check that nameArg and valueArg are the same?

    return this.text === that.text &&
           this.prefix === that.prefix && this.suffix === that.suffix &&
           this.start === that.start && this.end === that.end;
};

exports.NamedArgument = NamedArgument;


/**
 *
 */
function ArrayArgument() {
    this.args = [];
}

oop.inherits(ArrayArgument, Argument);

ArrayArgument.prototype.addArgument = function(arg) {
    this.args.push(arg);
};

ArrayArgument.prototype.addArguments = function(args) {
    Array.prototype.push.apply(this.args, args);
};

ArrayArgument.prototype.getArguments = function() {
    return this.args;
};

ArrayArgument.prototype.assign = function(assignment) {
    this.args.forEach(function(arg) {
        arg.assign(assignment);
    }, this);

    this.assignment = assignment;
};

ArrayArgument.prototype.updateCliArgs = function(cliArgs, oldArg) {
    // Remove all oldArgs from CLIs list of args,
    // remembering where we found the first match
    var firstMatchingIdx = cliArgs.length;
    var oldArgs = oldArg.args;

    for (var cliIdx = 0; cliIdx < cliArgs.length; cliIdx++) {
        var cliArg = cliArgs[cliIdx];

        for (var oldIdx = 0; oldIdx < oldArgs.length; oldIdx++) {
            var oldArg = oldArgs[oldIdx];

            if (oldArg === cliArg) {
                if (cliIdx < firstMatchingIdx) {
                    firstMatchingIdx = cliIdx;
                }
                cliArgs.splice(cliIdx, 1);
                cliIdx--;
            }
        }
    }

    // Insert all new args (i.e. from 'this') at the position of the first
    for (var i = 0; i < this.args.length; i++) {
        cliArgs.splice(firstMatchingIdx + i, 0, this.args[i]);
    }
};

ArrayArgument.prototype.equals = function(that) {
    if (this === that) {
        return true;
    }
    if (that == null) {
        return false;
    }

    if (!(that instanceof ArrayArgument)) {
        throw new Error('arg2 is not a ArrayArgument');
    }

    if (this.args.length !== that.args.length) {
        return false;
    }

    for (var i = 0; i < this.args.length; i++) {
        if (!this.args[i].equals(that.args[i])) {
            return false;
        }
    }

    return true;
};

/**
 * Helper when we're putting arguments back together
 */
ArrayArgument.prototype.toString = function() {
    return '{' + this.args.map(function(arg) {
        return arg.toString();
    }, this).join(',') + '}';
};

exports.ArrayArgument = ArrayArgument;


});

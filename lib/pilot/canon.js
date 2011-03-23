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
 * The Original Code is Mozilla Skywriter.
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
var Trace = require('pilot/stacktrace').Trace;
var oop = require('pilot/oop');
var useragent = require('pilot/useragent');
var keyUtil = require('pilot/keys');
var EventEmitter = require('pilot/event_emitter').EventEmitter;
var typecheck = require('pilot/typecheck');
var catalog = require('pilot/catalog');
var Status = require('pilot/types').Status;
var types = require('pilot/types');
var lang = require('pilot/lang');

var BooleanType = require('pilot/types/basic').BooleanType;

/*
// TODO: this doesn't belong here - or maybe anywhere?
var dimensionsChangedExtensionSpec = {
    name: 'dimensionsChanged',
    description: 'A dimensionsChanged is a way to be notified of ' +
            'changes to the dimension of Skywriter'
};
exports.startup = function(data, reason) {
    catalog.addExtensionSpec(commandExtensionSpec);
};
exports.shutdown = function(data, reason) {
    catalog.removeExtensionSpec(commandExtensionSpec);
};
*/

var commandExtensionSpec = {
    name: 'command',
    description: 'A command is a bit of functionality with optional ' +
            'typed arguments which can do something small like moving ' +
            'the cursor around the screen, or large like cloning a ' +
            'project from VCS.',
    indexOn: 'name'
};

exports.startup = function(data, reason) {
    // TODO: this is probably all kinds of evil, but we need something working
    catalog.addExtensionSpec(commandExtensionSpec);
};

exports.shutdown = function(data, reason) {
    catalog.removeExtensionSpec(commandExtensionSpec);
};


/**
 * A lookup hash of our registered commands
 */
var commands = {};

/**
 * A sorted list of command names, we regularly want them in order, so pre-sort
 */
var commandNames = [];

/**
 *
 */
function Command(commandSpec) {
    Object.keys(commandSpec).forEach(function(key) {
        this[key] = commandSpec[key];
    }, this);

    if (!this.name) {
        throw new Error('All registered commands must have a name');
    }

    if (this.params == null) {
        this.params = [];
    }
    if (!Array.isArray(this.params)) {
        throw new Error('command.params must be an array in ' + this.name);
    }

    var paramNames = this.params.map(function(param) {
        return param.name;
    }, this);
    this.params = this.params.map(function(paramSpec) {
        return new Parameter(paramSpec, this, paramNames);
    }, this);
};
Command.prototype = {
    getDescription: function() {
        return this.description ? this.description : '(No description)';
    }
};

/**
 * A lookup has for command key bindings that use a string as sender.
 */
var commmandKeyBinding = {};

/**
 * Array with command key bindings that use a function to determine the sender.
 */
var commandKeyBindingFunc = { };

function splitSafe(s, separator, limit, bLowerCase) {
    return (bLowerCase && s.toLowerCase() || s)
        .replace(/(?:^\s+|\n|\s+$)/g, "")
        .split(new RegExp("[\\s ]*" + separator + "[\\s ]*", "g"), limit || 999);
}

function parseKeys(keys, val, ret) {
    var key,
        hashId = 0,
        parts  = splitSafe(keys, "\\-", null, true),
        i      = 0,
        l      = parts.length;

    for (; i < l; ++i) {
        if (keyUtil.KEY_MODS[parts[i]])
            hashId = hashId | keyUtil.KEY_MODS[parts[i]];
        else
            key = parts[i] || "-"; //when empty, the splitSafe removed a '-'
    }

    if (ret == null) {
        return {
            key: key,
            hashId: hashId
        };
    } else {
        (ret[hashId] || (ret[hashId] = {}))[key] = val;
    }
}

var platform = useragent.isMac ? "mac" : "win";
function buildKeyHash(command) {
    var binding = command.bindKey,
        key = binding[platform],
        ckb = commmandKeyBinding,
        ckbf = commandKeyBindingFunc;

    if (!binding.sender) {
        throw new Error('All key bindings must have a sender');
    }
    if (!binding.mac && binding.mac !== null) {
        throw new Error('All key bindings must have a mac key binding');
    }
    if (!binding.win && binding.win !== null) {
        throw new Error('All key bindings must have a windows key binding');
    }
    if(!binding[platform]) {
        // No key mapping for this platform.
        return;
    }
    if (typeof binding.sender == 'string') {
        var targets = splitSafe(binding.sender, "\\|", null, true);
        targets.forEach(function(target) {
            if (!ckb[target]) {
                ckb[target] = { };
            }
            key.split("|").forEach(function(keyPart) {
                parseKeys(keyPart, command, ckb[target]);
            });
        });
    } else if (typecheck.isFunction(binding.sender)) {
        var val = {
            command: command,
            sender:  binding.sender
        };

        keyData = parseKeys(key);
        if (!ckbf[keyData.hashId]) {
            ckbf[keyData.hashId] = { };
        }
        if (!ckbf[keyData.hashId][keyData.key]) {
            ckbf[keyData.hashId][keyData.key] = [ val ];
        } else {
            ckbf[keyData.hashId][keyData.key].push(val);
        }
    } else {
        throw new Error('Key binding must have a sender that is a string or function');
    }
}

function findKeyCommand(env, sender, hashId, textOrKey) {
    // Convert keyCode to the string representation.
    if (typecheck.isNumber(textOrKey)) {
        textOrKey = keyUtil.keyCodeToString(textOrKey);
    }

    // Check bindings with functions as sender first.
    var bindFuncs = (commandKeyBindingFunc[hashId]  || {})[textOrKey] || [];
    for (var i = 0; i < bindFuncs.length; i++) {
        if (bindFuncs[i].sender(env, sender, hashId, textOrKey)) {
            return bindFuncs[i].command;
        }
    }

    var ckbr = commmandKeyBinding[sender];
    return ckbr && ckbr[hashId] && ckbr[hashId][textOrKey];
}

exports.findKeyCommand = findKeyCommand;

function execKeyCommand(env, sender, hashId, textOrKey) {
    var command = findKeyCommand(env, sender, hashId, textOrKey);
    if (command) {
        return exec(command, env, sender, { });
    } else {
        return false;
    }
}

exports.execKeyCommand = execKeyCommand;

/**
 * A wrapper for a paramSpec so we can sort out shortened versions names for
 * option switches
 */
function Parameter(paramSpec, command, paramNames) {
    this.command = command || { name: 'unnamed' };

    Object.keys(paramSpec).forEach(function(key) {
        this[key] = paramSpec[key];
    }, this);
    this.description = this.description || '';

    if (!this.name) {
        throw new Error('In ' + this.command.name + ': all params must have a name');
    }

    // Find the shortest unique prefix of this name
    if (paramNames) {
        var uniquePrefix = this.name[0];
        for (var i = 0; i < paramNames.length; i++) {
            // Lengthen while unique is a prefix of testParam.name
            while (paramNames[i].indexOf(uniquePrefix) === 0 &&
                    uniquePrefix !== this.name) {
                uniquePrefix = this.name.substr(0, uniquePrefix.length + 1);
            }
            if (uniquePrefix === this.name) {
                break;
            }
        }
        this.uniquePrefix = uniquePrefix;
        this.regexp = new RegExp('^--?' + this.uniquePrefix);
    }

    var lookup = this.type;
    this.type = types.getType(lookup);
    if (this.type == null) {
        console.error('Known types: ' + types.getTypeNames().join(', '));
        throw new Error('In ' + this.command.name + '/' + this.name +
            ': can\'t find type for: ' + JSON.stringify(lookup));
    }

    // boolean parameters have an implicit defaultValue:false, which should
    // not be changed. See the docs.
    if (this.type instanceof BooleanType) {
        if ('defaultValue' in this) {
            console.error('In ' + this.command.name + '/' + this.name +
                    ': boolean parameters can not have a defaultValue.' +
                    ' Ignoring');
        }
        this.defaultValue = false;
    }

    // Check the defaultValue for validity. Unnecessary?
    if (this.defaultValue !== undefined) {
        try {
            var defaultText = this.type.stringify(this.defaultValue);
            var defaultConversion = this.type.parseString(defaultText);
            if (defaultConversion.getStatus() !== Status.VALID) {
                console.error('In ' + this.command.name + '/' + this.name +
                        ': Error round tripping defaultValue. status = ' +
                        defaultConversion.getStatus());
            }
        }
        catch (ex) {
            console.error('In ' + this.command.name + '/' + this.name + ': ' + ex);
        }
    }
}

Parameter.prototype = {
    isNamedParam: function() {
        return this.regexp && this.regexp.test(test);
    },

    isDataRequired: function() {
        return this.defaultValue === undefined;
    }
};

exports.Parameter = Parameter;

/**
 * This registration method isn't like other Ace registration methods because
 * it doesn't return a decorated command because there is no functional
 * decoration to be done.
 * TODO: Are we sure that in the future there will be no such decoration?
 */
function addCommand(command, name) {
    if (typeof command === 'function') {
        if (!command.metadata) {
            throw new Error('Commands registered as functions need metdata');
        }
        if (!command.metadata.name) {
            if (!name) {
                throw new Error('All registered commands must have a name');
            }
            else {
                command.metadata.name = name;
            }
        }
        command.metadata.exec = command;
        command.metadata.functional = true;
        command = command.metadata;
    }
    else {
        command.functional = false;
        command.name = name || command.name;
    }

    commands[command.name] = new Command(command);

    if (command.bindKey) {
        buildKeyHash(command);
    }

    commandNames.push(command.name);
    commandNames.sort();
}

function addCommands(context, name) {
    if (name) {
        if (!context.metadata) {
            throw new Error('name supplied to addCommands (implies command ' +
                'set) but missing metatdata on context');
        }

        addCommand(context.metadata, name);
    }

    Object.keys(context).forEach(function(key) {
        var command = context[key];
        if (typeof command !== 'function') {
            return;
        }
        command.metadata = command.metadata || context[key + 'Metadata'];
        if (!command.metadata) {
            return;
        }
        command.metadata.context = command.metadata.context || context;
        addCommand(command, name ? name + ' ' + key : key);
    });
}

function removeCommands(context, name) {
    Object.keys(context).forEach(function(key) {
        var command = context[key];
        if (typeof command !== 'function' || !command.metadata) {
            return;
        }
        removeCommand(command.metadata);
    });

    if (name) {
        removeCommand(context.metadata, name);
    }
}

function removeCommand(command) {
    var name = (typeof command === 'string' ? command : command.name);
    delete commands[name];
    lang.arrayRemove(commandNames, name);
}

function getCommand(name) {
    return commands[name];
}

function getCommands() {
    return Object.keys(commands).map(function(name) {
        return commands[name];
    }, this);
}

function getCommandNames() {
    return commandNames;
}

var cacheRequest;
function getRequest() {
    return cacheRequest;
}
var cacheEnv;
function getEnvironment() {
    return cacheEnv;
}

/**
 * Default ArgumentProvider that is used if no ArgumentProvider is provided
 * by the command's sender.
 */
function defaultArgsProvider(request, callback) {
    var args  = request.args,
        params = request.command.params;

    for (var i = 0; i < params.length; i++) {
        var param = params[i];

        // If the parameter is already valid, then don't ask for it anymore.
        if (getParamStatus(request, param) != Status.VALID ||
            // Ask for optional parameters as well.
            param.defaultValue === null)
        {
            var paramPrompt = param.description;
            if (param.defaultValue === null) {
                paramPrompt += " (optional)";
            }
            var value = prompt(paramPrompt, param.defaultValue || "");
            // No value but required -> nope.
            if (!value) {
                callback();
                return;
            } else {
                args[param.name] = value;
            }
        }
    }
    callback();
}

/**
 * Return the status of a parameter on the request object.
 */
function getParamStatus(request, param) {
    var args = request.args || {};

    // Check if there is already a value for the request.
    if (param.name in args) {
        // If there is no value set and then the value is VALID if it's not
        // required or INCOMPLETE if not set yet.
        if (args[param.name] == null) {
            if (param.defaultValue === null) {
                return Status.VALID;
            } else {
                return Status.INCOMPLETE;
            }
        }

        // The passed in value when parsing a type is a string.
        var text = args[param.name].toString();

        // Check if the parameter value is valid.
        var arg = new Argument(text);
        var conversion = param.type.parse(arg);
        var status = conversion.getStatus(arg);

        if (status !== Status.VALID) {
            return status;
        }
    }
    // Check if the param is marked as required.
    else if (param.defaultValue === undefined) {
        // The parameter is not set on the args object but it's required,
        // which means, things are invalid.
        return Status.INCOMPLETE;
    }

    return Status.VALID;
}

/**
 * Checks if all required arguments are set on the request such that it can
 * get executed.
 */
function getRequestStatus(request) {
    var args = request.args || {},
        params = request.command.params;

    // If there are not parameters, then it's valid.
    if (!params || params.length == 0) {
        return Status.VALID;
    }

    var status = [];
    for (var i = 0; i < params.length; i++) {
        status.push(getParamStatus(request, params[i]));
    }

    return Status.combine(status);
};

function prematureExec(command, env, sender, args, typed) {
    var status = getRequestStatus(request);
    if (status == Status.INVALID) {
        console.error("Canon.exec: Invalid parameter(s) passed to " +
                            command.name);
        return false;
    }

    // If the request isn't complete yet, try to complete it.
    if (status == Status.INCOMPLETE) {
        // Check if the sender has a ArgsProvider, otherwise use the default
        // build in one.
        var argsProvider;
        var senderObj = env[sender];
        if (!senderObj || !senderObj.getArgsProvider ||
            !(argsProvider = senderObj.getArgsProvider()))
        {
            argsProvider = defaultArgsProvider;
        }

        // Ask the paramProvider to complete the request.
        argsProvider(request, function() {
            if (getRequestStatus(request) == Status.VALID) {
                exec(command, env, sender, request.args, typed);
            }
        });
        return true;
    }

    exec(command, env, sender, args, typed);
    return true;
}

/**
 * Entry point for keyboard accelerators or anything else that wants to execute
 * a command. A new request object is created and a check performed, if the
 * passed in arguments are VALID/INVALID or INCOMPLETE. If they are INCOMPLETE
 * the ArgumentProvider on the sender is called or otherwise the default
 * ArgumentProvider to get the still required arguments.
 * If they are valid (or valid after the ArgumentProvider is done), the command
 * is executed.
 *
 * @param command Either a command, or the name of one
 * @param env     Current environment to execute the command in
 * @param sender  String that should be the same as the senderObject stored on
 *                the environment in env[sender]
 * @param args    Arguments for the command
 * @param typed   (Optional)
 */
function exec(command, env, sender, args, typed) {
    if (typeof command === 'string') {
        command = commands[command];
    }
    if (!command) {
        // TODO: Should we complain more than returning false?
        return false;
    }

    args = args || {};
    cacheEnv = env;
    cacheRequest = new Request({
        sender: sender,
        command: command,
        args: args,
        typed: typed
    });

    try {
        if (command.functional) {
            var argValues = Object.keys(args).map(function(key) {
                return args[key];
            });
            var context = command.context || command;
            command.exec.apply(context, argValues);
        }
        else {
            command.exec(env, args, cacheRequest);
        }
    }
    catch (ex) {
        cacheRequest.doneWithError(ex);
    }

    cacheRequest = null;
    cacheEnv = null;

    return true;
}

exports.removeCommand = removeCommand;
exports.removeCommands = removeCommands;
exports.addCommand = addCommand;
exports.addCommands = addCommands;
exports.getCommand = getCommand;
exports.getCommands = getCommands;
exports.getCommandNames = getCommandNames;
exports.exec = exec;
exports.getRequest = getRequest;
exports.getEnvironment = getEnvironment;


/**
 * We publish a 'output' event whenever new command begins output
 * TODO: make this more obvious
 */
oop.implement(exports, EventEmitter);


/**
 * Current requirements are around displaying the command line, and provision
 * of a 'history' command and cursor up|down navigation of history.
 * <p>Future requirements could include:
 * <ul>
 * <li>Multiple command lines
 * <li>The ability to recall key presses (i.e. requests with no output) which
 * will likely be needed for macro recording or similar
 * <li>The ability to store the command history either on the server or in the
 * browser local storage.
 * </ul>
 * <p>The execute() command doesn't really live here, except as part of that
 * last future requirement, and because it doesn't really have anywhere else to
 * live.
 */

/**
 * The array of requests that wish to announce their presence
 */
var requests = [];

/**
 * How many requests do we store?
 */
var maxRequestLength = 100;

/**
 * To create an invocation, you need to do something like this (all the ctor
 * args are optional):
 * <pre>
 * var request = new Request({
 *     command: command,
 *     args: args,
 *     typed: typed
 * });
 * </pre>
 * @constructor
 */
function Request(options) {
    options = options || {};

    // Will be used in the keyboard case and the cli case
    this.command = options.command;

    // Will be used only in the cli case
    this.args = options.args;
    this.typed = options.typed;

    // Have we been initialized?
    this._begunOutput = false;

    this.start = new Date();
    this.end = null;
    this.completed = false;
    this.error = false;
};

oop.implement(Request.prototype, EventEmitter);

/**
 * Lazy init to register with the history should only be done on output.
 * init() is expensive, and won't be used in the majority of cases
 */
Request.prototype._beginOutput = function() {
    this._begunOutput = true;
    this.outputs = [];

    requests.push(this);
    // This could probably be optimized with some maths, but 99.99% of the
    // time we will only be off by one, and I'm feeling lazy.
    while (requests.length > maxRequestLength) {
        requests.shiftObject();
    }

    exports._dispatchEvent('output', { requests: requests, request: this });
};

/**
 * Sugar for:
 * <pre>request.error = true; request.done(output);</pre>
 */
Request.prototype.doneWithError = function(content) {
    this.error = true;
    this.done(content);
};

/**
 * Declares that this function will not be automatically done when
 * the command exits
 */
Request.prototype.async = function() {
    if (!this._begunOutput) {
        this._beginOutput();
    }
};

/**
 * Complete the currently executing command with successful output.
 * @param output Either DOM node, an SproutCore element or something that
 * can be used in the content of a DIV to create a DOM node.
 */
Request.prototype.output = function(content) {
    if (!this._begunOutput) {
        this._beginOutput();
    }

    if (typeof content !== 'string' && !(content instanceof Node)) {
        content = content.toString();
    }

    this.outputs.push(content);
    this._dispatchEvent('output', {});

    return this;
};

/**
 * All commands that do output must call this to indicate that the command
 * has finished execution.
 */
Request.prototype.done = function(content) {
    if (content) {
        this.output(content);
    }

    // Ensure we only signal completion once.
    if (!this.completed) {
        this.completed = true;
        this.end = new Date();
        this.duration = this.end.getTime() - this.start.getTime();

        this._dispatchEvent('output', {});
    }
};
exports.Request = Request;


});

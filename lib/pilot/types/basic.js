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
 *      Joe Walker (jwalker@mozilla.com)
 *      Kevin Dangoor (kdangoor@mozilla.com)
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
var types = require("pilot/types");
var Type = types.Type;
var Conversion = types.Conversion;
var Status = types.Status;

var ArrayArgument = require('pilot/argument').ArrayArgument;

/**
 * These are the basic types that we accept. They are vaguely based on the
 * Jetpack settings system (https://wiki.mozilla.org/Labs/Jetpack/JEP/24)
 * although clearly more restricted.
 *
 * <p>In addition to these types, Jetpack also accepts range, member, password
 * that we are thinking of adding.
 *
 * <p>This module probably should not be accessed directly, but instead used
 * through types.js
 */

/**
 * 'text' the most basic string type that doesn't need to convert
 */
function TextType(typeSpec) {
    if (typeSpec != null) {
        throw new Error('TextType can not be customized');
    }
}

oop.inherits(TextType, Type);

TextType.prototype.stringify = function(value) {
    if (value == null) {
        return '';
    }
    return value.toString();
};

TextType.prototype.parse = function(arg) {
    return new Conversion(arg.text, arg);
};

TextType.prototype.name = 'text';

exports.TextType = TextType;


/**
 * We don't currently plan to distinguish between integers and floats
 */
function NumberType(typeSpec) {
    if (typeSpec) {
        this.min = typeSpec.min;
        this.max = typeSpec.max;
        this.step = typeSpec.step;
    }
}

oop.inherits(NumberType, Type);

NumberType.prototype.stringify = function(value) {
    if (!value) {
        return '';
    }
    return '' + value;
};

NumberType.prototype.parse = function(arg) {
    if (arg.text.replace(/\s/g, '').length === 0) {
        return new Conversion(null, arg, Status.INCOMPLETE, '');
    }

    var value = parseInt(arg.text, 10);
    if (isNaN(value)) {
        return new Conversion(value, arg, Status.ERROR,
            'Can\'t convert "' + arg.text + '" to a number.');
    }

    if (this.max != null && value > this.max) {
        return new Conversion(value, arg, Status.ERROR,
            '' + value + ' is greater that maximum allowed: ' + this.max + '.');
    }

    if (this.min != null && value > this.min) {
        return new Conversion(value, arg, Status.ERROR,
            '' + value + ' is smaller that minimum allowed: ' + this.max + '.');
    }

    return new Conversion(value, arg);
};

NumberType.prototype.decrement = function(value) {
    return (this.min != null || value - 1 >= this.min) ? value - 1 : value;
};

NumberType.prototype.increment = function(value) {
    return (this.max != null || value - 1 <= this.max) ? value + 1 : value;
};

NumberType.prototype.name = 'number';

exports.NumberType = NumberType;


/**
 * One of a known set of options
 */
function SelectionType(typeSpec) {
    if (!Array.isArray(typeSpec.data) && typeof typeSpec.data !== 'function') {
        throw new Error('instances of SelectionType need typeSpec.data to be an array or function that returns an array:' + JSON.stringify(typeSpec));
    }
    Object.keys(typeSpec).forEach(function(key) {
        this[key] = typeSpec[key];
    }, this);
};

oop.inherits(SelectionType, Type);

SelectionType.prototype.stringify = function(value) {
    return typeof value === 'string' ? value : value.name;
};

SelectionType.prototype.getData = function() {
    return typeof(this.data) === 'function' ? this.data() : this.data;
};

SelectionType.prototype.parse = function(arg) {
    // The matchedValue could be the boolean value false
    var hasMatched = false;
    var matchedValue;
    var completions = [];
    this.getData().forEach(function(option) {
        var name = (typeof option === 'string') ? option : option.name;
        if (arg.text == name) {
            matchedValue = option;
            hasMatched = true;
        }
        else if (name.indexOf(arg.text) === 0) {
            completions.push(option);
        }
    }, this);

    if (hasMatched) {
        return new Conversion(matchedValue, arg);
    }
    else {
        // This is something of a hack it basically allows us to tell the
        // setting type to forget its last setting hack.
        if (this.noMatch) {
            this.noMatch();
        }

        if (completions.length > 0) {
            return new Conversion(null, arg, Status.INCOMPLETE, '', completions);
        }
        else {
            var msg = 'Can\'t use \'' + arg.text + '\'.';
            return new Conversion(null, arg, Status.ERROR, msg, completions);
        }
    }
};

SelectionType.prototype.fromString = function(str) {
    return str;
};

SelectionType.prototype.decrement = function(value) {
    var data = (typeof this.data === 'function') ? this.data() : this.data;
    var index;
    if (value == null) {
        index = data.length - 1;
    }
    else {
        var name = this.stringify(value);
        var index = data.indexOf(name);
        index = (index === 0 ? data.length - 1 : index - 1);
    }
    return this.fromString(data[index]);
};

SelectionType.prototype.increment = function(value) {
    var data = (typeof this.data === 'function') ? this.data() : this.data;
    var index;
    if (value == null) {
        index = 0;
    }
    else {
        var name = this.stringify(value);
        var index = data.indexOf(name);
        index = (index === data.length - 1 ? 0 : index + 1);
    }
    return this.fromString(data[index]);
};

SelectionType.prototype.name = 'selection';

exports.SelectionType = SelectionType;


/**
 * true/false values
 */
function BooleanType(typeSpec) {
    if (typeSpec != null) {
        throw new Error('TextType can not be customized');
    }
}

oop.inherits(BooleanType, SelectionType);

BooleanType.prototype.data = [ 'true', 'false' ];

BooleanType.prototype.stringify = function(value) {
    return '' + value;
};

BooleanType.prototype.fromString = function(str) {
    return str === 'true' ? true : false;
};

BooleanType.prototype.name = 'bool';

exports.BooleanType = BooleanType;


/**
 * A we don't know right now, but hope to soon.
 */
function DeferredType(typeSpec) {
    if (typeof typeSpec.defer !== 'function') {
        throw new Error('Instances of DeferredType need typeSpec.defer to be a function that returns a type');
    }
    Object.keys(typeSpec).forEach(function(key) {
        this[key] = typeSpec[key];
    }, this);
};

oop.inherits(DeferredType, Type);

DeferredType.prototype.stringify = function(value) {
    return this.defer().stringify(value);
};

DeferredType.prototype.parse = function(arg) {
    return this.defer().parse(arg);
};

DeferredType.prototype.decrement = function(value) {
    var deferred = this.defer();
    return (deferred.decrement ? deferred.decrement(value) : undefined);
};

DeferredType.prototype.increment = function(value) {
    var deferred = this.defer();
    return (deferred.increment ? deferred.increment(value) : undefined);
};

DeferredType.prototype.increment = function(value) {
    var deferred = this.defer();
    return (deferred.increment ? deferred.increment(value) : undefined);
};

DeferredType.prototype.name = 'deferred';

exports.DeferredType = DeferredType;


/**
 * 'blank' is a type for use with DeferredType when we don't know yet.
 * It should not be used anywhere else.
 */
function BlankType(typeSpec) {
    if (typeSpec != null) {
        throw new Error('BlankType can not be customized');
    }
}

oop.inherits(BlankType, Type);

BlankType.prototype.stringify = function(value) {
    return '';
};

BlankType.prototype.parse = function(arg) {
    return new Conversion(null, arg);
};

BlankType.prototype.name = 'blank';

exports.BlankType = BlankType;


/**
 * A set of objects of the same type
 */
function ArrayType(typeSpec) {
    if (!typeSpec.subtype) {
        console.error('Array.typeSpec is missing subtype. Assuming text.' +
            JSON.stringify(typeSpec));
        typeSpec.subtype = 'text';
    }

    Object.keys(typeSpec).forEach(function(key) {
        this[key] = typeSpec[key];
    }, this);
    this.subtype = types.getType(this.subtype);
};

oop.inherits(ArrayType, Type);

ArrayType.prototype.stringify = function(values) {
    // TODO: Check for strings with spaces and add quotes
    return values.join(' ');
};

ArrayType.prototype.parse = function(arg) {
    if (arg instanceof ArrayArgument) {
        // TODO: This is wrong - we're returning an array from parse
        return arg.value.map(function(subvalue) {
            this.subtype.parse(subvalue);
        }, this);
    }
    else {
        console.warn('Are we expecting ArrayType.parse to get non ArrayArguments?');
        return this.subtype.parse(arg);
    }
};

ArrayType.prototype.name = 'array';

exports.ArrayType = ArrayType;


/**
 * Registration and de-registration.
 */
exports.startup = function() {
    types.registerType(TextType);
    types.registerType(NumberType);
    types.registerType(BooleanType);
    types.registerType(BlankType);
    types.registerType(SelectionType);
    types.registerType(DeferredType);
    types.registerType(ArrayType);
};

exports.shutdown = function() {
    types.unregisterType(TextType);
    types.unregisterType(NumberType);
    types.unregisterType(BooleanType);
    types.unregisterType(BlankType);
    types.unregisterType(SelectionType);
    types.unregisterType(DeferredType);
    types.unregisterType(ArrayType);
};


});

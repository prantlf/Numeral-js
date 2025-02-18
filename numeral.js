/*jshint quotmark:false*/
/*globals window*/

(function () {
  "use strict";

  var hasModule = (typeof module !== 'undefined' && module.exports);
  var languages = {
    en: {
      delimiters: {
        thousands: ',',
        decimal: '.'
      },
      abbreviations: {
        thousand: 'k',
        million: 'm',
        billion: 'b',
        trillion: 't'
      },
      ordinal: function (number) {
        var b = number % 10;
        return (~~(number % 100 / 10) === 1) ? 'th' :
          (b === 1) ? 'st' :
            (b === 2) ? 'nd' :
              (b === 3) ? 'rd' : 'th';
      },
      currency: {
        symbol: '$'
      }
    }
  };

  /**
   * Computes the multiplier necessary to make x >= 1,
   * effectively eliminating miscalculations caused by
   * finite precision.
   */
  function multiplier(x) {
    var parts = x.toString().split('.');
    if (parts.length < 2) {
      return 1;
    }
    return Math.pow(10, parts[1].length);
  }

  /**
   * Given a variable number of arguments, returns the maximum
   * multiplier that must be used to normalize an operation involving
   * all of them.
   */
  function correctionFactor() {
    var args = Array.prototype.slice.call(arguments);
    return args.reduce(function (prev, next) {
      var mp = multiplier(prev),
        mn = multiplier(next);
      return mp > mn ? mp : mn;
    }, -Infinity);
  }

  // determine what type of formatting we need to do
  function formatNumeral(n, format, roundingFunction) {
    var output;

    // figure out what kind of format we are dealing with
    if (format.indexOf('$') > -1) { // currency!!!!!
      output = formatCurrency(n, format, roundingFunction);
    } else if (format.indexOf('%') > -1) { // percentage
      output = formatPercentage(n, format, roundingFunction);
    } else if (format.indexOf(':') > -1) { // time
      output = formatTime(n, format);
    } else { // plain ol' numbers or bytes
      output = formatNumber(n, n._value, format, roundingFunction);
    }

    // return string
    return output;
  }

  // revert to number
  function unformatNumeral(n, string) {
    var stringOriginal = string,
      thousandRegExp,
      millionRegExp,
      billionRegExp,
      trillionRegExp,
      suffixes = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
      bytesMultiplier = false,
      power;
    if (string.indexOf(':') > -1) {
      n._value = unformatTime(string);
    } else {
      if (string === n.state.zeroFormat) {
        n._value = 0;
      } else {
        if (languages[n.state.language].delimiters.decimal !== '.') {
          string = string.replace(/\./g, '').replace(languages[n.state.language].delimiters.decimal, '.');
        }

        // see if abbreviations are there so that we can multiply to the correct number
        thousandRegExp =
          new RegExp('[^a-zA-Z]' + languages[n.state.language].abbreviations.thousand + '(?:\\)|(\\' + languages[n.state.language].currency.symbol + ')?(?:\\))?)?$');
        millionRegExp =
          new RegExp('[^a-zA-Z]' + languages[n.state.language].abbreviations.million + '(?:\\)|(\\' + languages[n.state.language].currency.symbol + ')?(?:\\))?)?$');
        billionRegExp =
          new RegExp('[^a-zA-Z]' + languages[n.state.language].abbreviations.billion + '(?:\\)|(\\' + languages[n.state.language].currency.symbol + ')?(?:\\))?)?$');
        trillionRegExp =
          new RegExp('[^a-zA-Z]' + languages[n.state.language].abbreviations.trillion + '(?:\\)|(\\' + languages[n.state.language].currency.symbol + ')?(?:\\))?)?$');

        // see if bytes are there so that we can multiply to the correct number
        for (power = 0; power <= suffixes.length; power++) {
          bytesMultiplier = (string.indexOf(suffixes[power]) > -1) ? Math.pow(1024, power + 1) : false;

          if (bytesMultiplier) {
            break;
          }
        }

        // do some math to create our number
        n._value =
          ((bytesMultiplier) ? bytesMultiplier : 1) * ((stringOriginal.match(thousandRegExp)) ? Math.pow(10, 3) : 1) * ((stringOriginal.match(millionRegExp)) ? Math.pow(10, 6) : 1) * ((stringOriginal.match(billionRegExp)) ? Math.pow(10, 9) : 1) * ((stringOriginal.match(trillionRegExp)) ? Math.pow(10, 12) : 1) * ((string.indexOf('%') > -1) ? 0.01 : 1) * (((string.split('-').length + Math.min(string.split('(').length - 1, string.split(')').length - 1)) % 2) ? 1 : -1) * Number(string.replace(/[^0-9\.]+/g, ''));

        // round if we are talking about bytes
        n._value = (bytesMultiplier) ? Math.ceil(n._value) : n._value;
      }
    }
    return n._value;
  }

  function formatCurrency(n, format, roundingFunction) {
    var symbolIndex = format.indexOf('$'),
      openParenIndex = format.indexOf('('),
      minusSignIndex = format.indexOf('-'),
      space = '',
      spliceIndex,
      output;

    // check for space before or after currency
    if (format.indexOf(' $') > -1) {
      space = ' ';
      format = format.replace(' $', '');
    } else if (format.indexOf('$ ') > -1) {
      space = ' ';
      format = format.replace('$ ', '');
    } else {
      format = format.replace('$', '');
    }

    // format the number
    output = formatNumber(n, n._value, format, roundingFunction);

    // position the symbol
    if (symbolIndex <= 1) {
      if (output.indexOf('(') > -1 || output.indexOf('-') > -1) {
        output = output.split('');
        spliceIndex = 1;
        if (symbolIndex < openParenIndex || symbolIndex < minusSignIndex) {
          // the symbol appears before the "(" or "-"
          spliceIndex = 0;
        }
        output.splice(spliceIndex, 0, languages[n.state.language].currency.symbol + space);
        output = output.join('');
      } else {
        output = languages[n.state.language].currency.symbol + space + output;
      }
    } else {
      if (output.indexOf(')') > -1) {
        output = output.split('');
        output.splice(-1, 0, space + languages[n.state.language].currency.symbol);
        output = output.join('');
      } else {
        output = output + space + languages[n.state.language].currency.symbol;
      }
    }

    return output;
  }

  function formatPercentage(n, format, roundingFunction) {
    var space = '',
      output,
      value = n._value * 100;

    // check for space before %
    if (format.indexOf(' %') > -1) {
      space = ' ';
      format = format.replace(' %', '');
    } else {
      format = format.replace('%', '');
    }

    output = formatNumber(n, value, format, roundingFunction);

    if (output.indexOf(')') > -1) {
      output = output.split('');
      output.splice(-1, 0, space + '%');
      output = output.join('');
    } else {
      output = output + space + '%';
    }

    return output;
  }

  function formatTime(n) {
    var hours = Math.floor(n._value / 60 / 60),
      minutes = Math.floor((n._value - (hours * 60 * 60)) / 60),
      seconds = Math.round(n._value - (hours * 60 * 60) - (minutes * 60));
    return hours + ':' + ((minutes < 10) ? '0' + minutes : minutes) + ':' + ((seconds < 10) ? '0' + seconds : seconds);
  }

  function unformatTime(string) {
    var timeArray = string.split(':'),
      seconds = 0;
    // turn hours and minutes into seconds and add them all up
    if (timeArray.length === 3) {
      // hours
      seconds = seconds + (Number(timeArray[0]) * 60 * 60);
      // minutes
      seconds = seconds + (Number(timeArray[1]) * 60);
      // seconds
      seconds = seconds + Number(timeArray[2]);
    } else if (timeArray.length === 2) {
      // minutes
      seconds = seconds + (Number(timeArray[0]) * 60);
      // seconds
      seconds = seconds + Number(timeArray[1]);
    }
    return Number(seconds);
  }

  /**
   * Implementation of toFixed() that treats floats more like decimals
   *
   * Fixes binary rounding issues (eg. (0.615).toFixed(2) === '0.61') that present
   * problems for accounting- and finance-related software.
   */
  function toFixed(value, precision, roundingFunction, optionals) {
    var power = Math.pow(10, precision),
      optionalsRegExp,
      output;

    //roundingFunction = (roundingFunction !== undefined ? roundingFunction : Math.round);
    // Multiply up by precision, round accurately, then divide and use native toFixed():
    output = (roundingFunction(value * power) / power).toFixed(precision);

    if (optionals) {
      optionalsRegExp = new RegExp('0{1,' + optionals + '}$');
      output = output.replace(optionalsRegExp, '');
    }

    return output;
  }

  function formatNumber(n, value, format, roundingFunction) {
    var negP = false,
      signed = false,
      optDec = false,
      abbr = '',
      abbrK = false, // force abbreviation to thousands
      abbrM = false, // force abbreviation to millions
      abbrB = false, // force abbreviation to billions
      abbrT = false, // force abbreviation to trillions
      abbrForce = false, // force abbreviation
      bytes = '',
      ord = '',
      abs = Math.abs(value),
      suffixes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
      min,
      max,
      power,
      w,
      precision,
      thousands,
      d = '',
      neg = false;

    // check if number is zero and a custom zero format has been set
    if (value === 0 && n.state.zeroFormat !== null) {
      return n.state.zeroFormat;
    } else {
      // see if we should use parentheses for negative number or if we should prefix with a sign
      // if both are present we default to parentheses
      if (format.indexOf('(') > -1) {
        negP = true;
        format = format.slice(1, -1);
      } else if (format.indexOf('+') > -1) {
        signed = true;
        format = format.replace(/\+/g, '');
      }

      // see if abbreviation is wanted
      if (format.indexOf('a') > -1) {
        // check if abbreviation is specified
        abbrK = format.indexOf('aK') >= 0;
        abbrM = format.indexOf('aM') >= 0;
        abbrB = format.indexOf('aB') >= 0;
        abbrT = format.indexOf('aT') >= 0;
        abbrForce = abbrK || abbrM || abbrB || abbrT;

        // check for space before abbreviation
        if (format.indexOf(' a') > -1) {
          abbr = ' ';
          format = format.replace(' a', '');
        } else {
          format = format.replace('a', '');
        }

        if (abs >= Math.pow(10, 12) && !abbrForce || abbrT) {
          // trillion
          abbr = abbr + languages[n.state.language].abbreviations.trillion;
          value = value / Math.pow(10, 12);
        } else if (abs < Math.pow(10, 12) && abs >= Math.pow(10, 9) && !abbrForce || abbrB) {
          // billion
          abbr = abbr + languages[n.state.language].abbreviations.billion;
          value = value / Math.pow(10, 9);
        } else if (abs < Math.pow(10, 9) && abs >= Math.pow(10, 6) && !abbrForce || abbrM) {
          // million
          abbr = abbr + languages[n.state.language].abbreviations.million;
          value = value / Math.pow(10, 6);
        } else if (abs < Math.pow(10, 6) && abs >= Math.pow(10, 3) && !abbrForce || abbrK) {
          // thousand
          abbr = abbr + languages[n.state.language].abbreviations.thousand;
          value = value / Math.pow(10, 3);
        }
      }

      // see if we are formatting bytes
      if (format.indexOf('b') > -1) {
        // check for space before
        if (format.indexOf(' b') > -1) {
          bytes = ' ';
          format = format.replace(' b', '');
        } else {
          format = format.replace('b', '');
        }

        for (power = 0; power <= suffixes.length; power++) {
          min = Math.pow(1024, power);
          max = Math.pow(1024, power + 1);

          if (value >= min && value < max) {
            bytes = bytes + suffixes[power];
            if (min > 0) {
              value = value / min;
            }
            break;
          }
        }
      }

      // see if ordinal is wanted
      if (format.indexOf('o') > -1) {
        // check for space before
        if (format.indexOf(' o') > -1) {
          ord = ' ';
          format = format.replace(' o', '');
        } else {
          format = format.replace('o', '');
        }

        ord = ord + languages[n.state.language].ordinal(value);
      }

      if (format.indexOf('[.]') > -1) {
        optDec = true;
        format = format.replace('[.]', '.');
      }

      w = value.toString().split('.')[0];
      precision = format.split('.')[1];
      thousands = format.indexOf(',');

      if (precision) {
        if (precision.indexOf('[') > -1) {
          precision = precision.replace(']', '');
          precision = precision.split('[');
          d = toFixed(value, (precision[0].length + precision[1].length), roundingFunction, precision[1].length);
        } else {
          d = toFixed(value, precision.length, roundingFunction);
        }

        w = d.split('.')[0];

        if (d.split('.')[1].length) {
          d = languages[n.state.language].delimiters.decimal + d.split('.')[1];
        } else {
          d = '';
        }

        if (optDec && Number(d.slice(1)) === 0) {
          d = '';
        }
      } else {
        w = toFixed(value, null, roundingFunction);
      }

      // format number
      if (w.indexOf('-') > -1) {
        w = w.slice(1);
        neg = true;
      }

      if (thousands > -1) {
        w = w.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + languages[n.state.language].delimiters.thousands);
      }

      if (format.indexOf('.') === 0) {
        w = '';
      }

      return ((negP && neg) ? '(' : '') + ((!negP && neg) ? '-' : '') + ((!neg && signed) ? '+' : '') + w + d + ((ord) ? ord : '') + ((abbr) ? abbr : '') + ((bytes) ? bytes : '') + ((negP && neg) ? ')' : '');
    }
  }

  var _numeral = {
    type: "numeral",
    language: function (key, values) {
      if (!key) {
        return this.state.language;
      } else if (key && !values) {
        if (!languages[key]) {
          throw new Error('Unknown language : ' + key);
        }
        this.state.language = key;
      }
      if (values || !languages[key]) {
        languages[key] = values;
      }

      return this;
    },
    clone: function () {
      return numeral(this);
      //return createNumeral(this.state);
    },

    format: function (inputString, roundingFunction) {
      var self = this;
      return formatNumeral(this,
        inputString ? inputString : self.state.defaultFormat,
        (roundingFunction !== undefined) ? roundingFunction : Math.round
      );
    },

    unformat: function (inputString) {
      if (Object.prototype.toString.call(inputString) === '[object Number]') {
        return inputString;
      }
      return unformatNumeral(this, inputString ? inputString : this.state.defaultFormat);
    },

    value: function () {
      return this._value;
    },

    valueOf: function () {
      return this._value;
    },

    set: function (value) {
      this._value = Number(value);
      return this;
    },

    add: function (value) {
      var corrFactor = correctionFactor.call(null, this._value, value);

      function cback(accum, curr, currI, O) {
        return accum + corrFactor * curr;
      }

      this._value = [this._value, value].reduce(cback, 0) / corrFactor;
      return this;
    },

    subtract: function (value) {
      var corrFactor = correctionFactor.call(null, this._value, value);

      function cback(accum, curr, currI, O) {
        return accum - corrFactor * curr;
      }

      this._value = [value].reduce(cback, this._value * corrFactor) / corrFactor;
      return this;
    },

    multiply: function (value) {
      function cback(accum, curr, currI, O) {
        var corrFactor = correctionFactor(accum, curr);
        return (accum * corrFactor) * (curr * corrFactor) /
          (corrFactor * corrFactor);
      }

      this._value = [this._value, value].reduce(cback, 1);
      return this;
    },

    divide: function (value) {
      function cback(accum, curr, currI, O) {
        var corrFactor = correctionFactor(accum, curr);
        return (accum * corrFactor) / (curr * corrFactor);
      }

      this._value = [this._value, value].reduce(cback);
      return this;
    },

    difference: function (value) {
      return Math.abs(numeral(this._value).subtract(value).value());
    },

    languageData: function languageData(key) {
      if (!key) {
        return languages[this.state.language];
      }

      if (!languages[key]) {
        throw new Error('Unknown language : ' + key);
      }

      return languages[key];
    },

    isNumeral: function (obj) {
      return !!(obj && obj.type && obj.type === "numeral");
    },

    createInstance: createNumeral,

    zeroFormat: function (format) {
      this.state.zeroFormat = typeof(format) === 'string' ? format : null;
    },

    defaultFormat: function (format) {
      this.state.defaultFormat = typeof(format) === 'string' ? format : '0.0';
    }

  };

  function createNumeral(state) {
    var numeral = function (input) {
      var __numeral = {};
      Object.keys(_numeral).forEach(function (key) {
        __numeral[key] = _numeral[key];
      });
      __numeral.state = {};
      Object.keys(numeral.state).forEach(function (key) {
        __numeral.state[key] = numeral.state[key];
      });

      if (numeral.isNumeral(input)) {
        __numeral._value = Number(input.value());
      } else if (input === 0 || typeof input === 'undefined') {
        __numeral._value = 0;
      } else if (!Number(input)) {
        __numeral._value = Number(__numeral.unformat(input));
      } else {
        __numeral._value = input;
      }

      return __numeral;
    };

    numeral.state = { language: "en", defaultFormat: '0,0', zeroFormat: null };
    numeral.zeroFormat = _numeral.zeroFormat;
    numeral.defaultFormat = _numeral.defaultFormat;

    numeral.isNumeral = _numeral.isNumeral;
    numeral.language = _numeral.language;
    numeral.languageData = _numeral.languageData;
    numeral.createInstance = _numeral.createInstance;
    
    return numeral;
  }

  var numeral = createNumeral();

  /************************************
   Exposing Numeral
   ************************************/

  // CommonJS module is defined
  if (hasModule) {
    module.exports = numeral;
  }

  /*global ender:false */
  if (typeof ender === 'undefined') {
    // here, `this` means `window` in the browser, or `global` on the server
    // add `numeral` as a global object via a string identifier,
    // for Closure Compiler 'advanced' mode
    this['numeral'] = numeral;
  }

  /*global define:false */
  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return numeral;
    });
  }
}).call(this);

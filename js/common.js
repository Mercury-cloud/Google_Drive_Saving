// Copyright Jason Savard
// Becareful because this common.js file is loaded on websites for content_scripts and we don't want errors here
const ls = localStorage;
const locale = "default";

function customShowError(error) {
    if (typeof $ != "undefined") {
        $(document).ready(function() {
            $("body")
                .show()
                .removeAttr("hidden")
                .css("opacity", 1)
                .prepend( $("<div style='background:red;color:white;padding:5px;z-index:999'>").text(error) )
            ;
        });
    }
}

function displayUncaughtError(errorStr) {
    if (window.polymerPromise && window.polymerPromise.then) {
		polymerPromise.then(() => {
			if (window.showError) {
                // must catch errors here to prevent onerror loop
                showError(errorStr).catch(e => {
                    console.error(e);
                    customShowError(errorStr);
                });
			} else {
				customShowError(errorStr);
			}
		}).catch(error => {
			customShowError(errorStr);
		});
	} else {
		customShowError(errorStr);
	}
}

window.onerror = function(msg, url, line) {
	var thisUrl = removeOrigin(url).substr(1); // also remove beginning slash '/'
	var thisLine;
	if (line) {
		thisLine = " (" + line + ") ";
	} else {
		thisLine = " ";
	}
	var action = thisUrl + thisLine + msg;
	
	var errorStr = msg + " (" + thisUrl + " " + line + ")";

    displayUncaughtError(errorStr);
	
	//return false; // false prevents default error handling.
};

window.addEventListener('unhandledrejection', function (event) {
    const error = event.reason.stack ? event.reason.stack : event.reason;
    console.error("unhandledrejection", error);
    displayUncaughtError(error);
  
    // Prevent the default handling (error in console)
    //event.preventDefault();
});

// usage: [url] (optional, will use location.href by default)
function removeOrigin(url) {
	var linkObject;
	if (arguments.length && url) {
		try {
			linkObject = document.createElement('a');
			linkObject.href = url;
		} catch (e) {
			console.error("jerror: could not create link object: " + e);
		}
	} else {
		linkObject = location;
	}
	
	if (linkObject) {
		return linkObject.pathname + linkObject.search + linkObject.hash;
	} else {
		return url;
	}
}

function getUserIdentifier() {
	var attribute = "email";
	
	// seems it didn't exist sometimes!
	if (window) {
		var str;
		
		if (window[attribute]) {
			str = window[attribute];
		} else if (window.bg && window.bg[attribute]) {
			str = window.bg[attribute];
		}
		
		if (str) {
			str = str.split("@")[0].substr(0,3);
		}
		return str;
	}
}

function sendGAError(action) {
	// google analytics
	var JS_ERRORS_CATEGORY = "JS Errors";
	if (typeof sendGA != "undefined") {
		// only action (no label) so let's use useridentifier
		var userIdentifier = getUserIdentifier();
		if (arguments.length == 1 && userIdentifier) {
			sendGA(JS_ERRORS_CATEGORY, action, userIdentifier);
		} else {
			// transpose these arguments to sendga (but replace the 1st arg url with category ie. js errors)
			// use slice (instead of sPlice) because i want to clone array
			var argumentsArray = [].slice.call(arguments, 0);
			// transpose these arguments to sendGA
			var sendGAargs = [JS_ERRORS_CATEGORY].concat(argumentsArray);
			sendGA.apply(this, sendGAargs);
		}
	}
	//return false; // false prevents default error handling.
}

function logError(action) {
	// transpose these arguments to console.error
	// use slice (instead of sPlice) because i want to clone array
	var argumentsArray = [].slice.call(arguments, 0);
	// exception: usually 'this' is passed but instead its 'console' because console and log are host objects. Their behavior is implementation dependent, and to a large degree are not required to implement the semantics of ECMAScript.
	console.error.apply(console, argumentsArray);
	
	sendGAError.apply(this, arguments);
}

var DetectClient = {};
DetectClient.isChrome = function() {
	return /chrome/i.test(navigator.userAgent) && !DetectClient.isOpera();
}
DetectClient.isFirefox = function() {
	return /firefox/i.test(navigator.userAgent);
}
DetectClient.isEdge = function() {
	return /edg\//i.test(navigator.userAgent);
}
DetectClient.isWindows = function() {
	return /windows/i.test(navigator.userAgent);
}
DetectClient.isNewerWindows = function() {
	return navigator.userAgent.match(/Windows NT 1\d\./i) != null; // Windows NT 10+
}
DetectClient.isMac = function() {
	return /mac/i.test(navigator.userAgent);
}
DetectClient.isLinux = function() {
	return /linux/i.test(navigator.userAgent);
}
DetectClient.isOpera = function() {
	return /opr\//i.test(navigator.userAgent);
}
DetectClient.isRockMelt = function() {
	return /rockmelt/i.test(navigator.userAgent);
}
DetectClient.isChromeOS = function() {
	return /cros/i.test(navigator.userAgent);
}
DetectClient.getChromeChannel = function(callback) {
	fetchJSON("https://omahaproxy.appspot.com/all.json").then(data => {
		var versionDetected;
		var stableDetected = false;
		var stableVersion;

		for (var a=0; a<data.length; a++) {

			var osMatched = false;
			// patch because Chromebooks/Chrome OS has a platform value of "Linux i686" but it does say CrOS in the useragent so let's use that value
			if (DetectClient.isChromeOS()) {
				if (data[a].os == "cros") {
					osMatched = true;
				}
			} else { // the rest continue with general matching...
				if (navigator.userAgent.toLowerCase().includes(data[a].os)) {
					osMatched = true;
				}
			}
			
			if (osMatched) {
				for (var b = 0; b < data[a].versions.length; b++) {
					if (data[a].versions[b].channel == "stable") {
						stableVersion = data[a].versions[b];
					}
                    if (navigator.userAgent.includes(data[a].versions[b].previous_version)
                    || navigator.userAgent.includes(data[a].versions[b].version)) {
						// it's possible that the same version is for the same os is both beta and stable???
						versionDetected = data[a].versions[b];
						if (data[a].versions[b].channel == "stable") {
							stableDetected = true;
							callback(versionDetected);
							return;
						}
					}
				}

				var chromeVersionMatch = navigator.userAgent.match(/Chrome\/(\d+(.\d+)?(.\d+)?(.\d+)?)/i);
				if (chromeVersionMatch) {
					var currentVersionObj = parseVersionString(chromeVersionMatch[1]);
					var stableVersionObj = parseVersionString(stableVersion.previous_version);
					if (currentVersionObj.major < stableVersionObj.major) {
						resolve({ oldVersion: true, reason: "major diff" });
						return;
					} else if (currentVersionObj.major == stableVersionObj.major) {
						if (currentVersionObj.minor < stableVersionObj.minor) {
							resolve({ oldVersion: true, reason: "minor diff" });
							return;
						} else if (currentVersionObj.minor == stableVersionObj.minor) {
							/*
							if (currentVersionObj.patch < stableVersionObj.patch) {
								resolve({ oldVersion: true, reason: "patch diff" });
								return;
							}
							*/
							// commented above to ignore patch differences
							stableDetected = true;
							resolve(stableVersion);
							return;
						}
					}
				}				
			}
		}

		// probably an alternative based browser like RockMelt because I looped through all version and didn't find any match
		if (data.length && !versionDetected) {
			callback({channel:"alternative based browser"});
		} else {
			callback(versionDetected);
		}
	});
}

function getInternalPageProtocol() {
	var protocol;
	if (DetectClient.isFirefox()) {
		protocol = "moz-extension:";
	} else {
		protocol = "chrome-extension:";
	}
	return protocol;
}

function isInternalPage(url) {
	if (arguments.length == 0) {
		url = location.href;
	}
	return url && url.indexOf(getInternalPageProtocol()) == 0;
}

var ONE_SECOND = 1000;
var ONE_MINUTE = 60000;
var ONE_HOUR = ONE_MINUTE * 60;
var ONE_DAY = ONE_HOUR * 24;
var ORIGINS_MESSAGE_PREFIX = "origins_";
var origConsoleLog = null;
var origConsoleWarn = null;
var origConsoleDebug = null;
Calendar = function () {};
var calendarLang;

function seconds(seconds) {
	return seconds * ONE_SECOND;
}

function minutes(minutes) {
	return minutes * ONE_MINUTE;
}

function hours(hours) {
	return hours * ONE_HOUR;
}

function days(days) {
	return days * ONE_DAY;
}

function shallowClone(obj) {
    return Object.assign({}, obj);
}

// copy all the fields (not a clone, we are modifying the target so we don't lose a any previous pointer to it
function copyObj(sourceObj, targetObj) {
    for (var key in sourceObj) {        
    	targetObj[key] = sourceObj[key];
    }
}

if (typeof(jQuery) != "undefined") {
	jQuery.fn.exists = function(){return jQuery(this).length>0;}
	jQuery.fn.unhide = function() {
		this.removeAttr('hidden');
		return this;
	}
	jQuery.fn.hidden = function () {
		this.attr('hidden', true);
		return this;
	}
	var originalShow = jQuery.fn.show;
	jQuery.fn.show = function(duration, callback) {
		if (!duration){
			originalShow.apply(this, arguments);
			this.removeAttr('hidden');
		} else {
			var that = this;
			originalShow.apply(this, [duration, function() {
				that.removeAttr('hidden');
				if (callback){
					callback.call(that);
				}
			}]);
		}
		return this;
	};
	jQuery.fn.textNodes = function() {
		var ret = [];
	
		(function(el){
			if (!el) return;
			if ((el.nodeType == 3)||(el.nodeName =="BR"))
				ret.push(el);
			else
				for (var i=0; i < el.childNodes.length; ++i)
					arguments.callee(el.childNodes[i]);
		})(this[0]);
		return $(ret);
	}
	jQuery.fn.hasHorizontalScrollbar = function() {
	    var divnode = this[0];
	    if (divnode.scrollWidth > divnode.clientWidth) {
	        return true;
	    } else {
	    	return false;
	    }
	}
	
	jQuery.fn.hasVerticalScrollbar = function() {
	    var divnode = this[0];
	    if (divnode.scrollHeight > divnode.clientHeight) {
	        return true;
	    } else {
	    	return false;
	    }
	}
}

function removeHTML(html) {
   var tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return tmp.textContent||tmp.innerText;
}

function getMessage(messageID, args, localeMessages) {
	// if localeMessage null because english is being used and we haven't loaded the localeMessage
	if (!localeMessages) {
		try {
			localeMessages = chrome.extension.getBackgroundPage().localeMessages;
		} catch (e) {
			// might be in content_script and localMessages not defined because it's in english
			return chromeGetMessage(messageID, args);
		}				
	}
	if (localeMessages) {
		var messageObj = localeMessages[messageID];	
		if (messageObj) { // found in this language
			var str = messageObj.message;
			
			// patch: replace escaped $$ to just $ (because chromeGetMessage did it automatically)
			if (str) {
				str = str.replace(/\$\$/g, "$");
			}
			
			if (args) {
				if (args instanceof Array) {
					for (var a=0; a<args.length; a++) {
						str = str.replace("$" + (a+1), args[a]);
					}
				} else {
					str = str.replace("$1", args);
				}
			}
			return str;
		} else { // default to default language
			return chromeGetMessage(messageID, args);
		}
	} else {
		return chromeGetMessage(messageID, args);
	}
}

//patch: chrome.i18n.getMessage does pass parameter if it is a numeric - must be converted to str
function chromeGetMessage(messageID, args) {
	if (args && !isNaN(args)) {
		args = args + "";
	}
	return chrome.i18n.getMessage(messageID, args);
}

var dateFormat = function () {
	var	token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
		timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
		timezoneClip = /[^-+\dA-Z]/g,
		pad = function (val, len) {
			val = String(val);
			len = len || 2;
			while (val.length < len) val = "0" + val;
			return val;
		};

	// Regexes and supporting functions are cached through closure
	return function (date, mask, options) { //utc, forceEnglish
		if (!options) {
			options = {};
		}
		
		var dF = dateFormat;
		var i18n = options.forceEnglish ? dF.i18nEnglish : dF.i18n;

		// You can't provide utc if you skip other args (use the "UTC:" mask prefix)
		if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
			mask = date;
			date = undefined;
		}

		// Passing date through Date applies Date.parse, if necessary
		date = date ? new Date(date) : new Date;
		if (isNaN(date)) throw SyntaxError("invalid date");

		mask = String(dF.masks[mask] || mask || dF.masks["default"]);

		// Allow setting the utc argument via the mask
		if (mask.slice(0, 4) == "UTC:") {
			mask = mask.slice(4);
			options.utc = true;
		}

		var	_ = options.utc ? "getUTC" : "get",
			d = date[_ + "Date"](),
			D = date[_ + "Day"](),
			m = date[_ + "Month"](),
			y = date[_ + "FullYear"](),
			H = date[_ + "Hours"](),
			M = date[_ + "Minutes"](),
			s = date[_ + "Seconds"](),
			L = date[_ + "Milliseconds"](),
			o = options.utc ? 0 : date.getTimezoneOffset(),
			flags = {
				d:    d,
				dd:   pad(d),
				ddd:  i18n.dayNamesShort[D],
				dddd: i18n.dayNames[D],
				m:    m + 1,
				mm:   pad(m + 1),
				mmm:  i18n.monthNamesShort[m],
				mmmm: i18n.monthNames[m],
				yy:   String(y).slice(2),
				yyyy: y,
				h:    H % 12 || 12,
				hh:   pad(H % 12 || 12),
				H:    H,
				HH:   pad(H),
				M:    M,
				MM:   pad(M),
				s:    s,
				ss:   pad(s),
				l:    pad(L, 3),
				L:    pad(L > 99 ? Math.round(L / 10) : L),
				t:    H < 12 ? "a"  : "p",
				tt:   H < 12 ? "am" : "pm",
				T:    H < 12 ? "A"  : "P",
				TT:   H < 12 ? "AM" : "PM",
				Z:    options.utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
				o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
				S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
			};

		var ret = mask.replace(token, function ($0) {
			return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
		});

		if (options.noZeros) {
			ret = ret.replace(":00", "");
		}
		
		return ret;
	};
}();

// Some common format strings
dateFormat.masks = {
	"default":      "ddd mmm dd yyyy HH:MM:ss",
	shortDate:      "m/d/yy",
	mediumDate:     "mmm d, yyyy",
	longDate:       "mmmm d, yyyy",
	fullDate:       "dddd, mmmm d, yyyy",
	shortTime:      "h:MM TT",
	mediumTime:     "h:MM:ss TT",
	longTime:       "h:MM:ss TT Z",
	isoDate:        "yyyy-mm-dd",
	isoTime:        "HH:MM:ss",
	isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
	isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
dateFormat.i18n = {
	dayNamesShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
	monthNamesShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
	monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
};

dateFormat.i18nEnglish = shallowClone(dateFormat.i18n);
dateFormat.i18nCalendarLanguage = shallowClone(dateFormat.i18n);

function getDateFormatOptions() {
    return {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
    }
}

function getTimeFormatOptions() {
    return {
        hour: 'numeric',
        minute: 'numeric',
        //hour12: !twentyFourHour
    }
}

function getDateAndTimeFormatOptions() {
    return {...getDateFormatOptions(), ...getTimeFormatOptions()};
}

Object.defineProperty(Date.prototype, "toLocaleDateStringJ", {
    value: function () {
        return this.toLocaleDateString(locale, getDateFormatOptions());
    }
});

Object.defineProperty(Date.prototype, "toLocaleTimeStringJ", {
    value: function (removeTrailingZeroes) {
        let str = this.toLocaleTimeString(locale, getTimeFormatOptions());

        str = str.replace(" AM", "am");
        str = str.replace(" PM", "pm");

        if (removeTrailingZeroes && !twentyFourHour) {
			//str = str.replace(":00", "");
		}
        return str;
    }
});

Object.defineProperty(Date.prototype, "toLocaleStringJ", {
    value: function () {
        return this.toLocaleString(locale, getDateAndTimeFormatOptions());
    }
});

// For convenience...
Date.prototype.format = function (mask, options) {
	return dateFormat(this, mask, options);
};

function resetTime(date) {
    date.setHours(0, 0, 0, 0);
    return date;
}

class DateZeroTime extends Date {
    constructor(...dateFields) {
        super(...dateFields);
        resetTime(this);
    }
}

function today() {
	var offsetToday = localStorage["today"];
	if (offsetToday) {
		return new Date(offsetToday);
	} else {
		return new Date();
	}
}

function yesterday() {
	// could not use same variable name as function ie. var today = today();
	var yest = today();
	yest.setDate(yest.getDate()-1);
	return yest;
}

function tomorrow() {
	var tomorrow = today();
	tomorrow.setDate(tomorrow.getDate()+1);
	return tomorrow;
}

function isToday(date) {
	return date.getFullYear() == today().getFullYear() && date.getMonth() == today().getMonth() && date.getDate() == today().getDate();
}

function isTomorrow(date) {
	var tom = tomorrow();
	return date.getFullYear() == tom.getFullYear() && date.getMonth() == tom.getMonth() && date.getDate() == tom.getDate();
}

function isYesterday(date) {
	var yest = yesterday();
	return date.getFullYear() == yest.getFullYear() && date.getMonth() == yest.getMonth() && date.getDate() == yest.getDate();
}

Date.prototype.isToday = function () {
	return isToday(this);
};

Date.prototype.isTomorrow = function () {
	return isTomorrow(this);
};

Date.prototype.isYesterday = function () {
	return isYesterday(this);
};

Date.prototype.isSameDay = function (otherDay) {
	return this.getFullYear() == otherDay.getFullYear() && this.getMonth() == otherDay.getMonth() && this.getDate() == otherDay.getDate();
};

Date.prototype.isCurrentYear = function () {
	return this.getFullYear() == today().getFullYear();
};

Date.prototype.isBefore = function(otherDate) {
	var paramDate;
	if (otherDate) {
		paramDate = new Date(otherDate);
	} else {
		paramDate = today();
	}	
	var thisDate = new Date(this);
	return thisDate.getTime() < paramDate.getTime();
};

Date.prototype.isAfter = function(otherDate) {
	return !this.isBefore(otherDate) && this.getTime() != otherDate.getTime();
};

Date.prototype.diffInSeconds = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	var d2 = new Date(this);
	return (d2.getTime() - d1.getTime()) / ONE_SECOND;
};

Date.prototype.diffInMinutes = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	var d2 = new Date(this);
	return (d2.getTime() - d1.getTime()) / ONE_MINUTE;
};

Date.prototype.diffInHours = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	var d2 = new Date(this);
	return (d2.getTime() - d1.getTime()) / ONE_HOUR;
};

Date.prototype.diffInDays = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	d1.setHours(1);
	d1.setMinutes(1);
	var d2 = new Date(this);
	d2.setHours(1);
	d2.setMinutes(1);
	return (d2.getTime() - d1.getTime()) / ONE_DAY;
};

Date.prototype.addDays = function(days) {
	var newDate = today();
	newDate.setDate(newDate.getDate()+days);
	return newDate;
}

Date.prototype.subtractDays = function(days) {
	return this.addDays(days*-1);
}

Array.prototype.first = function() {
	return this[0];
};
Array.prototype.last = function() {
	return this[this.length-1];
};
Array.prototype.isEmpty = function() {
	return this.length == 0;
};
Array.prototype.find = function(func) {
	for (var i = 0, l = this.length; i < l; ++i) {
		var item = this[i];
		if (func(item))
			return item;
	}
	return null;
};
Array.prototype.swap = function (x,y) {
	var b = this[x];
	this[x] = this[y];
	this[y] = b;
	return this;
}

Array.prototype.addItem = function(key, value) {
	for (var i=0, l=this.length; i<l; ++i) {
		if (this[i].key == key) {
			// found key so update value
			this[i].value = value;
			return;
		}
	}
	this.push({key:key, value:value});
}
Array.prototype.getItem = function(key) {
	for (var i=0, l=this.length; i<l; ++i) {
		if (this[i].key == key) {			
			return this[i].value;
		}
	}
}

String.prototype.replaceAll = function(find, replace) {
	var findEscaped = escapeRegExp(find);
	return this.replace(new RegExp(findEscaped, 'g'), replace);
}

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

String.prototype.startsWith = function (str) {
	return this.indexOf(str) == 0;
};

String.prototype.endsWith = function (str){
	return this.slice(-str.length) == str;
};

String.prototype.equalsIgnoreCase = function(str) {
	if (this && str) {
		return this.toLowerCase() == str.toLowerCase();
	}
}

String.prototype.parseTime = function() {
	var d = new Date();
	var pieces = this.match(/(\d+)([:|\.](\d\d))\s*(p?)/i);
	if (pieces && pieces.length >= 5) {
		// patch: had to use parseFloat instead of parseInt (because parseInt would return 0 instead of 9 when parsing "09" ???		
		var hours = parseFloat(pieces[1]);
		var pm = pieces[4];
		
		// patch for midnight because 12:12am is actually 0 hours not 12 hours for the date object
		if (hours == 12) {
			if (pm) {
				hours = 12;
			} else {
				hours = 0;
			}
		} else if (pm) {
			hours += 12;
		}
		d.setHours(hours);		
		//d.setHours( parseFloat(pieces[1]) + ( ( parseFloat(pieces[1]) < 12 && pieces[4] ) ? 12 : 0) );
		d.setMinutes( parseFloat(pieces[3]) || 0 );
		d.setSeconds(0, 0);
		return d;
	}
}

String.prototype.parseDate = function() {
	/*
	// bug patch: it seems that new Date("2011-09-21") return 20th??? but if you use slashes instead ie. 2011/09/21 then it works :)
	if (this.length <= 10) {
		return new Date(Date.parse(this.replace("-", "/")));
	} else {
		return new Date(Date.parse(this));
	}
	*/
	var DATE_TIME_REGEX = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(\.\d+)?(\+|-)(\d\d):(\d\d)$/;
	var DATE_TIME_REGEX_Z = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.\d+Z$/;
	var DATE_TIME_REGEX_Z2 = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)+Z$/;
	var DATE_MILLI_REGEX = /^(\d\d\d\d)(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)$/;
	var DATE_REGEX = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
	var DATE_NOSPACES_REGEX = /^(\d\d\d\d)(\d\d)(\d\d)$/;

	/* Convert the incoming date into a javascript date
	 * 2012-09-26T11:42:00-04:00
	 * 2006-04-28T09:00:00.000-07:00
	 * 2006-04-28T09:00:00.000Z
	 * 2010-05-25T23:00:00Z (new one from jason)
	 * 2006-04-19
	 */

	  var parts = DATE_TIME_REGEX.exec(this);
	  
	  // Try out the Z version
	  if (!parts) {
	    parts = DATE_TIME_REGEX_Z.exec(this);
	  }
	  if (!parts) {
		parts = DATE_TIME_REGEX_Z2.exec(this);
	  }
	  
	  if (exists(parts) && parts.length > 0) {
	    var d = new Date();
	    d.setUTCFullYear(parts[1], parseInt(parts[2], 10) - 1, parts[3]);
	    d.setUTCHours(parts[4]);
	    d.setUTCMinutes(parts[5]);
	    d.setUTCSeconds(parts[6]);
		d.setUTCMilliseconds(0);

	    var tzOffsetFeedMin = 0;
	    if (parts.length > 8) {
	      tzOffsetFeedMin = parseInt(parts[9],10) * 60 + parseInt(parts[10],10);
	      if (parts[8] != '-') { // This is supposed to be backwards.
	        tzOffsetFeedMin = -tzOffsetFeedMin;
	      }
	    }
	    return new Date(d.getTime() + tzOffsetFeedMin * ONE_MINUTE);
	  }
	  
	  parts = DATE_MILLI_REGEX.exec(this);
	  if (exists(parts)) {
			var d = new Date();
			d.setFullYear(parts[1], parseInt(parts[2], 10) - 1, parts[3]);
		    d.setHours(parts[4]);
		    d.setMinutes(parts[5]);
		    d.setSeconds(parts[6]);
			d.setMilliseconds(0);
			return d;
	  }
	  if (!parts) {
		  parts = DATE_REGEX.exec(this);
	  }
	  if (!parts) {
		  parts = DATE_NOSPACES_REGEX.exec(this);
	  }
	  if (exists(parts) && parts.length > 0) {
	    return new Date(parts[1], parseInt(parts[2],10) - 1, parts[3]);
	  }
	  if (!isNaN(this)) {
		  return new Date(this);
	  }
	  return null;
}

function analytics() {
	if (DetectClient.isChrome()) {
		var ga = document.createElement('script');
		ga.src = '/js/analytics.js';
		document.head.appendChild(ga);
		
		$(document).ready(function() {
			$(document).on("click", "a, input, button", function() {
				var id = $(this).attr("ga");
				var label = null;
				if (id != "IGNORE") {
					if (!id) {
						id = $(this).attr("id");
					}
					if (!id) {
						id = $(this).attr("snoozeInMinutes");
						if (id) {
							label = "in minutes: " + id; 
							id = "snooze";
						}
						if (!id) {
							id = $(this).attr("snoozeInDays");
							if (id) {
								label = "in days: " + id; 
								id = "snooze";
							}
						}
						if (!id) {
							id = $(this).attr("msg");
						}
						if (!id) {
							id = $(this).attr("msgTitle");
						}
						if (!id) {
							id = $(this).attr("href");
							// don't log # so dismiss it
							if (id == "#") {
								id = null;
							}
						}
						if (id) {
							id = id.replace(/javascript\:/, "");
							// only semicolon so remove it and keep finding other ids
							if (id == ";") {
								id = "";
							}
						}
						if (!id) {
							id = $(this).parent().attr("id");
						}
						if (!id) {
							id = $(this).attr("class");
						}
					}
					if ($(this).attr("type") != "text") {
						if ($(this).attr("type") == "checkbox") {
							if (this.checked) {
								label = id + "_on";
							} else {
								label = id + "_off";
							}
						}
						var category = $(this).closest("*[gaCategory]");
						var action = null;
						// if gaCategory specified
						if (category.length != 0) {
							category = category.attr("gaCategory");
							action = id;
						} else {
							category = id;
							action = "click";
						}
						
						if (label != null) {
							sendGA(category, action, label);
						} else {
							sendGA(category, action);
						}
					}
				}
			});
		});		
	}
}

//usage: sendGA('category', 'action', 'label');
//usage: sendGA('category', 'action', 'label', value);  // value is a number.
//usage: sendGA('category', 'action', {'nonInteraction': 1});
function sendGA(category, action, label, etc) {
	console.log("%csendGA: " + category + " " + action + " " + label, "font-size:0.6em");

	// patch: seems arguments isn't really an array so let's create one from it
	var argumentsArray = [].splice.call(arguments, 0);

	var gaArgs = ['send', 'event'];
	// append other arguments
	gaArgs = gaArgs.concat(argumentsArray);
	
	// send to google
	if (window.ga) {
		ga.apply(this, gaArgs);
	}
}

// Console...
origConsoleLog = console.log;
origConsoleWarn = console.warn;
origConsoleDebug = console.debug;
initConsole();

if (typeof($) != "undefined") {
	$(document).ready(function() {
		// For some reason including scripts for popup window slows down popup window reaction time, so only found that settimeout would work
		if (document.location.href.match("popup.html")) {
			setTimeout(function() {
				analytics();
			}, 1000);
		} else {
			analytics();
		}				
		dateFormat.i18n.lang = calendarLang;
		initCalendarNames(dateFormat.i18n);
		initMessages();
	});
}

function log(str, prefName) {
	if (pref(prefName)) {
		console.log(str);
	}
}

function setStorage(storage, element, params) {
	if (($(element).closest("[mustDonate]").length || params.mustDonate) && !storage.get("donationClicked")) {
		params.event.preventDefault();
		
		openGenericDialog({
			title: getMessage("extraFeatures"),
			content: getMessage("extraFeaturesPopup1") + "<br>" + getMessage("extraFeaturesPopup2"),
			otherLabel: getMessage("contribute")
		}).then(function(response) {
			if (response != "ok") {
				location.href = "contribute.html?action=" + params.key;
			}
		});
		
		return false;
	} else {
		storage.set(params.key, params.value);
		return true;
	}
}

function initPaperElement(storage, $nodes, params) {
	params = initUndefinedObject(params);
	
	$nodes.each(function(index, element) {
		var $element = $(element);
		
		var key = $element.attr("storage");
		var permissions;
		if (DetectClient.isChrome()) {
			permissions = $element.attr("permissions");
		}
		
		// this "selected" attribute behaves weird with jQuery, the value gets sets to selected='selected' always, so we must use native .setAttibute
		if (key && key != "language") { // ignore lang because we use a specific logic inside the options.js
			if (element.nodeName.equalsIgnoreCase("paper-checkbox")) {
				$element.attr("checked", toBool(pref(key)));
			} else if (element.nodeName.equalsIgnoreCase("paper-listbox")) {
				element.setAttribute("selected", pref(key));
			} else if (element.nodeName.equalsIgnoreCase("paper-radio-group")) {
				element.setAttribute("selected", pref(key));
			} else if (element.nodeName.equalsIgnoreCase("paper-slider")) {
				element.setAttribute("value", pref(key));
			}
		} else if (permissions) {
			chrome.permissions.contains({permissions: [permissions]}, function(result) {
				$element.attr("checked", result);
			});
		}

		// need a 1ms pause or else setting the default above would trigger the change below?? - so make sure it is forgotten
		setTimeout(function() {
			
			var eventName;
			if (element.nodeName.equalsIgnoreCase("paper-checkbox")) {
				eventName = "change";
			} else if (element.nodeName.equalsIgnoreCase("paper-listbox")) {
				eventName = "iron-activate";
			} else if (element.nodeName.equalsIgnoreCase("paper-radio-group")) {
				eventName = "paper-radio-group-changed";
			} else if (element.nodeName.equalsIgnoreCase("paper-slider")) {
				eventName = "change";
			}
			
			$element.on(eventName, function(event) {
				if (key || params.key) {
					
					var value;
					if (element.nodeName.equalsIgnoreCase("paper-checkbox")) {
						value = element.checked;
					} else if (element.nodeName.equalsIgnoreCase("paper-listbox")) {
						value = event.originalEvent.detail.selected;
					} else if (element.nodeName.equalsIgnoreCase("paper-radio-group")) {
						value = element.selected;
					} else if (element.nodeName.equalsIgnoreCase("paper-slider")) {
						value = $element.attr("value");
					}

					var done;
					
					if (key) {
						done = setStorage(storage, $element, {event:event, key:key, value:value});
					} else if (params.key) {
						params.event = event;
						params.value = value;
						done = setStorage(storage, $element, params);
					}
					if (!done) {
						if (element.nodeName.equalsIgnoreCase("paper-checkbox")) {
							element.checked = !element.checked;
						} else if (element.nodeName.equalsIgnoreCase("paper-listbox")) {
							$element.closest("paper-dropdown-menu")[0].close();
						}
					}
				} else if (permissions) {
					if (element.checked) {
						chrome.permissions.request({permissions: [permissions]}, function(granted) {
							$element.attr("checked", granted);
						});
					} else {			
						chrome.permissions.remove({permissions: [permissions]}, function(removed) {
							if (removed) {
								$element.attr("checked", false);
							} else {
								// The permissions have not been removed (e.g., you tried to remove required permissions).
								$element.attr("checked", true);
								alert("These permissions could not be removed, they might be required!");
							}
						});
					}
				}
			});
		}, 500);
	});
}

function initOptions(storage) {
	initPaperElement(storage, $("[storage], [permissions]"));
}

function generateCheckPermissionsParams(checkbox) {
	var origins = $(checkbox).attr("origins");
	var permissions = $(checkbox).attr("permissions");
	var checkPermissionParams; 
	if (origins) {
		checkPermissionParams = {origins: [getMessage(ORIGINS_MESSAGE_PREFIX + origins)]}
	} else if (permissions) {
		checkPermissionParams = {permissions: [permissions]}
	}
	return checkPermissionParams;
}

// this wrapper method is required to keep the checkbox in scope with the callback
function checkPermissions(checkbox, callback) {
	var checkPermissionParams = generateCheckPermissionsParams(checkbox);
	chrome.permissions.contains(checkPermissionParams, function(result) {
		$(checkbox).prop("checked", result)
	});
}

function initConsole() {
	if (localStorage["console_messages"]) {
		/*
		 * was causing <exception> errors in latest chrome version
		chrome.extension.getBackgroundPage().console.log = console.log = origConsoleLog;
		chrome.extension.getBackgroundPage().console.warn = console.warn = origConsoleWarn;
		chrome.extension.getBackgroundPage().console.debug = console.debug = origConsoleDebug;
		*/
		console.log = origConsoleLog;
		console.warn = origConsoleWarn;
		console.debug = origConsoleDebug;
	} else {
		//chrome.extension.getBackgroundPage().console.log = chrome.extension.getBackgroundPage().console.warn = chrome.extension.getBackgroundPage().console.debug = console.warn = console.info = console.log = function(msg){};
	}
}

function initCalendarNames(obj) {
    const date = new DateZeroTime();
    const sunday = new DateZeroTime();
    sunday.setDate(sunday.getDate() - sunday.getDay()); // set to Sunday

    for (let a=0; a<7; a++) {
        date.setDate(sunday.getDate() + a);
        
        obj.dayNamesShort.push(date.toLocaleString(locale, {
            weekday: "short"
        }));

        obj.dayNames.push(date.toLocaleString(locale, {
            weekday: "long"
        }));
    }

    for (let a=0; a<12; a++) {
        date.setMonth(a);
        
        obj.monthNamesShort.push(date.toLocaleString(locale, {
            month: "short"
        }));

        obj.monthNames.push(date.toLocaleString(locale, {
            month: "long"
        }));
    }
}

function initMessages(selectorOrNode) {
	var $selector;
	if (selectorOrNode) {
		$selector = $(selectorOrNode);
	} else {
		$selector = $("*");
	}

	$selector.each(function() {
		//var parentMsg = $(this);
		var attr = $(this).attr("msg");
		if (attr) {
			var msgArg1 = $(this).attr("msgArg1");
			if (msgArg1) {
				$(this).text(getMessage( attr, msgArg1 ));
			} else {
				// look for inner msg nodes to replace before...
				var innerMsg = $(this).find("*[msg]");
				if (innerMsg.exists()) {
					initMessages(innerMsg);
					var msgArgs = new Array();
					innerMsg.each(function(index, element) {
						msgArgs.push( $(this)[0].outerHTML );
					});
					$(this).html(getMessage(attr, msgArgs));
				} else {
					$(this).text(getMessage(attr));
				}
			}
		}
		attr = $(this).attr("msgTitle");
		if (attr) {
			var msgArg1 = $(this).attr("msgTitleArg1");
			if (msgArg1) {
				$(this).attr("title", getMessage( $(this).attr("msgTitle"), msgArg1 ));
			} else {
				$(this).attr("title", getMessage(attr));
			}
		}
		attr = $(this).attr("msgLabel");
		if (attr) {
			var msgArg1 = $(this).attr("msgLabelArg1");
			if (msgArg1) {
				$(this).attr("label", getMessage( $(this).attr("msgLabel"), msgArg1 ));
			} else {
				$(this).attr("label", getMessage(attr));
			}
		}
		attr = $(this).attr("msgText");
		if (attr) {
			var msgArg1 = $(this).attr("msgTextArg1");
			if (msgArg1) {
				$(this).attr("text", getMessage( $(this).attr("msgText"), msgArg1 ));
			} else {
				$(this).attr("text", getMessage(attr));
			}
		}
		attr = $(this).attr("msgSrc");
		if (attr) {
			$(this).attr("src", getMessage(attr));
		}
		attr = $(this).attr("msgValue");
		if (attr) {
			$(this).attr("value", getMessage(attr));
		}
		attr = $(this).attr("msgPlaceholder");
		if (attr) {
			$(this).attr("placeholder", getMessage(attr));
		}
		attr = $(this).attr("msgHTML");
		if (attr) {
			$(this).html(getMessage(attr));
		}
	});
	
	if (!DetectClient.isChrome()) {
		$("[chrome-only]").attr("hidden", "");
    }

    if (DetectClient.isEdge()) {
        $("[hide-from-edge]").attr("hidden", "");
    }
}

function getChromeWindows(callback) {
	chrome.windows.getAll({}, function(windowList) {
		// keep only normal windows and not app windows like debugger etc.
		var normalWindows = new Array();
		for (var a=0; a<windowList.length; a++) {
			if (windowList[a].type == "normal") {
				normalWindows.push(windowList[a]);
			}
		}
		callback({windowList:windowList, normalWindows:normalWindows});
	});
}

// params: url or {url, urlToFind}
function createTab(params, callback) {
	var url;
	
	// Determine if object passed as param
	if (params.url) {
		url = params.url;
	} else {
		url = params;
	}
	getChromeWindows(function(windowsParams) {
		if (windowsParams.normalWindows.length == 0) {
			chrome.windows.create({url:url, focused:true}, function(window) {
				chrome.windows.getAll({populate:true}, function(windowList) {
					if (windowList) {
						for (var a=0; a<windowList.length; a++) {
							if (windowList[a].id == window.id) {
								for (var b=0; b<windowList[a].tabs.length; b++) {
									if (windowList[a].tabs[b].url == url) {										
										// force focus window cause it doesn't awlays happen when creating window with url
										chrome.windows.update(windowList[a].id, {focused:true}, function() {
											chrome.extension.getBackgroundPage().console.log("force window found")
											chrome.tabs.update(windowList[a].tabs[b].id, {selected:true}, callback);
										});
										break;
									}
								}
								break;
							}
						}
					}
				});
			});
		} else {
			selectOrCreateTab(params, callback);
		}		
	});
}

// params: findUrlStr, urlToOpen
function selectOrCreateTab(params, callback) {
	var url;
	
	if (!callback) {
		callback = function() {};
	}
	
	// Determine if object passed as param
	if (params.url) {
		url = params.url;
	} else {
		url = params;
	}
	
	if (params.urlToFind) {
		chrome.windows.getAll({populate:true}, function (windows) {
			for(var a=0; a<windows.length; a++) {
				var tabs = windows[a].tabs;
				for(var b=0; b<tabs.length; b++) {
					if (tabs[b].url.includes(params.urlToFind)) {
						// window focused bug fixed yay!
						chrome.windows.update(windows[a].id, {focused:true}, function() {
							chrome.tabs.update(tabs[b].id, { active: true });
							callback({found:true, tab:tabs[b]});
						});
						return true;
					}
				}
			}
			createTabAndFocusWindow(url, function(response) {
				callback({found:false, tab:response.tab});
			});
			return false;
		});
	} else {
		createTabAndFocusWindow(url, function(response) {
			callback({found:false, tab:response.tab});
		});
	}
}

function createTabAndFocusWindow(url, callback) {
	chrome.tabs.create({url: url}, function(tab) {
		chrome.windows.update(tab.windowId, {focused:true}, function() {
			if (callback) {
				callback(tab);
			}
		});						
	});
}

function removeNode(id) {
	var o = document.getElementById(id);
	if (o) {
		o.parentNode.removeChild(o);
	}
}

function addCSS(id, css) {
	removeNode(id);
	var s = document.createElement('style');
	s.setAttribute('id', id);
	s.setAttribute('type', 'text/css');
	s.appendChild(document.createTextNode(css));
	(document.getElementsByTagName('head')[0] || document.documentElement).appendChild(s);
}

function pad(str, times, character) { 
	var s = str.toString();
	var pd = '';
	var ch = character ? character : ' ';
	if (times > s.length) { 
		for (var i=0; i < (times-s.length); i++) { 
			pd += ch; 
		}
	}
	return pd + str.toString();
}

function toBool(str) {
	if ("false" === str || str == undefined) {
		return false;
	} else if ("true" === str) {
		return true;
	} else {
		return str;
	}
}

function pref(param, defaultValue) {
	var value = storage.get(param);
	if (defaultValue == undefined) {
		defaultValue = false;
	}
	return value == null ? defaultValue : toBool(value);
}

function getUrlValue(url, name, unescapeFlag) {
	if (url) {
	    var hash;
	    url = url.split("#")[0];
	    var hashes = url.slice(url.indexOf('?') + 1).split('&');
	    for(var i=0; i<hashes.length; i++) {
	        hash = hashes[i].split('=');
	        // make sure no nulls
	        if (hash[0] && name) {
				if (hash[0].toLowerCase() == name.toLowerCase()) {
					if (unescapeFlag) {
						return decodeURIComponent(hash[1]);
					} else {
						return hash[1];
					}
				}
	        }
	    }
	    return null;
	}
}

function setUrlParam(url, param, value) {
	var params = url.split("&");
	for (var a=0; a<params.length; a++) {
		var idx = params[a].indexOf(param + "=");
		if (idx != -1) {
			var currentValue = params[a].substring(idx + param.length + 1);

			if (value == null) {
				return url.replace(param + "=" + currentValue, "");
			} else {
				return url.replace(param + "=" + currentValue, param + "=" + value);
			}
		}
	}
	
	// if there is a hash tag only parse the part before;
	var urlParts = url.split("#");
	var newUrl = urlParts[0];
	
	if (!newUrl.includes("?")) {
		newUrl += "?";
	} else {
		newUrl += "&";
	}
	
	newUrl += param + "=" + value;
	
	// we can not append the original hashtag (if there was one)
	if (urlParts.length >= 2) {
		newUrl += "#" + urlParts[1];
	}
	
	return newUrl;
}

function getCookie(c_name) {
	if (document.cookie.length>0) {
	  c_start=document.cookie.indexOf(c_name + "=");
	  if (c_start!=-1) {
	    c_start=c_start + c_name.length+1;
	    c_end=document.cookie.indexOf(";",c_start);
	    if (c_end==-1) c_end=document.cookie.length;
	    return decodeURIComponent(document.cookie.substring(c_start,c_end));
	    }
	  }
	return "";
}

// Usage: getManifest(function(manifest) { display(manifest.version) });
function getManifest(callback) {
	var xhr = new XMLHttpRequest();
	xhr.onload = function() {
		callback(JSON.parse(xhr.responseText));
	};
	xhr.open('GET', './manifest.json', true);
	xhr.send(null);
}

function exists(o) {
	if (o) {
		return true;
	} else {
		return false;	
	}	
}

function getExtensionIDFromURL(url) {
	//"chrome-extension://dlkpjianaefoochoggnjdmapfddblocd/options.html"
	return url.split("/")[2]; 
}

function setTodayOffsetInDays(days) {
	var offset = today();
	offset.setDate(offset.getDate()+parseInt(days));
	localStorage["today"] = offset;
}

function clearTodayOffset() {
	localStorage.removeItem("today");
}

function addToArray(str, ary) {
	for (var a=0; a<ary.length; a++) {
		if (ary[a] == str) {
			return false;
		}
	}
	ary.push(str);
	return true;
}

function removeFromArray(str, ary) {
	for (var a=0; a<ary.length; a++) {
		if (ary[a] == str) {
			ary.splice(a, 1);
			return true;
		}
	}
	return false;
}

function isInArray(str, ary) {
	for (var a=0; a<ary.length; a++) {
		if (isSameUrl(ary[a], str)) {
			return true;
		}
	}
	return false;
}

function isSameUrl(url1, url2) {
	return removeProtocol(url1) == removeProtocol(url2);
}

function removeProtocol(url) {
	if (url) {
		return url.replace(/https?:\/\//g, "");
	} else {
		return url;
	}
}

function findTag(str, name) {
	if (str) {
		var index = str.indexOf("<" + name + " ");
		if (index == -1) {
			index = str.indexOf("<" + name + ">");
		}
		if (index == -1) {
			return null;
		}
		var closingTag = "</" + name + ">";
		var index2 = str.indexOf(closingTag);
		return str.substring(index, index2 + closingTag.length);
	}
}

function isRockMelt() {
	return navigator.userAgent.match(/rockmelt/i);
}

function rotate(node, params) {
	// can't rotate <a> tags for some reason must be the image inside if so
	var rotationInterval;
	if (params && params.forever) {
		node.css({WebkitTransition: "all 10ms linear"});
		var degree = 0;
		rotationInterval = setInterval(function() {
	    	node.css({WebkitTransform: 'rotate(' + (degree+=2) + 'deg)'}); //scale(0.4) translateZ(0)
	    }, 2);
	} else {
		node.css({WebkitTransition: "all 1s ease-out"}); //all 1000ms linear
		node.css({WebkitTransform: "rotateZ(360deg)"}); //-webkit-transform: rotateZ(-360deg);
	}
	return rotationInterval;
}

function trimLineBreaks(str) {
	if (str) {
		str = str.replace(/^\n*/g, "");
		str = str.replace(/\n*$/g, "");
	}
	return str;
}

function cleanEmailSubject(subject) {
	if (subject) {
		subject = subject.replace(/^re: ?/i, "");
		subject = subject.replace(/^fwd: ?/i, "");
	}
	return subject;	
}

function getHost(url) {
	if (url) {
		var matches = url.match(/:\/\/([^\/?#]*)/);
		if (matches && matches.length >=2) {
			return matches[1];
		}
	}
}

function ellipsis(str, cutoffLength) {	
	if (str && str.length > cutoffLength) {
		str = str.substring(0, cutoffLength) + " ...";
	}
	return str;
}

function Controller() {
	
	// apps.jasonsavard.com server
	Controller.FULLPATH_TO_PAYMENT_FOLDERS = "https://apps.jasonsavard.com/";
	
	// jasonsavard.com server
	//Controller.FULLPATH_TO_PAYMENT_FOLDERS = "https://jasonsavard.com/apps.jasonsavard.com/";

	// internal only for now
	async function callAjaxController(params) {
        return fetchJSON(Controller.FULLPATH_TO_PAYMENT_FOLDERS + "controller.php", params.data, {
            method: params.method ? params.method : "GET",
            headers: {
                misc: location.href
            }
        });
	}

	Controller.verifyPayment = function(itemID, emails) {
		const data = {
            action: "verifyPayment",
            name: itemID,
            email: emails
        };
		return callAjaxController({data: data});
	}

	Controller.processFeatures = async function() {
		// local
		const storage = await getStorage();
        await storage.enable("donationClicked");
        // sync
        const syncStorage = await getStorage("sync");
        await syncStorage.enable("donationClicked");
        chrome.runtime.sendMessage({command: "featuresProcessed"}, function(response) {});
	}

}

function ChromeTTS() {
	
	var chromeTTSMessages = new Array();
	var speaking = false;
	
	ChromeTTS.queue = function(msg, options, callback) {
		if (!options) {
			options = {};
		}
		
		if (!callback) {
			callback = function() {};
		}
		
		options.utterance = msg;
		chromeTTSMessages.push(options);
		play(callback);
	};
	
	function play(callback) {
		if (!callback) {
			callback = function() {};
		}
		
		if (chromeTTSMessages.length) {
			chrome.tts.isSpeaking(function(speakingParam) {
				console.log(speaking + " _ " + speakingParam);
				if (!speaking && !speakingParam) {
					// decoded etity codes ie. &#39; is ' (apostrohpe)
					var ttsMessage = $("<textarea/>").html(chromeTTSMessages[0].utterance).text();
					
					var voiceParams = pref("voice", "native");
					
					var voiceName;
					var extensionID;
					// if specified use it instead of the default 
					if (chromeTTSMessages[0].voiceName) {
						voiceName = chromeTTSMessages[0].voiceName;
						extensionID = "";
					} else {
						voiceName = voiceParams.split("___")[0];
						extensionID = voiceParams.split("___")[1];
					}					

					console.log("speak: " + ttsMessage);
					
					speaking = true;
					
					chrome.tts.stop();
					
					setTimeout(function() {
						chrome.tts.speak(ttsMessage, {
							voiceName: voiceName,
							extensionId : extensionID,
							//enqueue : true,
							volume: pref("voiceSoundVolume", 100) / 100,
							pitch: parseFloat(pref("pitch", 1.0)),
							rate: parseFloat(pref("rate", 1.0)),
							onEvent: function(event) {
								console.log('event: ' + event.type);			
								if (event.type == 'error' || event.type == 'end') {
									//setTimeout(function() {
										chromeTTSMessages.shift();
										speaking = false;
										play(callback);
									//}, 400);
								}
							}
						});
					}, 150);
				} else {
					console.log("already speaking, wait before retrying...");
					setTimeout(function() {
						play(callback);
					}, 1000);
				}
			});
		} else {
			callback();
		}
	}
}

async function fetchWrapper(url, options) {
    try {
        return await fetch(url, options);
    } catch (error) {
        console.error("fetch error: " + error);
        if (navigator.onLine) {
            throw "Network problem";
        } else {
            throw "You're offline";
        }
    }
}

async function fetchText(url) {
    const response = await fetchWrapper(url);
    if (response.ok) {
        return response.text();
    } else {
        const error = Error(response.statusText);
        error.status = reponse.status;
        throw error;
    }
}

async function fetchJSON(url, data, options = {}) {
    if (options.method) {
        options.method = options.method.toUpperCase();
    }

    if (data) {
        // default is get
        if (!options.method || /GET/i.test(options.method)) {
            if (!url.searchParams) {
                url = new URL(url);
            }

            // formdata should not be passed as GET (actually fails) but if we let's convert it to url parameters
            if (data instanceof FormData) {
                for (const pair of data.entries()) {
                    url.searchParams.append(pair[0], pair[1]);
                }
            } else {            
                Object.keys(data).forEach(key => {
                    if (Array.isArray(data[key])) {
                        data[key].forEach(value => {
                            url.searchParams.append(key + "[]", value);
                        });
                    } else {
                        url.searchParams.append(key, data[key]);
                    }
                });
            }
        } else { // must be post, patch, delete etc..
            if (!options.headers) {
                options.headers = {};
            }

            const contentType = options.headers["content-type"] || options.headers["Content-Type"];
            if (contentType && contentType.includes("application/json")) {
                options.body = JSON.stringify(data);
            } else if (contentType && contentType.includes("multipart/mixed")) {
                options.body = data;
            } else if (data instanceof FormData) {
                options.body = data;
            } else {
                var formData = new FormData();
                Object.keys(data).forEach(key => formData.append(key, data[key]));
                options.body = formData;
            }
        }
    }
    
    console.log("fetchJSON", url, options);
    const response = await fetchWrapper(url, options);
    console.log("response", response);

    let responseData = await response.text();
    if (responseData) {
        try {
            responseData = JSON.parse(responseData);
        } catch (error) {
            console.warn("Response probaby text only: " + error);
        }
    }
    if (response.ok) {
        return responseData;
    } else {
        if (responseData) {
            if (typeof responseData.code === "undefined") { // code property alread exists so let's use fetchReturnCode
                responseData.code = response.status;
            } else {
                responseData.fetchReturnCode = response.status;
            }
            throw responseData;
        } else {
            throw response.statusText;
        }
    }
}

function OAuthForDevices(defaultParams, tokenResponses) {

	var that = this;

	this.tokenResponses = tokenResponses;
	if (!this.tokenResponses) {
		this.tokenResponses = [];
	}
	
	this.getSecurityToken = function() {
		return ls[defaultParams.securityTokenKey];
    }
    
	this.generateSecurityToken = function() {
        return ls[defaultParams.securityTokenKey] = getUniqueId();
    }

    this.removeSecurityToken = function() {
        ls.removeItem(defaultParams.securityTokenKey);
    }
    
	// return array
	this.getUserEmails = function() {
		return that.tokenResponses.map(tokenResponse => tokenResponse.userEmail);
	}

	this.getUserEmail = function(tokenResponse) {
		return new Promise((resolve, reject) => {
			// can't get unique id so just return default
			resolve({
                userEmail: "default"
            });
		});
	}

	function onTokenChangeWrapper(params) {
        if (params.tokenResponse.expires_in) {
            params.tokenResponse.expiryDate = new Date(Date.now() + (params.tokenResponse.expires_in * 1000)).toJSON(); // Patch because there is a Chrome bug/documentation issue with Dates serializing as empty object in storage ref: https://bugs.chromium.org/p/chromium/issues/detail?id=161319
        }
		that.onTokenChange(params, that.tokenResponses);
	}	
	
	// params: changedToken, allTokens
	this.onTokenChange = function() {};
	
	this.openPermissionWindow = function(params = {}) {
		return new Promise((resolve, reject) => {
            const scopes = params.scopes || defaultParams.scope;
            const stateParams = chrome.runtime.getURL("oauth2callback.html?security_token=" + that.generateSecurityToken()) + "&scopes=" + scopes;

			var url = defaultParams.API.auth_uri + "?response_type=code&client_id=" + defaultParams.API.client_id + "&redirect_uri=" + defaultParams.API.redirect_uri + "&scope=" + encodeURIComponent(scopes) + "&state=" + encodeURIComponent(stateParams);
			if (params.email) {
				url += "&login_hint=" + encodeURIComponent(params.email);
			} else {
				//url += "&prompt=select_account"; // does work :) commenting this will default to account IF only one account
				url += "&prompt=" + encodeURIComponent("consent select_account");
			}
			
            url += "&access_type=offline"; // required when I used https://www.googleapis.com/oauth2/v4/token (instead of the old way https://accounts.google.com/o/oauth2/v2/auth) or else refresh_token was not returned
            url += "&include_granted_scopes=true";

			var width = 600;
			var height = 800;
			var left = (screen.width/2)-(width/2);
			var top = (screen.height/2)-(height/2);
			
			if (chrome.windows) {
				chrome.windows.create({url:url, width:width, height:height, left:Math.round(left), top:Math.round(top), type:"popup"}, function(newWindow) {
					resolve(newWindow);
				});
			} else {
				var newWindow = openWindowInCenter(url, 'oauth', 'toolbar=0,scrollbars=0,menubar=0,resizable=0', width, height);
				resolve(newWindow);
			}
			
		});
	}
	
	this.setOnTokenChange = function(onTokenChange) {
		this.onTokenChange = onTokenChange;
    }
    
    async function oauthFetch(url, data, options = {}) {
        try {
            return await fetchJSON(url, data, options);
        } catch (response) {
            let error;
            if (response.error) {
                if (response.error.message) {
                    error = Error(response.error.message);
                    error.code = response.error.code;
                } else { // token errors look like this {"error": "invalid_grant", "error_description": "Bad Request"}
                    error = Error(response.error);
                    error.code = response.code;
                }
            } else {
                error = Error(response.statusText);
                error.code = response.status;
            }

            if (error == "invalid_grant" || error == "invalid_request" || error.code == 401) { // i removed 400 because it happens when entering invalid data like a quick add of "8pm-1am Test 1/1/19"
                error.message = "You need to re-grant access, it was probably revoked";
            }

            console.error("error in oauthFetch: " + error);
            throw error;
        }
    }

	async function sendOAuthRequest(params) {
        let BASE_URL = params.upload ? defaultParams.UPLOAD_URI : defaultParams.BASE_URI;
        const url = new URL(params.url, BASE_URL);

        let accessToken;
        if (params.tokenResponse) {
            accessToken = params.tokenResponse.access_token;
        } else if (params.userEmail) {
            var tokenResponse = that.findTokenResponse(params);
            accessToken = tokenResponse.access_token;
        }

        if (/DELETE/i.test(params.type)) {
            params.data = null;
        }
        
        const options = {
            headers: {
                Authorization: "Bearer " + accessToken,
            },
        }

        if (params.type) {
            options.method = params.type.toUpperCase(); // was getting CORS and Access-Control-Allow-Origin errors!!
        }

        if (params.contentType) {
            options.headers["content-type"] = params.contentType;
        }

        options.mode = "cors";
        
        try {
            const data = await oauthFetch(url, params.data, options);
            // empty data happens when user does a method like DELETE where this no content returned
            return data || {};
        } catch (error) {
            copyObj(params, error);
            throw error;
        }
	}

	async function ensureToken(tokenResponse) {
        if (tokenResponse.chromeProfile) {
            const getAuthTokenParams = {
                interactive: false,
                scopes: (tokenResponse.scopes || Scopes.DRIVE_READWRITE).split(" ") // legacy default to initial full scope (before i reduced them)
            };
            try {
                tokenResponse.access_token = await getAuthToken(getAuthTokenParams);
                return {};
            } catch (errorMessage) {
                const error = Error(errorMessage);
                if (error.toString().includes("OAuth2 not granted or revoked")) {
                    error.code = 401;
                }
                throw error;
            }
        } else if (isExpired(tokenResponse)) {
            console.log("token expired: ", tokenResponse);
            return refreshToken(tokenResponse);
        } else {
            return {};
        }
    }

	async function refreshToken(tokenResponse) {
        // must refresh token
        console.log("refresh token: " + tokenResponse.userEmail + " " + Date.now().toString());
        
        let data = {
            refresh_token:      tokenResponse.refresh_token,
            client_id:          defaultParams.API.client_id,
            client_secret:      defaultParams.API.client_secret,
            grant_type:         "refresh_token"
        };
        
        // old OAuth client ID (in new way, I save the client id in tokenresponse)
        if (!tokenResponse.clientId) {
            data.client_id = defaultParams.OLD_API.client_id;
            data.client_secret = defaultParams.OLD_API.client_secret;
        }
    
        data = await oauthFetch(defaultParams.API.token_uri, data, {method: "post"});

        tokenResponse.access_token = data.access_token;
        tokenResponse.expires_in = data.expires_in;
        tokenResponse.token_type = data.token_type;					
        
        var callbackParams = {tokenResponse:tokenResponse};
        onTokenChangeWrapper(callbackParams);
        console.log("in refresh: " + tokenResponse.expiryDate.toString());
        return callbackParams;
	}
	
	// private isExpired
	function isExpired(tokenResponse) {
		return !tokenResponse.expiryDate || new Date(tokenResponse.expiryDate).isBefore();
	}

    function getAuthToken(params) {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken(params, token => {
                if (chrome.runtime.lastError) {
                    console.info("getAuthToken error: " + chrome.runtime.lastError.message, token);
                    reject(chrome.runtime.lastError.message);
                } else {
                    resolve(token);
                }
            });
        });
    }

	this.send = async function(params) {
        var tokenResponse = that.findTokenResponse(params);		
        if (tokenResponse) {
            await ensureToken(tokenResponse);
            const response = await sendOAuthRequest(params);
            return response;
        } else {
            const error = new Error("Missing token or code. Try re-granting access.");
            error.errorCode = "NO_TOKEN_OR_CODE"; // Note: Must match in screenshots extension
            throw error;
        }
	}

	this.findTokenResponseIndex = function(params) {
		for (var a=0; a<that.tokenResponses.length; a++) {
			if (that.tokenResponses[a].userEmail == params.userEmail) {
				return a;
			}
		}
		return -1;
	}

	this.findTokenResponse = function(params) {
		for (var a=0; a<that.tokenResponses.length; a++) {
			if (that.tokenResponses[a].userEmail == params.userEmail) {
				return that.tokenResponses[a];
			}
		}
	}
	
	this.getAccessToken = async function(params) {
        console.log("get access token");
        let tokenResponse;
        
        if (params.code) {
            tokenResponse = await oauthFetch(defaultParams.API.token_uri, {
                code:           params.code,
                client_id:      defaultParams.API.client_id,
                client_secret:  defaultParams.API.client_secret,
                redirect_uri:   defaultParams.API.redirect_uri,
                grant_type:     "authorization_code"
            }, {
                method: "post"
            });

            that.removeSecurityToken();
        } else {
            if (params.refetch) {
                const tokenResponse = that.findTokenResponse({userEmail:"default"});
                if (tokenResponse) {
                    try {
                        await removeCachedAuthToken(tokenResponse.access_token);
                    } catch (error) {
                        // nothing
                        console.warn(error);
                    }
                }
            }

            tokenResponse = {
                chromeProfile: true
            };

            let getAuthTokenParams = {
                interactive: true,
                scopes: (params.scopes || defaultParams.scope).split(" ")
            };
            
            let token;
            try {
                token = await getAuthToken(getAuthTokenParams);
            } catch (error) {
                // patch seems even on success it would return an error, but calling it 2nd time would get the token
                getAuthTokenParams.interactive = false;
                token = await getAuthToken(getAuthTokenParams);
            }
            tokenResponse.access_token = token;
        }

        console.log("token response", tokenResponse);
        const response = await that.getUserEmail(tokenResponse);
        if (response.userEmail) {
            // add this to response
            tokenResponse.userEmail = response.userEmail;
            tokenResponse.clientId = defaultParams.API.client_id;
            tokenResponse.scopes = params.scopes || defaultParams.scope;
            
            var tokenResponseIndex = that.findTokenResponseIndex(response);
            if (tokenResponseIndex != -1) {
                // update if exists
                that.tokenResponses[tokenResponseIndex] = tokenResponse;
            } else {
                // add new token response
                that.tokenResponses.push(tokenResponse);
            }
            
            var callbackParams = {tokenResponse:tokenResponse};
            onTokenChangeWrapper(callbackParams);
            return callbackParams;
        } else {
            throw new Error("Could not fetch email");
        }
	}
}

function ChromeStorage(params) {
	var that = this;
	
	params = initUndefinedObject(params);
	params.storageItemsToCompress = initUndefinedObject(params.storageItemsToCompress);
	
	var storageArea;
	if (params.storageArea == "sync" && chrome.storage.sync) {
		storageArea = chrome.storage.sync;
	} else {
		storageArea = chrome.storage.local;
	}
	
	var cache = {};
	
	function initDefaults() {
    	if (params.defaults) {
    		for (key in params.defaults) {
    			if (cache[key] === undefined) {
    				cache[key] = params.defaults[key];
    			}
    		}
    	}
	}
	
	this.load = function() {
		return new Promise(function(resolve, reject) {
			//console.log("Loading storage...");
			storageArea.get(null, items => {
				if (chrome.runtime.lastError){
		            reject(chrome.runtime.lastError.message);
		        } else {
		        	for (key in items) {
		        		if (params.storageItemsToCompress[key]) {
                            throw "jerror: removed support for compression"
		        		} else {
							// could be excessive but i'm stringifing because i want parse with the datereviver (instead of interating the object myself in search of date strings)
							if (items[key]) {
								items[key] = JSON.parse(JSON.stringify(items[key]), dateReviver);
							}
		        		}
		        	}
		        	
		        	cache = items;
		        	initDefaults();
		        	resolve(cache);
		        }
			});
		});
	}
	
	this.get = function(key, defaultValue) {
		var value = cache[key];
		if (value == null && defaultValue != undefined) {
			value = defaultValue;
		} else {
			value = cache[key];
		}
		return value;
	}
	
	this.set = function(key, value) {
		return new Promise((resolve, reject) => {
			if (value === undefined) {
				var error = "value not set for key: " + key;
				console.error(error);
				reject(error);
			}
			
			var storageValue;

			// clone any objects/dates etc. or else we could modify the object outside and the cache will also be changed
			if (value instanceof Date) {
				cache[key] = new Date(value.getTime());
				storageValue = value.toJSON(); // must stringify this one because chrome.storage does not serialize
			} else if (value !== null && typeof value === 'object') {
				cache[key] = value;
				// clone
				//cache[key] = JSON.parse(JSON.stringify(value), dateReviver);
				if (params.storageItemsToCompress[key]) {
                    throw "jerror: removed support to compression";
				} else {
					storageValue = JSON.parse(JSON.stringify(value));
					
				}
			} else {
				cache[key] = value;
				storageValue = value;
			}
			
			var item = {};
			item[key] = storageValue;
			storageArea.set(item, function() {
				if (chrome.runtime.lastError) {
					var error = "Error with saving key: " + key + " " + chrome.runtime.lastError.message;
					console.error(error);
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}
	
	this.enable = function(key) {
		that.set(key, true);
	}

	this.disable = function(key) {
		that.set(key, false);
	}
	
	this.setDate = function(key) {
		that.set(key, new Date());
	}
	
	this.toggle = function(key) {
    	if (that.get(key)) {
    		that.remove(key);
    	} else {
    		that.set(key, true);
    	}
	}
	
	this.remove = function(key) {
		return new Promise((resolve, reject) => {
			if (params.defaults) {
				cache[key] = params.defaults[key];
			} else {
				delete cache[key];
			}
			storageArea.remove(key, function() {
				if (chrome.runtime.lastError) {
					var error = "Error removing key: " + key + " " + chrome.runtime.lastError.message;
					console.error(error);
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}
	
	this.clear = function() {
		return new Promise((resolve, reject) => {
			storageArea.clear(function() {
				if (chrome.runtime.lastError) {
					var error = "Error clearing cache: " + chrome.runtime.lastError.message;
					console.error(error);
					reject(error);
				} else {
					cache = {};
					initDefaults();
					resolve();
				}
			});
		});
	}
	
	this.firstTime = function(key) {
		if (that.get("_" + key)) {
			return false;
		} else {
			that.set("_" + key, new Date());
			return true;
		}
	}

}

function lightenDarkenColor(col, amt) {
    var usePound = false;
    if ( col[0] == "#" ) {
        col = col.slice(1);
        usePound = true;
    }

    var num = parseInt(col,16);

    var r = (num >> 16) + amt;

    if ( r > 255 ) r = 255;
    else if  (r < 0) r = 0;

    var b = ((num >> 8) & 0x00FF) + amt;

    if ( b > 255 ) b = 255;
    else if  (b < 0) b = 0;

    var g = (num & 0x0000FF) + amt;

    if ( g > 255 ) g = 255;
    else if  ( g < 0 ) g = 0;

    return (usePound?"#":"") + (g | (b << 8) | (r << 16)).toString(16);
}

function getDataUrl(url, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', url, true);
	xhr.responseType = 'blob';
	xhr.onload = function(e) {
		callback(window.webkitURL.createObjectURL(this.response));
	};
	xhr.send();
}

function openWindowInCenter(url, title, specs, popupWidth, popupHeight) {
	var left = (screen.width/2)-(popupWidth/2);
	var top = (screen.height/2)-(popupHeight/2);
	return window.open(url, title, specs + ", width=" + popupWidth + ", height=" + popupHeight + ", top=" + top + ", left=" + left)
}

function parseVersionString(str) {
    if (typeof(str) != 'string') { return false; }
    var x = str.split('.');
    // parse from string or default to 0 if can't parse
    var maj = parseInt(x[0]) || 0;
    var min = parseInt(x[1]) || 0;
    var pat = parseInt(x[2]) || 0;
    return {
        major: maj,
        minor: min,
        patch: pat
    }
}

function cmpVersion(a, b) {
    var i, cmp, len, re = /(\.0)+[^\.]*$/;
    a = (a + '').replace(re, '').split('.');
    b = (b + '').replace(re, '').split('.');
    len = Math.min(a.length, b.length);
    for( i = 0; i < len; i++ ) {
        cmp = parseInt(a[i], 10) - parseInt(b[i], 10);
        if( cmp !== 0 ) {
            return cmp;
        }
    }
    return a.length - b.length;
}

function gtVersion(a, b) {
    return cmpVersion(a, b) >= 0;
}

// syntax: ltVersion(details.previousVersion, "7.0.15")
function ltVersion(a, b) {
    return cmpVersion(a, b) < 0;
}

function escapeRegExp(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function initUndefinedObject(obj) {
    if (typeof obj == "undefined") {
        return {};
    } else {
        return obj;
    }
}

function initUndefinedCallback(callback) {
    if (callback) {
        return callback;
    } else {
        return function() {};
    }
}

//return 1st active tab
function getActiveTab(callback) {
	chrome.tabs.query({'active': true, lastFocusedWindow: true}, function(tabs) {
		if (tabs && tabs.length >= 1) {
			callback(tabs[0]);
		} else {
			callback();
		}
	});
}

function getZoomFactor() {
	return new Promise(function(resolve, reject) {
		if (chrome.tabs && chrome.tabs.getZoomSettings) {
			chrome.tabs.getZoomSettings(function(zoomSettings) {
				if (chrome.runtime.lastError) {
					console.error(chrome.runtime.lastError.message);
					resolve(window.devicePixelRatio);
				} else {
					resolve(zoomSettings.defaultZoomFactor);
				}
			});
		} else {
			resolve(window.devicePixelRatio);
		}
	});
}

function getUniqueId() {
	return Math.floor(Math.random() * 100000);
}

function getUUID() {
	function _p8(s) {
		var p = (Math.random().toString(16) + "000000000").substr(2, 8);
		return s ? "-" + p.substr(0, 4) + "-" + p.substr(4, 4) : p;
	}
	return _p8() + _p8(true) + _p8(true) + _p8();
}

//cross OS used to determine if ctrl or mac key is pressed
function isCtrlPressed(e) {
	return e.ctrlKey || e.metaKey;
}

async function sleep(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

function isDomainEmail(email) {
	if (email) {
		email = email.toLowerCase();
		var POPULAR_DOMAINS = ["zoho", "aim", "videotron", "icould", "inbox", "yandex", "rambler", "ya", "sbcglobal", "msn", "me", "facebook", "twitter", "linkedin", "email", "comcast", "gmx", "aol", "live", "google", "outlook", "yahoo", "gmail", "mail", "comcast", "googlemail", "hotmail"];
		
		var foundPopularDomainFlag = POPULAR_DOMAINS.some(function(popularDomain) {
			if (email.includes("@" + popularDomain + ".")) {
				return true;
			}
		});
		
		return !foundPopularDomainFlag;
	}
}

class ProgressNotification {
	constructor() {
	    this.PROGRESS_NOTIFICATION_ID = "progress";
	}
	
	show() {
		if (DetectClient.isChrome()) {
			var options = {
				type: "progress",
				title: getMessage("processing"),
				message: "",
				iconUrl: "images/icon128.png",
				requireInteraction: !DetectClient.isMac(),
				progress: 0
			}
			
			var that = this;
			chrome.notifications.create(that.PROGRESS_NOTIFICATION_ID, options, function(notificationId) {
				if (chrome.runtime.lastError) {
					console.error(chrome.runtime.lastError.message);
				} else {
					that.progressInterval = setInterval(() => {
						options.progress += 20;
						if (options.progress > 100) {
							options.progress = 0;
						}
						chrome.notifications.update(that.PROGRESS_NOTIFICATION_ID, options);
					}, 200);
				}
			});
		}
	}
	
	cancel() {
		clearInterval(this.progressInterval);
		chrome.notifications.clear(this.PROGRESS_NOTIFICATION_ID);
	}

	complete(title) {
		var that = this;
		clearInterval(this.progressInterval);
		setTimeout(() => {
			chrome.notifications.clear(that.PROGRESS_NOTIFICATION_ID, () => {
				showMessageNotification(title ? title : "Complete", getMessage("clickToolbarIconToContinue"));
			});
		}, 200);
	}
}

function insertScript(url) {
    return new Promise((resolve, reject) => {
        var script = document.createElement('script');
        script.async = true;
        script.src = url;
        script.onload = () => {
            resolve();
        };
        (document.getElementsByTagName('head')[0]||document.getElementsByTagName('body')[0]).appendChild(script);
    });
}

function insertStylesheet(url) {
	var link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = url;
	document.head.appendChild(link);
}

function insertImport(url, id) {
	var link = document.createElement('link');
	if (id) {
		link.id = id;
	}
	link.rel = 'import';
	link.href = url;
	document.head.appendChild(link);
}

//for 2nd parmeter of JSON.parse(... , dateReviver);
function dateReviver(key, value) {
    if (isStringDate(value)) {
        return new Date(value);
    } else {
    	return value;
    }
}

function dateReplacer(key, value) {
    if (value instanceof Date) {
        return value.toJSON();
    } else {
    	return value;
    }
}

function isStringDate(str) {
	return typeof str == "string" && str.length == 24 && /\d{4}-\d{2}-\d{2}T\d{2}\:\d{2}\:\d{2}\.\d{3}Z/.test(str);
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function getInstanceId(storage) {
    return new Promise(async (resolve, reject) => {
        const instanceId = await storage.get("instanceId");
        if (instanceId) {
            resolve(instanceId);
        } else {
            if (chrome.instanceID) {
                chrome.instanceID.getID(instanceId => {
                    if (chrome.runtime.lastError) {
                        const error = new Error("Problem getting instanceid: " + chrome.runtime.lastError.message);
                        console.error(error);
                        reject(error)
                    } else {
                        clearTimeout(window.instanceIdTimeout);
                        resolve(instanceId);
                    }
                });
            } else {
                reject("chrome.instanceId not supported");
            }
    
            // seems Brave browser doesn't respond to success or failure
            window.instanceIdTimeout = setTimeout(() => {
                reject("instanceId not responding");
            }, seconds(2));
        }
    }).catch(error => {
        console.warn("Generating instanceId");
        const instanceId = getUUID();
        storage.set("instanceId", instanceId);
        return instanceId;
    });
}

function ensureGCMRegistration(storage) {
	return new Promise(async (resolve, reject) => {
        const registrationId = await storage.get("registrationId");
		if (registrationId) {
			console.log("reusing gcm regid");
			resolve(registrationId);
		} else {
			if (chrome.instanceID) {
                chrome.instanceID.getToken({
                    authorizedEntity: GCM_SENDER_ID,
                    scope: "GCM"
                }, async token => {
                    console.log("register gcm");
                    clearTimeout(window.instanceIdTimeout);
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                        reject(chrome.runtime.lastError.message);
                    } else {
                        console.log("token", token);
                        await storage.set("registrationId", token);
                        resolve(token);
                    }
                });

                // seems Brave browser doesn't respond to success or failure
                window.instanceIdTimeout = setTimeout(() => {
                    const error = new Error("instanceID not responding");
                    reject(error);
                }, seconds(2));
			} else {
				const error = new Error("GCM not supported");
				console.warn(error);
				reject(error);
			}
		}
	});
}

function removeCachedAuthToken(token) {
	return new Promise((resolve, reject) => {
		chrome.identity.removeCachedAuthToken({ token: token }, () => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError.message);
			} else {
				resolve();
			}
		});
	});
}

function supportsChromeSignIn() {
    if (DetectClient.isFirefox() || DetectClient.isEdge()) {
        return false;
    } else {
        return true;
    }
}
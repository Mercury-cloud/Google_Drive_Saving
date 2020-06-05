/************************************************************************/
/*                                                                      */
/*      Save Page WE - Generic WebExtension - Content Pages             */
/*                                                                      */
/*      Javascript for Saving Content Pages (main frame)                */
/*                                                                      */
/*      Last Edit - 29 Mar 2020                                         */
/*                                                                      */
/*      Copyright (C) 2016-2020 DW-dev                                  */
/*                                                                      */
/*      Distributed under the GNU General Public License version 2      */
/*      See LICENCE.txt file and http://www.gnu.org/licenses/           */
/*                                                                      */
/************************************************************************/

/************************************************************************/
/*                                                                      */
/* Refer to Google Chrome developer documentation:                      */
/*                                                                      */
/*  https://developer.chrome.com/extensions/content_scripts             */
/*  https://developer.chrome.com/extensions/messaging                   */
/*  https://developer.chrome.com/extensions/xhr                         */
/*                                                                      */
/*  https://developer.chrome.com/extensions/match_patterns              */
/*                                                                      */
/*  https://developer.chrome.com/extensions/runtime                     */
/*  https://developer.chrome.com/extensions/storage                     */
/*                                                                      */
/************************************************************************/

/************************************************************************/
/*                                                                      */
/*  Tab Page Types                                                      */
/*                                                                      */
/*   undefined = Unknown                                                */
/*           0 = Normal Page                                            */
/*           1 = Saved Page                                             */
/*           2 = Saved Page with Resource Loader                        */
/*                                                                      */
/************************************************************************/

/************************************************************************/
/*                                                                      */
/*  Tab Save States                                                     */
/*                                                                      */
/*   undefined = Tab does not exist or URL never committed              */
/*          -2 = URL committed                                          */
/*          -1 = Script loaded                                          */
/*           0 = Lazy Loads                                             */
/*           1 = First Pass                                             */
/*           2 = Second Pass                                            */
/*           3 = Third Pass                                             */
/*           4 = Remove Resource Loader                                 */
/*           5 = Extract Image/Audio/Video                              */
/*                                                                      */
/************************************************************************/

"use strict";

/************************************************************************/

/* Global variables */

var isFirefox;
var ffVersion;

var platformOS;
var platformArch;

var maxTotalSize;  /* MB */

var showWarning,showURLList,promptComments,skipWarningsComments;
var retainCrossFrames,mergeCSSImages,removeUnsavedURLs,includeInfoBar,includeSummary,formatHTML;
var savedFileName,replaceSpaces,replaceChar,maxFileNameLength;
var saveHTMLAudioVideo,saveHTMLObjectEmbed,saveHTMLImagesAll;
var saveCSSImagesAll,saveCSSFontsWoff,saveCSSFontsAll,saveScripts;
var maxFrameDepth;
var maxResourceSize;
var maxResourceTime;
var forceLazyLoads,lazyLoadTime;
var allowPassive;
var refererHeader;
var purgeElements;

var pageType;  /* 0 = normal page, 1 = saved page, 2 = saved page with resource loader */

var menuAction;
var multipleTabs;
var externalSave,swapDevices;  /* from Print Edit WE*/

var passNumber;
var iconFound;

var frameKey = new Array();
var frameURL = new Array();
var frameHTML = new Array();
var frameFonts = new Array();

var resourceCount;

var resourceLocation = new Array();
var resourceReferer = new Array();
var resourceMimeType = new Array();
var resourceCharSet = new Array();
var resourcePassive = new Array();
var resourceContent = new Array();
var resourceStatus = new Array();
var resourceReason = new Array();
var resourceRemembered = new Array();
var resourceReplaced = new Array();
var resourceCSSRemembered = new Array();  /* number of times CSS image remembered */
var resourceCSSFrameKeys = new Array();  /* keys of frames in which CSS image remembered */

var htmlStrings = new Array();

var timeStart = new Array();
var timeFinish = new Array();

var pageInfoBarText,shadowLoaderText,enteredComments;

/************************************************************************/

/* Initialize on script load */

chrome.storage.local.get(null,
function(object)
{
    /* Load environment */
    
    isFirefox = object["environment-isfirefox"];
    
    if (isFirefox) ffVersion = object["environment-ffversion"];
    
    platformOS = object["environment-platformos"];
    
    platformArch = object["environment-platformarch"];
    
    /* Load options */
    
    showWarning = object["options-showwarning"];
    showURLList = object["options-showurllist"];
    promptComments = object["options-promptcomments"];
    skipWarningsComments = object["options-skipwarningscomments"];
    
    retainCrossFrames = object["options-retaincrossframes"];
    mergeCSSImages = object["options-mergecssimages"];
    removeUnsavedURLs = object["options-removeunsavedurls"];
    includeInfoBar = object["options-includeinfobar"];
    includeSummary = object["options-includesummary"];
    formatHTML = object["options-formathtml"];
    
    savedFileName = object["options-savedfilename"];
    replaceSpaces = object["options-replacespaces"];
    replaceChar = object["options-replacechar"];
    maxFileNameLength = object["options-maxfilenamelength"];
    
    saveHTMLImagesAll = object["options-savehtmlimagesall"];
    saveHTMLAudioVideo = object["options-savehtmlaudiovideo"];
    saveHTMLObjectEmbed = object["options-savehtmlobjectembed"];
    saveCSSImagesAll = object["options-savecssimagesall"];
    saveCSSFontsWoff = object["options-savecssfontswoff"];
    saveCSSFontsAll = object["options-savecssfontsall"];
    saveScripts = object["options-savescripts"];
    
    maxFrameDepth = object["options-maxframedepth"];
    
    maxResourceSize = object["options-maxresourcesize"];
    
    maxResourceTime = object["options-maxresourcetime"];
    
    forceLazyLoads = object["options-forcelazyloads"];
    
    lazyLoadTime = object["options-lazyloadtime"];
    
    allowPassive = object["options-allowpassive"];
    
    refererHeader = object["options-refererheader"];
    
    purgeElements = object["options-purgeelements"];
    
    /* Set maximum total size for resources */
    
    if (platformOS == "win")
    {
        if (isFirefox)
        {
            if (ffVersion < 55) maxTotalSize = 150;  /* 150MB */
            else maxTotalSize = (platformArch == "x86-64") ? 1000 : 400;  /* 64-bit 1000MB, 32-bit 400MB */
        }
        else  /* Chrome */
        {
            maxTotalSize = (platformArch == "x86-64") ? 250 : 500;  /* 64-bit 250MB, 32-bit 500MB */
        }
    }
    else /* linux or mac */
    {
        maxTotalSize = 200;  /* 200MB */
    }
    
    /* Set page type */
    
    pageType = (document.querySelector("script[id='savepage-pageloader']") != null ||  /* Version 7.0-14.0 */
                document.querySelector("meta[name='savepage-resourceloader']") != null) ? 2 :  /* Version 15.0-15.1 */
                document.querySelector("meta[name='savepage-url']") != null ? 1 : 0;
    
    /* Add listeners */
    
    addListeners();
    
    /* Script loaded */
    
    chrome.runtime.sendMessage({ type: "scriptLoaded" });
});

/************************************************************************/

/* Add listeners */

function addListeners()
{
    /* Storage changed listener */
    
    chrome.storage.onChanged.addListener(
    function(changes,areaName)
    {
        if ("options-showwarning" in changes) showWarning = changes["options-showwarning"].newValue;
        if ("options-showurllist" in changes) showURLList = changes["options-showurllist"].newValue;
        if ("options-promptcomments" in changes) promptComments = changes["options-promptcomments"].newValue;
        if ("options-skipwarningscomments" in changes) skipWarningsComments = changes["options-skipwarningscomments"].newValue;
        
        if ("options-retaincrossframes" in changes) retainCrossFrames = changes["options-retaincrossframes"].newValue;
        if ("options-mergecssimages" in changes) mergeCSSImages = changes["options-mergecssimages"].newValue;
        if ("options-removeunsavedurls" in changes) removeUnsavedURLs = changes["options-removeunsavedurls"].newValue;
        if ("options-includeinfobar" in changes) includeInfoBar = changes["options-includeinfobar"].newValue;
        if ("options-includesummary" in changes) includeSummary = changes["options-includesummary"].newValue;
        if ("options-formathtml" in changes) formatHTML = changes["options-formathtml"].newValue;
        
        if ("options-savedfilename" in changes) savedFileName = changes["options-savedfilename"].newValue;
        if ("options-replacespaces" in changes) replaceSpaces = changes["options-replacespaces"].newValue;
        if ("options-replacechar" in changes) replaceChar = changes["options-replacechar"].newValue;
        if ("options-maxfilenamelength" in changes) maxFileNameLength = changes["options-maxfilenamelength"].newValue;
        
        if ("options-savehtmlimagesall" in changes) saveHTMLImagesAll = changes["options-savehtmlimagesall"].newValue;
        if ("options-savehtmlaudiovideo" in changes) saveHTMLAudioVideo = changes["options-savehtmlaudiovideo"].newValue;
        if ("options-savehtmlobjectembed" in changes) saveHTMLObjectEmbed = changes["options-savehtmlobjectembed"].newValue;
        if ("options-savecssimagesall" in changes) saveCSSImagesAll = changes["options-savecssimagesall"].newValue;
        if ("options-savecssfontswoff" in changes) saveCSSFontsWoff = changes["options-savecssfontswoff"].newValue;
        if ("options-savecssfontsall" in changes) saveCSSFontsAll = changes["options-savecssfontsall"].newValue;
        if ("options-savescripts" in changes) saveScripts = changes["options-savescripts"].newValue;
        
        if ("options-maxframedepth" in changes) maxFrameDepth = changes["options-maxframedepth"].newValue;
        
        if ("options-maxresourcesize" in changes) maxResourceSize = changes["options-maxresourcesize"].newValue;
        
        if ("options-maxresourcetime" in changes) maxResourceTime = changes["options-maxresourcetime"].newValue;
        
        if ("options-forcelazyloads" in changes) forceLazyLoads = changes["options-forcelazyloads"].newValue;
        
        if ("options-lazyloadtime" in changes) lazyLoadTime = changes["options-lazyloadtime"].newValue;
        
        if ("options-allowpassive" in changes) allowPassive = changes["options-allowpassive"].newValue;
        
        if ("options-refererheader" in changes) refererHeader = changes["options-refererheader"].newValue;
        
        if ("options-purgeelements" in changes) purgeElements = changes["options-purgeelements"].newValue;
    });
    
    /* Message received listener */
    
    chrome.runtime.onMessage.addListener(
    function(message,sender,sendResponse)
    {
        var i,panel,bar;
        
        switch (message.type)
        {
            /* Messages from background page */
            
            case "performAction":
                
                sendResponse({ });  /* to confirm content script has been loaded */
                
                menuAction = message.menuaction;
                multipleTabs = message.multipletabs;
                externalSave = message.externalsave;
                swapDevices = message.swapdevices;
                
                /* Check if Print Edit WE is in editing mode */
                
                if (document.getElementById("printedit-gui-container") != null)
                {
                    showMessage("Operation failed","Operation","Print Edit WE must be suspended before performing this operation.",null,cancel);
                    
                    function cancel() { if (menuAction <= 2) chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false }); }
                    
                    break;
                }
                
                /* Close message panel if open */
                
                panel = document.getElementById("savepage-message-panel-container");
                
                if (panel != null) document.documentElement.removeChild(panel);
                
                /* Close unsaved resources panel if open */
                
                panel = document.getElementById("savepage-unsaved-panel-container");
                
                if (panel != null) document.documentElement.removeChild(panel);
                
                /* Close comments panel if open */
                
                panel = document.getElementById("savepage-comments-panel-container");
                
                if (panel != null) document.documentElement.removeChild(panel);
                
                /* Close page info panel if open */
                
                panel = document.getElementById("savepage-pageinfo-panel-container");
                
                if (panel != null) document.documentElement.removeChild(panel);
                
                /* Close page info bar if open */
                
                bar = document.getElementById("savepage-pageinfo-bar-container");
                
                if (bar != null) document.documentElement.removeChild(bar);
                
                /* Perform action */
                
                performAction(message.srcurl);
                
                break;
                
            case "loadSuccess":
                
                loadSuccess(message.index,message.content,message.contenttype,message.alloworigin);
                
                break;
                
            case "loadFailure":
                
                loadFailure(message.index,message.reason);
                
                break;
                
            case "replyFrame":
                
                i = frameKey.length;
                
                frameKey[i] = message.key;
                frameURL[i] = message.url;
                frameHTML[i] = message.html;
                frameFonts[i] = message.fonts;
                
                break;
        }
    });
}

/************************************************************************/

/* Perform action function */

function performAction(srcurl)
{
    var origscrolly,scrolly,delay;
    
    if (menuAction <= 2)  /* save page */
    {
        if (pageType < 2)  /* not saved page with resource loader */
        {
            if (forceLazyLoads)
            {
                chrome.runtime.sendMessage({ type: "setSaveState", savestate: 0 });
                
                origscrolly = window.scrollY;
                delay = 0;
                scrolly = 0;
                
                while (scrolly < document.documentElement.scrollHeight)
                {
                    window.setTimeout(function(y) { window.scrollTo(0,y); },delay,scrolly);
                    delay += lazyLoadTime*1000;  /* time between lazy load scroll steps */
                    scrolly += window.innerHeight
                }
                
                window.setTimeout(function(y) { window.scrollTo(0,y); initializeBeforeSave(); },delay+(lazyLoadTime*1000*0.5),origscrolly);  /* additional 50% delay for last step */
            }
            else initializeBeforeSave();
        }
        else  /* saved page with resource loader */
        {
            showMessage("Save Page failed","Save","This page was loaded using resource loader.\n\nRemove resource loader and then save page.",null,cancel);
            
            function cancel() { chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false }); }
        }
    }
    else if (menuAction == 3)  /* view saved page info */
    {
        if (pageType > 0)  /* saved page */
        {
            viewSavedPageInfo();
        }
        else  /* not saved page */
        {
            showMessage("View Saved Page Info failed","View Info","This page was not saved by Save Page WE.\n\nCannot perform this operation.",null,null);
        }
    }
    else if (menuAction == 4)  /* remove resource loader */
    {
        if (pageType == 2)  /* saved page with resource loader */
        {
            removeResourceLoader();
        }
        else  /* not saved page with resource loader */
        {
            if (pageType == 1) showMessage("Remove Resource Loader failed","Remove","This page was not loaded using resource loader.\n\nCannot perform this operation.",null,null);
            else showMessage("Remove Resource Loader failed","Remove","This page was not saved by Save Page WE.\n\nCannot perform this operation..",null,null);
        }
    }
    else if (menuAction == 5)  /* extract saved page media (image/audio/video) */
    {
        if (pageType > 0)  /* saved page */
        {
            extractSavedPageMedia(srcurl);
        }
        else  /* not saved page */
        {
            showMessage("Extract Image/Audio/Video failed","Extract","This page was not saved by Save Page WE.\n\nCannot perform this operation.",null,null);
        }
    }
}

/************************************************************************/

/* Initialize before save */

function initializeBeforeSave()
{
    /* Initialize resources */
    
    frameKey.length = 0;
    frameURL.length = 0;
    frameHTML.length = 0;
    frameFonts.length = 0;
    
    resourceLocation.length = 0;
    resourceReferer.length = 0;
    resourceMimeType.length = 0;
    resourceCharSet.length = 0;
    resourcePassive.length = 0;
    resourceContent.length = 0;
    resourceStatus.length = 0;
    resourceReason.length = 0;
    resourceRemembered.length = 0;
    resourceReplaced.length = 0;
    resourceCSSRemembered.length = 0;
    resourceCSSFrameKeys.length = 0;
    
    pageInfoBarText = "";
    enteredComments = "";
    
    htmlStrings.length = 0;
    
    htmlStrings[0] = "\uFEFF";  /* UTF-8 Byte Order Mark (BOM) - 0xEF 0xBB 0xBF */
    
    /* Identify all frames */
    
    chrome.runtime.sendMessage({ type: "requestFrames" });
    
    window.setTimeout(
    function()
    {
        var i;
        
        // for (i = 0; i < frameKey.length; i++)
        // {
            // console.log("Frame - " + (" " + i).substr(-2) + " - " + (frameKey[i] + "              ").substr(0,14) + " - " +
                        // (frameURL[i] + "                                                            ").replace(/\:/g,"").substr(0,80));
        // }
        
        gatherStyleSheets();
    },200);  /* allow time for all frames to reply */
}

/************************************************************************/

/* First Pass - to find external style sheets and load into arrays */

function gatherStyleSheets()
{
    passNumber = 1;
    
    chrome.runtime.sendMessage({ type: "setSaveState", savestate: 1 });
    
    timeStart[1] = performance.now();
    
    findStyleSheets(0,window,document.documentElement);
    
    timeFinish[1] = performance.now();
    
    loadResources();
}

function findStyleSheets(depth,frame,element)
{
    var i,baseuri,charset,csstext,regex,parser,framedoc;
    var matches = new Array();
    
    /* External style sheet imported in <style> element */
    
    if (element.localName == "style")
    {
        if (!element.disabled)
        {
            csstext = element.textContent;
            
            baseuri = element.ownerDocument.baseURI;
            
            charset = element.ownerDocument.characterSet;
            
            regex = /@import\s*(?:url\(\s*)?((?:"[^"]+")|(?:'[^']+')|(?:[^\s);]+))(?:\s*\))?\s*;/gi;  /* @import url() */
            
            while ((matches = regex.exec(csstext)) != null)
            {
                matches[1] = removeQuotes(matches[1]);
                
                if (!isSchemeDataOrMozExtension(matches[1]))  /* exclude existing data uri or moz-extension url */
                {
                    rememberURL(matches[1],baseuri,"text/css",charset,false);
                }
            }
        }
    }
    
    /* External style sheet referenced in <link> element */
    
    else if (element.localName == "link" && !(element.parentElement instanceof SVGElement))  /* <link> is invalid inside <svg> */
    {
        if (element.rel.toLowerCase() == "stylesheet" && element.getAttribute("href") != "" && element.href != "")  /* href attribute and property may be different */
        {
            if (!element.disabled)
            {
                if (!isSchemeDataOrMozExtension(element.href))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    if (element.charset != "") charset = element.charset;
                    else charset = element.ownerDocument.characterSet;
                    
                    rememberURL(element.href,baseuri,"text/css",charset,false);
                }
            }
        }
    }
    
    /* Handle nested frames and child elements */
    
    if (element.localName == "iframe" || element.localName == "frame")  /* frame elements */
    {
        if (depth < maxFrameDepth)
        {
            try
            {
                if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before finding */
                {
                    findStyleSheets(depth+1,element.contentWindow,element.contentDocument.documentElement);
                }
            }
            catch (e)  /* attempting cross-domain web page access */
            {
                if (retainCrossFrames)
                {
                    for (i = 0; i < frameKey.length; i++)
                    {
                        if (frameKey[i] == element.getAttribute("data-savepage-key")) break;
                    }
                    
                    if (i != frameKey.length)
                    {
                        parser = new DOMParser();
                        framedoc = parser.parseFromString(frameHTML[i],"text/html");
                        
                        findStyleSheets(depth+1,null,framedoc.documentElement);
                    }
                }
            }
        }
    }
    else
    {
        /* Handle shadow child elements */
        
        if (element.shadowRoot != null)
        {
            for (i = 0; i < element.shadowRoot.children.length; i++)
                if (element.shadowRoot.children[i] != null)  /* in case web page not fully loaded before finding */
                    findStyleSheets(depth,frame,element.shadowRoot.children[i]);
        }
        
        /* Handle normal child elements */
        
        for (i = 0; i < element.children.length; i++)
            if (element.children[i] != null)  /* in case web page not fully loaded before finding */
                findStyleSheets(depth,frame,element.children[i]);
    }
}

/************************************************************************/

/* Second Pass - to find other external resources and load into arrays */

function gatherOtherResources()
{
    var loadedfonts = new Array();
    
    passNumber = 2;
    
    iconFound = false;
    
    chrome.runtime.sendMessage({ type: "setSaveState", savestate: 2 });
    
    timeStart[2] = performance.now();
    
    document.fonts.forEach(  /* CSS Font Loading Module */
    function(font)
    {
        if (font.status == "loaded")  /* font is being used in this document */
        {
            loadedfonts.push({ family: font.family, weight: font.weight, style: font.style, stretch: font.stretch });
        }
    });
    
    findOtherResources(0,window,document.documentElement,false,false,loadedfonts,"0");
    
    timeFinish[2] = performance.now();
    
    loadResources();
}

function findOtherResources(depth,frame,element,crossframe,nosrcframe,loadedfonts,framekey)
{
    var i,j,displayed,style,csstext,baseuri,charset,currentsrc,passive,location,subframekey,parser,framedoc;
    
    if (crossframe)
    {
        /* In a cross-origin frame, the document created by DOMParser */
        /* does not have an associated frame window, which means that */
        /* the window.getComputedStyle() function cannot be called.   */
        
        /* Assume all elements are displayed and force saving of all CSS images */
        
        displayed = true;
    }
    else if ((style = frame.getComputedStyle(element)) == null) displayed = true;  /* should not happen */
    else
    {
        displayed = (style.getPropertyValue("display") != "none");
        
        /* External images referenced in any element's computed style */
        
        if ((menuAction == 0 || menuAction == 1 || (menuAction == 2 && !saveCSSImagesAll)) && displayed)
        {
            csstext = "";
            
            csstext += style.getPropertyValue("background-image") + " ";
            csstext += style.getPropertyValue("border-image-source") + " ";
            csstext += style.getPropertyValue("list-style-image") + " ";
            csstext += style.getPropertyValue("cursor") + " ";
            csstext += style.getPropertyValue("filter") + " ";
            csstext += style.getPropertyValue("clip-path") + " ";
            csstext += style.getPropertyValue("mask") + " ";
            
            style = frame.getComputedStyle(element,"::before");
            csstext += style.getPropertyValue("background-image") + " ";
            csstext += style.getPropertyValue("border-image-source") + " ";
            csstext += style.getPropertyValue("list-style-image") + " ";
            csstext += style.getPropertyValue("cursor") + " ";
            csstext += style.getPropertyValue("content") + " ";
            csstext += style.getPropertyValue("filter") + " ";
            csstext += style.getPropertyValue("clip-path") + " ";
            csstext += style.getPropertyValue("mask") + " ";
            
            style = frame.getComputedStyle(element,"::after");
            csstext += style.getPropertyValue("background-image") + " ";
            csstext += style.getPropertyValue("border-image-source") + " ";
            csstext += style.getPropertyValue("list-style-image") + " ";
            csstext += style.getPropertyValue("cursor") + " ";
            csstext += style.getPropertyValue("content") + " ";
            csstext += style.getPropertyValue("filter") + " ";
            csstext += style.getPropertyValue("clip-path") + " ";
            csstext += style.getPropertyValue("mask") + " ";
            
            style = frame.getComputedStyle(element,"::first-letter");
            csstext += style.getPropertyValue("background-image") + " ";
            csstext += style.getPropertyValue("border-image-source") + " ";
            
            style = frame.getComputedStyle(element,"::first-line");
            csstext += style.getPropertyValue("background-image") + " ";
            
            baseuri = element.ownerDocument.baseURI;
            
            rememberCSSImageURLs(csstext,baseuri,framekey);
        }
    }
    
    /* External images referenced in any element's style attribute */
    
    if (element.hasAttribute("style"))
    {
        if ((menuAction == 2 && saveCSSImagesAll) || crossframe)
        {
            csstext = element.getAttribute("style");
            
            baseuri = element.ownerDocument.baseURI;
            
            rememberCSSImageURLs(csstext,baseuri,framekey);
        }
    }
    
    /* External script referenced in <script> element */
    
    if (element.localName == "script")
    {
        if (element.src != "")
        {
            if ((menuAction == 2 && saveScripts) && !crossframe && !nosrcframe)
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    if (element.charset != "") charset = element.charset;
                    else charset = element.ownerDocument.characterSet;
                    
                    rememberURL(element.src,baseuri,"application/javascript",charset,false);
                }
            }
        }
    }
    
    /* External images or fonts referenced in <style> element */
    
    else if (element.localName == "style")
    {
        if (!element.disabled)
        {
            csstext = element.textContent;
            
            baseuri = element.ownerDocument.baseURI;
            
            rememberCSSURLsInStyleSheet(csstext,baseuri,crossframe,loadedfonts,[],framekey);
        }
    }
    
    /* External images or fonts referenced in <link> element */
    /* External icon referenced in <link> element */
    
    else if (element.localName == "link" && !(element.parentElement instanceof SVGElement))  /* <link> is invalid inside <svg> */
    {
        if (element.rel.toLowerCase() == "stylesheet" && element.getAttribute("href") != "" && element.href != "")  /* href attribute and property may be different */
        {
            if (!element.disabled)
            {
                if (!isSchemeDataOrMozExtension(element.href))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    if (baseuri != null)
                    {
                        location = resolveURL(element.href,baseuri);
                        
                        if (location != null)
                        {
                            for (i = 0; i < resourceLocation.length; i++)
                                if (resourceLocation[i] == location && resourceStatus[i] == "success") break;
                            
                            if (i < resourceLocation.length)  /* style sheet found */
                            {
                                csstext = resourceContent[i];
                                
                                baseuri = element.href;
                                
                                rememberCSSURLsInStyleSheet(csstext,baseuri,crossframe,loadedfonts,[location],framekey);
                            }
                        }
                    }
                }
            }
        }
        else if ((element.rel.toLowerCase() == "icon" || element.rel.toLowerCase() == "shortcut icon") && element.href != "")
        {
            iconFound = true;
            
            baseuri = element.ownerDocument.baseURI;
            
            rememberURL(element.href,baseuri,"image/vnd.microsoft.icon","",false);
        }
    }
    
    /* External image referenced in <body> element */
    
    else if (element.localName == "body")
    {
        if (element.background != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLImagesAll) ||
                (menuAction == 0 || (menuAction == 2 && !saveHTMLImagesAll)) && displayed)
            {
                if (!isSchemeDataOrMozExtension(element.background))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    rememberURL(element.background,baseuri,"image/png","",false);
                }
            }
        }
    }
    
    /* External image referenced in <img> element - can be inside <picture> element */
    
    else if (element.localName == "img")
    {
        /* currentSrc is set from src or srcset attributes on this <img> element */
        /* or from srcset attribute on <source> element inside <picture> element */
        
        /* Firefox - workaround because element.currentSrc may be null string in cross-origin frames */
        
        currentsrc = (element.currentSrc == "") ? element.src : element.currentSrc;
        
        if (currentsrc != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLImagesAll) ||
                (menuAction == 0 || (menuAction == 2 && !saveHTMLImagesAll)) && displayed)
            {
                if (!isSchemeDataOrMozExtension(currentsrc))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    passive = !((element.parentElement && element.parentElement.localName == "picture") || element.hasAttribute("srcset") || element.hasAttribute("crossorigin"));
                    
                    rememberURL(currentsrc,baseuri,"image/png","",passive);
                }
            }
        }
    }
    
    /* External image referenced in <input> element */
    
    else if (element.localName == "input")
    {
        if (element.type.toLowerCase() == "image" && element.src != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLImagesAll) ||
                (menuAction == 0 || (menuAction == 2 && !saveHTMLImagesAll)) && displayed)
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    rememberURL(element.src,baseuri,"image/png","",false);
                }
            }
        }
    }
    
    /* External audio referenced in <audio> element */
    
    else if (element.localName == "audio")
    {
        if (element.src != "")
        {
            if (element.src == element.currentSrc)
            {
                if (menuAction == 1 || (menuAction == 2 && saveHTMLAudioVideo))
                {
                    if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                    {
                        baseuri = element.ownerDocument.baseURI;
                        
                        passive = !element.hasAttribute("crossorigin");
                        
                        rememberURL(element.src,baseuri,"audio/mpeg","",passive);
                    }
                }
            }
        }
    }
    
    /* External video and image referenced in <video> element */
    
    else if (element.localName == "video")
    {
        if (element.src != "")
        {
            if (element.src == element.currentSrc)
            {
                if (menuAction == 1 || (menuAction == 2 && saveHTMLAudioVideo))
                {
                    if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                    {
                        baseuri = element.ownerDocument.baseURI;
                        
                        passive = !element.hasAttribute("crossorigin");
                        
                        rememberURL(element.src,baseuri,"video/mp4","",passive);
                    }
                }
            }
        }
        
        if (element.poster != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLAudioVideo))
            {
                if (menuAction == 1 || (menuAction == 2 && saveHTMLImagesAll) ||
                    (menuAction == 0 || (menuAction == 2 && !saveHTMLImagesAll)) && displayed)
                {
                    if (!isSchemeDataOrMozExtension(element.poster))  /* exclude existing data uri or moz-extension url */
                    {
                        baseuri = element.ownerDocument.baseURI;
                        
                        rememberURL(element.poster,baseuri,"image/png","",false);
                    }
                }
            }
        }
    }
    
    /* External audio/video/image referenced in <source> element */
    
    else if (element.localName == "source")
    {
        if (element.parentElement)
        {
            if (element.parentElement.localName == "audio" || element.parentElement.localName == "video")
            {
                if (element.src != "")
                {
                    if (element.src == element.parentElement.currentSrc)
                    {
                        if (menuAction == 1 || (menuAction == 2 && saveHTMLAudioVideo))
                        {
                            if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                            {
                                baseuri = element.ownerDocument.baseURI;
                                
                                passive = !element.parentElement.hasAttribute("crossorigin");
                                
                                if (element.parentElement.localName == "audio") rememberURL(element.src,baseuri,"audio/mpeg","",passive);
                                else if (element.parentElement.localName == "video") rememberURL(element.src,baseuri,"video/mp4","",passive);
                            }
                        }
                    }
                }
            }
        }
    }
    
    /* External subtitles referenced in <track> element */
    
    else if (element.localName == "track")
    {
        if (element.src != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLAudioVideo))
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    charset = element.ownerDocument.characterSet;
                    
                    rememberURL(element.src,baseuri,"text/vtt",charset,false);
                }
            }
        }
    }
    
    /* External data referenced in <object> element */
    
    else if (element.localName == "object")
    {
        if (element.data != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLObjectEmbed))
            {
                if (!isSchemeDataOrMozExtension(element.data))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    rememberURL(element.data,baseuri,"application/octet-stream","",false);
                }
            }
        }
    }
    
    /* External data referenced in <embed> element */
    
    else if (element.localName == "embed")
    {
        if (element.src != "")
        {
            if (menuAction == 1 || (menuAction == 2 && saveHTMLObjectEmbed))
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    rememberURL(element.src,baseuri,"application/octet-stream","",false);
                }
            }
        }
    }
    
    /* Handle nested frames and child elements */
    
    if (element.localName == "iframe" || element.localName == "frame")  /* frame elements */
    {
        if (depth < maxFrameDepth)
        {
            if (element.localName == "iframe") nosrcframe = nosrcframe || (element.src == "" && element.srcdoc == "");
            else nosrcframe = nosrcframe || element.src == "";
            
            subframekey = element.getAttribute("data-savepage-key");
            
            try
            {
                if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before finding */
                {
                    findOtherResources(depth+1,element.contentWindow,element.contentDocument.documentElement,crossframe,nosrcframe,loadedfonts,subframekey);
                }
            }
            catch (e)  /* attempting cross-domain web page access */
            {
                if (retainCrossFrames)
                {
                    for (i = 0; i < frameKey.length; i++)
                    {
                        if (frameKey[i] == subframekey) break;
                    }
                    
                    if (i != frameKey.length)
                    {
                        parser = new DOMParser();
                        framedoc = parser.parseFromString(frameHTML[i],"text/html");
                        
                        findOtherResources(depth+1,null,framedoc.documentElement,true,nosrcframe,frameFonts[i],subframekey);
                    }
                }
            }
        }
    }
    else
    {
        /* Handle shadow child elements */
        
        if (element.shadowRoot != null)
        {
            for (i = 0; i < element.shadowRoot.children.length; i++)
                if (element.shadowRoot.children[i] != null)  /* in case web page not fully loaded before finding */
                    findOtherResources(depth,frame,element.shadowRoot.children[i],crossframe,nosrcframe,loadedfonts,framekey);
        }
        
        /* Handle normal child elements */
        
        for (i = 0; i < element.children.length; i++)
            if (element.children[i] != null)  /* in case web page not fully loaded before finding */
                findOtherResources(depth,frame,element.children[i],crossframe,nosrcframe,loadedfonts,framekey);
                
        if (element.localName == "head" && depth == 0)
        {
            if (!iconFound)
            {
                baseuri = element.ownerDocument.baseURI;
                
                rememberURL("/favicon.ico",baseuri,"image/vnd.microsoft.icon","",false);
            }
        }
    }
}

function rememberCSSURLsInStyleSheet(csstext,baseuri,crossframe,loadedfonts,importstack,framekey)
{
    var i,regex,location,fontfamily,fontweight,fontstyle,fontstretch,fontmatches;
    var includeall,includewoff,usedfilefound,wofffilefound,srcregex,urlregex,fontfiletype;
    var matches = new Array();
    var propmatches = new Array();
    var srcmatches = new Array();
    var urlmatches = new Array();
    var fontweightvalues = new Array("normal","bold","bolder","lighter","100","200","300","400","500","600","700","800","900");
    var fontstretchvalues = new Array("normal","ultra-condensed","extra-condensed","condensed","semi-condensed","semi-expanded","expanded","extra-expanded","ultra-expanded");
    var fontstylevalues = new Array("normal","italic","oblique");
    
    /* @import url() or */
    /* @font-face rule or */
    /* image url() or */
    /* avoid matches inside double-quote strings or */
    /* avoid matches inside single-quote strings or */
    /* avoid matches inside comments */
    
    regex = new RegExp(/(?:@import\s*(?:url\(\s*)?((?:"[^"]+")|(?:'[^']+')|(?:[^\s);]+))(?:\s*\))?\s*;)|/.source +  /* matches[1] */
                       /(?:@font-face\s*({[^}]*}))|/.source +  /* matches[2] */
                       /(?:url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\))|/.source +  /* matches[3] */
                       /(?:"(?:\\"|[^"])*")|/.source +
                       /(?:'(?:\\'|[^'])*')|/.source +
                       /(?:\/\*(?:\*[^\/]|[^\*])*?\*\/)/.source,
                       "gi");
    
    while ((matches = regex.exec(csstext)) != null)  /* style sheet imported into style sheet */
    {
        if (matches[0].substr(0,7).toLowerCase() == "@import")  /* @import url() */
        {
            matches[1] = removeQuotes(matches[1]);
            
            if (!isSchemeDataOrMozExtension(matches[1]))  /* exclude existing data uri or moz-extension url */
            {
                if (baseuri != null)
                {
                    location = resolveURL(matches[1],baseuri);
                    
                    if (location != null)
                    {
                        for (i = 0; i < resourceLocation.length; i++)
                            if (resourceLocation[i] == location && resourceStatus[i] == "success") break;
                        
                        if (i < resourceLocation.length)  /* style sheet found */
                        {
                            if (importstack.indexOf(location) < 0)
                            {
                                importstack.push(location);
                                
                                rememberCSSURLsInStyleSheet(resourceContent[i],resourceLocation[i],crossframe,loadedfonts,importstack,framekey);
                                
                                importstack.pop();
                            }
                        }
                    }
                }
            }
        }
        else if (matches[0].substr(0,10).toLowerCase() == "@font-face")  /* @font-face rule */
        {
            includeall = (menuAction == 2 && saveCSSFontsAll);
            includewoff = (menuAction == 1 || (menuAction == 2 && saveCSSFontsWoff));
            
            propmatches = matches[2].match(/font-family\s*:\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s;}]+(?: [^\s;}]+)*))/i);
            if (propmatches == null) fontfamily = ""; else fontfamily = removeQuotes(propmatches[1]).toLowerCase();
            
            propmatches = matches[2].match(/font-weight\s*:\s*([^\s;}]*)/i);
            if (propmatches == null) fontweight = "normal";
            else if (fontweightvalues.indexOf(propmatches[1].toLowerCase()) < 0) fontweight = "normal";
            else fontweight = propmatches[1].toLowerCase();
            
            propmatches = matches[2].match(/font-style\s*:\s*([^\s;}]*)/i);
            if (propmatches == null) fontstyle = "normal";
            else if (fontstylevalues.indexOf(propmatches[1].toLowerCase()) < 0) fontstyle = "normal";
            else fontstyle = propmatches[1].toLowerCase();
            
            propmatches = matches[2].match(/font-stretch\s*:\s*([^\s;}]*)/i);
            if (propmatches == null) fontstretch = "normal";
            else if (fontstretchvalues.indexOf(propmatches[1].toLowerCase()) < 0) fontstretch = "normal";
            else fontstretch = propmatches[1].toLowerCase();
            
            fontmatches = false;
            
            for (i = 0; i < loadedfonts.length; i++)
            {
                if (removeQuotes(loadedfonts[i].family).toLowerCase() == fontfamily && loadedfonts[i].weight == fontweight &&
                    loadedfonts[i].style == fontstyle && loadedfonts[i].stretch == fontstretch) fontmatches = true;  /* font matches this @font-face rule */
            }
            
            if (fontmatches)
            {
                usedfilefound = false;
                wofffilefound = false;
                
                srcregex = /src:([^;}]*)[;}]/gi;  /* @font-face src list */
                
                while ((srcmatches = srcregex.exec(matches[2])) != null)  /* src: list of font file URL's */
                {
                    urlregex = /url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)(?:\s+format\(([^)]*)\))?/gi;  /* font url() and optional font format() list */
                    
                    while ((urlmatches = urlregex.exec(srcmatches[1])) != null)  /* font file URL */
                    {
                        urlmatches[1] = removeQuotes(urlmatches[1]);  /* url */
                        
                        if (!isSchemeDataOrMozExtension(urlmatches[1]))  /* exclude existing data uri or moz-extension url */
                        {
                            fontfiletype = "";
                            
                            if (typeof urlmatches[2] != "undefined")  /* font format() list */
                            {
                                urlmatches[2] = urlmatches[2].replace(/"/g,"'");
                                
                                if (urlmatches[2].indexOf("'woff2'") >= 0) fontfiletype = "woff2";  /* Firefox, Chrome & Opera */
                                else if (urlmatches[2].indexOf("'woff'") >= 0) fontfiletype = "woff";  /* all browsers */
                                else if (urlmatches[2].indexOf("'truetype'") >= 0) fontfiletype = "ttf";  /* all browsers */
                                else if (urlmatches[2].indexOf("'opentype'") >= 0) fontfiletype = "otf";  /* all browsers */
                            }
                            else
                            {
                                if (urlmatches[1].indexOf(".woff2") >= 0) fontfiletype = "woff2";  /* Firefox, Chrome & Opera */
                                else if (urlmatches[1].indexOf(".woff") >= 0 && urlmatches[1].indexOf(".woff2") < 0) fontfiletype = "woff";  /* all browsers */
                                else if (urlmatches[1].indexOf(".ttf") >= 0) fontfiletype = "ttf";  /* all browsers */
                                else if (urlmatches[1].indexOf(".otf") >= 0) fontfiletype = "otf";  /* all browsers */
                            }
                            
                            if (fontfiletype != "")
                            {
                                if (!usedfilefound)
                                {
                                    usedfilefound = true;  /* first font file supported by this browser - should be the one used by this browser */
                                    
                                    if (fontfiletype == "woff") wofffilefound = true;
                                    
                                    rememberURL(urlmatches[1],baseuri,"application/font-woff","",false);
                                }
                                else if (includewoff && fontfiletype == "woff")
                                {
                                    wofffilefound = true;  /* woff font file supported by all browsers */
                                    
                                    rememberURL(urlmatches[1],baseuri,"application/font-woff","",false);
                                }
                                else if (includeall)
                                {
                                    rememberURL(urlmatches[1],baseuri,"application/font-woff","",false);
                                }
                            }
                            
                            if (!includeall && (wofffilefound || (!includewoff && usedfilefound))) break;
                        }
                    }
                    
                    if (!includeall && (wofffilefound || (!includewoff && usedfilefound))) break;
                }
            }
        }
        else if (matches[0].substr(0,4).toLowerCase() == "url(")  /* image url() */
        {
            if ((menuAction == 2 && saveCSSImagesAll) || crossframe)
            {
                matches[3] = removeQuotes(matches[3]);
                
                if (!isSchemeDataOrMozExtension(matches[3]))  /* exclude existing data uri or moz-extension url */
                {
                    rememberCSSImageURL(matches[3],baseuri,"image/png","",false,framekey);
                }
            }
        }
        else if (matches[0].substr(0,1) == "\"") ;  /* double-quote string */
        else if (matches[0].substr(0,1) == "'") ;  /* single-quote string */
        else if (matches[0].substr(0,2) == "/*") ;  /* comment */
    }
}

function rememberCSSImageURLs(csstext,baseuri,framekey)
{
    var regex;
    var matches = new Array();
    
    regex = /url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;  /* image url() */
    
    while ((matches = regex.exec(csstext)) != null)
    {
        matches[1] = removeQuotes(matches[1]);
        
        if (!isSchemeDataOrMozExtension(matches[1]))  /* exclude existing data uri or moz-extension url */
        {
            rememberCSSImageURL(matches[1],baseuri,"image/png","",false,framekey);
        }
    }
}

function rememberCSSImageURL(url,baseuri,mimetype,charset,passive,framekey)
{
    var i,location;
    
    if (pageType > 0) return -1;  /* saved page - ignore new resources when re-saving */
    
    if (baseuri != null)
    {
        location = resolveURL(url,baseuri);
        
        if (location != null)
        {
            for (i = 0; i < resourceLocation.length; i++)
                if (resourceLocation[i] == location) break;
            
            if (i == resourceLocation.length)  /* new resource */
            {
                resourceLocation[i] = location;
                resourceReferer[i] = baseuri;
                resourceMimeType[i] = mimetype;  /* default if load fails */
                resourceCharSet[i] = charset;  /* default if load fails */
                resourcePassive[i] = passive;
                resourceContent[i] = "";  /* default if load fails */
                resourceStatus[i] = "pending";
                resourceReason[i] = "";
                resourceRemembered[i] = 1;
                resourceReplaced[i] = 0;
                resourceCSSRemembered[i] = 1;
                resourceCSSFrameKeys[i] = {};
                resourceCSSFrameKeys[i][framekey] = true;
                
                return i;
            }
            else  /* repeated resource */
            {
                resourceRemembered[i]++;
                resourceCSSRemembered[i]++;
                resourceCSSFrameKeys[i][framekey] = true;
            }
        }
    }
    
    return -1;
}

function rememberURL(url,baseuri,mimetype,charset,passive)
{
    var i,location;
    
    if (pageType > 0) return -1;  /* saved page - ignore new resources when re-saving */
    
    if (baseuri != null)
    {
        location = resolveURL(url,baseuri);
        
        if (location != null)
        {
            for (i = 0; i < resourceLocation.length; i++)
                if (resourceLocation[i] == location) break;
            
            if (i == resourceLocation.length)  /* new resource */
            {
                resourceLocation[i] = location;
                resourceReferer[i] = baseuri;
                resourceMimeType[i] = mimetype;  /* default if load fails */
                resourceCharSet[i] = charset;  /* default if load fails */
                resourcePassive[i] = passive;
                resourceContent[i] = "";  /* default if load fails */
                resourceStatus[i] = "pending";
                resourceReason[i] = "";
                resourceRemembered[i] = 1;
                resourceReplaced[i] = 0;
                resourceCSSRemembered[i] = 0;
                resourceCSSFrameKeys[i] = {};
                
                return i;
            }
            else  /* repeated resource */
            {
                resourceRemembered[i]++;
            }
        }
    }
    
    return -1;
}

/************************************************************************/

/* After first or second pass - load resources */


function loadResources()
{
    var i,documentURL,useCORS;
    
    timeStart[passNumber+3] = performance.now();
    
    resourceCount = 0;
    
    for (i = 0; i < resourceLocation.length; i++)
    {
        if (resourceStatus[i] == "pending") 
        {
            resourceCount++;
            
            documentURL = new URL(document.baseURI);
            
            useCORS = (resourceMimeType[i] == "application/font-woff");
            
            chrome.runtime.sendMessage({ type: "loadResource", index: i, location: resourceLocation[i], referer: resourceReferer[i],
                                         passive: resourcePassive[i], pagescheme: documentURL.protocol, usecors: useCORS });
        }
    }
    
    if (resourceCount <= 0)
    {
        timeFinish[passNumber+3] = performance.now();
    
        if (passNumber == 1) gatherOtherResources();
        else if (passNumber == 2) loadInfoBar();
    }
}

function loadSuccess(index,content,contenttype,alloworigin)
{
    var i,mimetype,charset,resourceURL,frameURL,csstext,baseuri,regex,documentURL;
    var matches = new Array();
    
    /* Extract file MIME type and character set */
    
    matches = contenttype.match(/([^;]+)/i);
    if (matches != null) mimetype = matches[1].toLowerCase();
    else mimetype = "";
    
    matches = contenttype.match(/;charset=([^;]+)/i);
    if (matches != null) charset = matches[1].toLowerCase();
    else charset = "";
    
    /* Process file based on expected MIME type */
    
    switch (resourceMimeType[index].toLowerCase())  /* expected MIME type */
    {
        case "application/font-woff":  /* font file */
            
            /* CORS check required */
            
            if (alloworigin != "*")  /* restricted origin */
            {
                resourceURL = new URL(resourceLocation[index]);
                frameURL = new URL(resourceReferer[index]);
                
                if (resourceURL.origin != frameURL.origin &&  /* cross-origin resource */
                    (alloworigin == "" || alloworigin != frameURL.origin))  /* either no header or no origin match */
                {
                    loadFailure(index,"cors");
                    return;
                }
            }
            
        case "image/png":  /* image file */
        case "image/vnd.microsoft.icon":  /* icon file */
        case "audio/mpeg":  /* audio file */
        case "video/mp4":  /* video file */
        case "application/octet-stream":  /* data file */
            
            if (mimetype != "") resourceMimeType[index] = mimetype;
            
            resourceContent[index] = content;
            
            break;
            
        case "application/javascript":  /* javascript file */
            
            if (mimetype != "application/javascript" && mimetype != "application/x-javascript" && mimetype != "application/ecmascript" &&
                mimetype != "application/json" && mimetype != "text/javascript" && mimetype != "text/x-javascript" && mimetype != "text/json")  /* incorrect MIME type */
            {
                loadFailure(index,"mime");
                return;
            }
            
        case "text/vtt":  /* subtitles file */
            
            if (mimetype != "") resourceMimeType[index] = mimetype;
            if (charset != "") resourceCharSet[index] = charset;
            
            if (content.charCodeAt(0) == 0xEF && content.charCodeAt(1) == 0xBB && content.charCodeAt(2) == 0xBF)  /* BOM */
            {
                resourceCharSet[index] = "utf-8";
                content = content.substr(3);
            }
            
            if (resourceCharSet[index].toLowerCase() == "utf-8")
            {
                try
                {
                    resourceContent[index] = convertUTF8ToUTF16(content);  /* UTF-8 */
                }
                catch (e)
                {
                    resourceCharSet[index] = "iso-8859-1";  /* assume ISO-8859-1 */
                    resourceContent[index] = content;
                }
            }
            else resourceContent[index] = content;  /* ASCII, ANSI, ISO-8859-1, etc */
            
            break;
            
        case "text/css":  /* css file */
            
            if (mimetype != "text/css")  /* incorrect MIME type */
            {
                loadFailure(index,"mime");
                return;
            }
            
            matches = content.match(/^@charset "([^"]+)";/i);
            if (matches != null) resourceCharSet[index] = matches[1];
            
            if (charset != "") resourceCharSet[index] = charset;
            
            if (content.charCodeAt(0) == 0xEF && content.charCodeAt(1) == 0xBB && content.charCodeAt(2) == 0xBF)  /* BOM */
            {
                resourceCharSet[index] = "utf-8";
                content = content.substr(3);
            }
            
            if (resourceCharSet[index].toLowerCase() == "utf-8")
            {
                try
                {
                    resourceContent[index] = convertUTF8ToUTF16(content);  /* UTF-8 */
                }
                catch (e)
                {
                    resourceCharSet[index] = "iso-8859-1";  /* assume ISO-8859-1 */
                    resourceContent[index] = content;
                }
            }
            else resourceContent[index] = content;  /* ASCII, ANSI, ISO-8859-1, etc */
            
            /* External style sheets imported in external style sheet */
            
            csstext = resourceContent[index];
            
            baseuri = resourceLocation[index];
            
            regex = /@import\s*(?:url\(\s*)?((?:"[^"]+")|(?:'[^']+')|(?:[^\s);]+))(?:\s*\))?\s*;/gi;  /* @import url() */
            
            while ((matches = regex.exec(csstext)) != null)  /* style sheet imported into style sheet */
            {
                matches[1] = removeQuotes(matches[1]);
                
                if (!isSchemeDataOrMozExtension(matches[1]))  /* exclude existing data uri or moz-extension url */
                {
                    i = rememberURL(matches[1],baseuri,"text/css",resourceCharSet[index],false);
                    
                    if (i >= 0)  /* style sheet not found */
                    {
                        resourceCount++;
                        
                        documentURL = new URL(document.baseURI);
                        
                        chrome.runtime.sendMessage({ type: "loadResource", index: i, location: resourceLocation[i], referer: resourceReferer[i],
                                                     passive: resourcePassive[i], pagescheme: documentURL.protocol, useCORS: false });
                    }
                }
            }
            
            break;
    }
    
    resourceStatus[index] = "success";
    
    if (--resourceCount <= 0)
    {
        timeFinish[passNumber+3] = performance.now();
        
        if (passNumber == 1) gatherOtherResources();
        else if (passNumber == 2) loadInfoBar(); 
    }
}

function loadFailure(index,reason)
{
    resourceStatus[index] = "failure";
    
    resourceReason[index] = reason;
    
    if (--resourceCount <= 0)
    {
        timeFinish[passNumber+3] = performance.now();
        
        if (passNumber == 1) gatherOtherResources();
        else if (passNumber == 2) loadInfoBar();
    }
}

/************************************************************************/

/* After second pass - load local files */

function loadInfoBar()
{
    var xhr;
    
    if (includeInfoBar)
    {
        xhr = new XMLHttpRequest();
        xhr.open("GET",chrome.runtime.getURL("pageinfo-bar-compressed.html"),true);
        xhr.onload = complete;
        xhr.send();
    }
    else loadShadowLoader();
    
    function complete()
    {
        if (xhr.status == 200)
        {
            pageInfoBarText = xhr.responseText;
            
            loadShadowLoader();
        }
    }
}

function loadShadowLoader()
{
    var xhr;
    
    xhr = new XMLHttpRequest();
    xhr.overrideMimeType("application/javascript");
    xhr.open("GET",chrome.runtime.getURL("shadowloader-compressed.js"),true);
    xhr.onload = complete;
    xhr.send();
    
    function complete()
    {
        if (xhr.status == 200)
        {
            shadowLoaderText = xhr.responseText;
            
            checkResources();
        }
    }
}

/************************************************************************/

/* After second pass - check resources */

function checkResources()
{
    var i,dataurisize,skipcount,failcount,iconlocation,count;
    var skipinflist = new Array();
    var skipurllist = new Array();
    var failinflist = new Array();
    var failurllist = new Array();
    
    /* Check for large resource sizes and failed resource loads */
    
    if (pageType == 0)  /* not saved page */
    {
        dataurisize = 0;
        skipcount = 0;
        failcount = 0;
        
        iconlocation = resolveURL("/favicon.ico",document.baseURI);
        
        for (i = 0; i < resourceLocation.length; i++)
        {
            if (resourceCharSet[i] == "")  /* charset not defined - binary data */
            {
                count = mergeCSSImages ? resourceRemembered[i]-resourceCSSRemembered[i]+Object.keys(resourceCSSFrameKeys[i]).length : resourceRemembered[i];
                
                if (resourceContent[i].length*count > maxResourceSize*1024*1024)  /* skip large and/or repeated resource */
                {
                    skipcount++;
                    skipinflist.push((resourceContent[i].length*count/(1024*1024)).toFixed(1) + " MB");
                    try { skipurllist.push(decodeURIComponent(resourceLocation[i])); }
                    catch (e) { skipurllist.push(resourceLocation[i]); }
                }
                else dataurisize += resourceContent[i].length*count*(4/3);  /* base64 expands by 4/3 */
            }
            
            if (resourceStatus[i] == "failure")
            {
                if (!iconFound && resourceLocation[i] == iconlocation && resourceMimeType[i] == "image/vnd.microsoft.icon" && resourceReason[i] == "load:404")
                {
                    resourceLocation.splice(i,1);
                    resourceReferer.splice(i,1);
                    resourceMimeType.splice(i,1);
                    resourceCharSet.splice(i,1);
                    resourcePassive.splice(i,1);
                    resourceContent.splice(i,1);
                    resourceStatus.splice(i,1);
                    resourceReason.splice(i,1);
                    resourceRemembered.splice(i,1);
                    resourceReplaced.splice(i,1);
                    resourceCSSRemembered.splice(i,1);
                    resourceCSSFrameKeys.splice(i,1);
                    i--;
                }
                else
                {
                    failcount++;
                    failinflist.push(resourceReason[i]);
                    try { failurllist.push(decodeURIComponent(resourceLocation[i])); }
                    catch (e) { failurllist.push(resourceLocation[i]); }
                }
            }
        }
        
        if (dataurisize > maxTotalSize*1024*1024)
        {
            showMessage("Total size of resources is too large","Save",
                        "Cannot save page because the total size of resources exceeds " + maxTotalSize + "MB.\n\n" +
                        "It may be possible to save this page by trying these suggestions:\n\n" +
                        "    •  Save Basic Items.\n" +
                        "    •  Save Custom Items with some items disabled.\n" +
                        "    •  Reduce the 'Maximum size allowed for a resource' option value.",
                        null,
                        function savecancel()
                        {
                            chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
                            
                            chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false });
                        });
        }
        else if (showWarning && !(skipWarningsComments && multipleTabs))
        {
            if (skipcount > 0)
            {
                showMessage("Some resources exceed maximum size","Save",
                            skipcount + " of " + resourceLocation.length + " resources exceed maximum size allowed.\n\n" +
                            "It may be possible to save these resources by trying these suggestions:\n\n" +
                            "    •  Increase the 'Maximum size allowed for a resource' option value.",
                            function savecontinue()
                            {
                                if (failcount > 0) someResourcesNotLoaded();
                                else if (showURLList) showUnsavedResources();
                                else enterComments();
                            },
                            function savecancel()
                            {
                                chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
                                
                                chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false });
                            });
            }
            else if (failcount > 0) someResourcesNotLoaded();
            else enterComments();
        }
        else if (showURLList && !(skipWarningsComments && multipleTabs))
        {
            if (skipcount > 0 || failcount > 0) showUnsavedResources();
            else enterComments();
        }
        else enterComments();
    }
    else enterComments();
    
    function someResourcesNotLoaded()
    {
        showMessage("Some resources could not be loaded","Save",
            failcount + " of " + resourceLocation.length + " resources could not be loaded.\n\n" +
            "It may be possible to load these resources by trying these suggestions:\n\n" +
            "    •  Scroll to the bottom of the page before saving.\n" +
            "    •  Use normal browing instead of private browsing.\n" +
            "    •  Enable the 'Allow passive mixed content' option.\n" +
            "    •  Select one of the 'Send referer header with origin ...' options.\n" +
            "    •  Increase the 'Maximum time for loading a resource' option value.",
            function savecontinue()
            {
                if (showURLList) showUnsavedResources();
                else enterComments();
            },
            function savecancel()
            {
                chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
                
                chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false });
            });
    }
    
    function showUnsavedResources()
    {
        var i,xhr,parser,unsaveddoc,container,div;
        
        /* Load unsaved resources panel */
        
        xhr = new XMLHttpRequest();
        xhr.open("GET",chrome.runtime.getURL("unsaved-panel.html"),true);
        xhr.onload = complete;
        xhr.send();
        
        function complete()
        {
            if (xhr.status == 200)
            {
                /* Parse unsaved resources document */
                
                parser = new DOMParser();
                unsaveddoc = parser.parseFromString(xhr.responseText,"text/html");
                
                /* Create container element */
                
                container = document.createElement("div");
                container.setAttribute("id","savepage-unsaved-panel-container");
                document.documentElement.appendChild(container);
                
                /* Append unsaved resources elements */
                
                container.appendChild(unsaveddoc.getElementById("savepage-unsaved-panel-style"));
                container.appendChild(unsaveddoc.getElementById("savepage-unsaved-panel-overlay"));
                
                /* Add listeners for buttons */
                
                document.getElementById("savepage-unsaved-panel-continue").addEventListener("click",clickContinueOne,false);
                document.getElementById("savepage-unsaved-panel-cancel").addEventListener("click",clickCancel,false);
                
                /* Focus continue button */
                
                document.getElementById("savepage-unsaved-panel-continue").focus();
                
                /* Populate skipped resources */
                
                if (skipurllist.length > 0)
                {
                    document.getElementById("savepage-unsaved-panel-header").textContent = "Resources that exceed maximum size";
                    
                    for (i = 0; i < skipurllist.length; i++)
                    {
                        div = document.createElement("div");
                        div.textContent = (i+1);
                        document.getElementById("savepage-unsaved-panel-nums").appendChild(div);
                        
                        div = document.createElement("div");
                        div.textContent = skipinflist[i];
                        document.getElementById("savepage-unsaved-panel-infs").appendChild(div);
                        
                        div = document.createElement("div");
                        div.textContent = skipurllist[i];
                        document.getElementById("savepage-unsaved-panel-urls").appendChild(div);
                    }
                    
                    /* Select this tab */
                    
                    chrome.runtime.sendMessage({ type: "selectTab" });
                }
                else clickContinueOne();
            }
        }
        
        function clickContinueOne()
        {
            var i,div;
            
            /* Remove skipped resources */
            
            if (skipurllist.length > 0)
            {
                for (i = 0; i < skipurllist.length; i++)
                {
                    document.getElementById("savepage-unsaved-panel-nums").removeChild(document.getElementById("savepage-unsaved-panel-nums").children[0]);
                    document.getElementById("savepage-unsaved-panel-infs").removeChild(document.getElementById("savepage-unsaved-panel-infs").children[0]);
                    document.getElementById("savepage-unsaved-panel-urls").removeChild(document.getElementById("savepage-unsaved-panel-urls").children[0]);
                }
                
                skipurllist.length = 0;
            }
            
            /* Change listener for continue button */
            
            document.getElementById("savepage-unsaved-panel-continue").removeEventListener("click",clickContinueOne,false);
            document.getElementById("savepage-unsaved-panel-continue").addEventListener("click",clickContinueTwo,false);
            
            /* Change text alignment of information column */
            
            document.getElementById("savepage-unsaved-panel-infs").style.setProperty("text-align","left","important");
            
            /* Populate failed resources */
            
            if (failurllist.length > 0)
            {
                document.getElementById("savepage-unsaved-panel-header").textContent = "Resources that could not be loaded";
                
                for (i = 0; i < failurllist.length; i++)
                {
                    div = document.createElement("div");
                    div.textContent = (i+1);
                    document.getElementById("savepage-unsaved-panel-nums").appendChild(div);
                    
                    div = document.createElement("div");
                    div.textContent = failinflist[i];
                    document.getElementById("savepage-unsaved-panel-infs").appendChild(div);
                    
                    div = document.createElement("div");
                    div.textContent = failurllist[i];
                    document.getElementById("savepage-unsaved-panel-urls").appendChild(div);
                }
                
                failurllist.length = 0;
                
                /* Select this tab */
                
                chrome.runtime.sendMessage({ type: "selectTab" });
            }
            else clickContinueTwo();
        }
        
        function clickContinueTwo()
        {
            document.documentElement.removeChild(document.getElementById("savepage-unsaved-panel-container"));
            
            enterComments();
        }
        
        function clickCancel()
        {
            document.documentElement.removeChild(document.getElementById("savepage-unsaved-panel-container"));
            
            chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
            
            chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false });
        }
    }
}

function showMessage(messagetitle,buttonsuffix,messagetext,continuefunction,cancelfunction)
{
    var xhr,parser,messagedoc,container;
    
    xhr = new XMLHttpRequest();
    xhr.open("GET",chrome.runtime.getURL("message-panel.html"),true);
    xhr.onload = complete;
    xhr.send();
    
    function complete()
    {
        if (xhr.status == 200)
        {
            /* Parse message document */
            
            parser = new DOMParser();
            messagedoc = parser.parseFromString(xhr.responseText,"text/html");
            
            /* Create container element */
            
            container = document.createElement("div");
            container.setAttribute("id","savepage-message-panel-container");
            document.documentElement.appendChild(container);
            
            /* Append message elements */
            
            container.appendChild(messagedoc.getElementById("savepage-message-panel-style"));
            container.appendChild(messagedoc.getElementById("savepage-message-panel-overlay"));
            
            /* Set title, button names and contents */
            
            document.getElementById("savepage-message-panel-header").textContent = messagetitle;
            document.getElementById("savepage-message-panel-continue").textContent = "Continue " + buttonsuffix;
            document.getElementById("savepage-message-panel-cancel").textContent = "Cancel " + buttonsuffix;
            document.getElementById("savepage-message-panel-text").textContent = messagetext;
            
            /* Add listeners for buttons */
            
            document.getElementById("savepage-message-panel-cancel").addEventListener("click",clickCancel,false);
            document.getElementById("savepage-message-panel-continue").addEventListener("click",clickContinue,false);
            
            /* Configure for one or two buttons */
            
            if (continuefunction != null)
            {
                /* Focus continue button */
                
                document.getElementById("savepage-message-panel-continue").focus();
            }
            else
            {
                /* Hide continue button */
                
                document.getElementById("savepage-message-panel-continue").style.setProperty("display","none","important");
                
                /* Focus cancel button */
                
                document.getElementById("savepage-message-panel-cancel").focus();
            }
            
            /* Select this tab */
            
            chrome.runtime.sendMessage({ type: "selectTab" });
        }
    }
    
    function clickContinue()
    {
        document.documentElement.removeChild(document.getElementById("savepage-message-panel-container"));
        
        continuefunction();
    }
    
    function clickCancel()            
    {
        document.documentElement.removeChild(document.getElementById("savepage-message-panel-container"));
        
        cancelfunction();
    }
}

/************************************************************************/

/* After second pass - prompt user to enter comments */

function enterComments()
{
    var i,xhr,parser,commentsdoc,container,comments;
    
    /* Load comments panel */
    
    if (promptComments && !(skipWarningsComments && multipleTabs))
    {
        xhr = new XMLHttpRequest();
        xhr.open("GET",chrome.runtime.getURL("comments-panel.html"),true);
        xhr.onload = complete;
        xhr.send();
    }
    else window.setTimeout(function() { generateHTML(); },10);  /* allow time for any open panel to close */
    
    function complete()
    {
        if (xhr.status == 200)
        {
            /* Parse comments document */
            
            parser = new DOMParser();
            commentsdoc = parser.parseFromString(xhr.responseText,"text/html");
            
            /* Create container element */
            
            container = document.createElement("div");
            container.setAttribute("id","savepage-comments-panel-container");
            document.documentElement.appendChild(container);
            
            /* Append page info elements */
            
            container.appendChild(commentsdoc.getElementById("savepage-comments-panel-style"));
            container.appendChild(commentsdoc.getElementById("savepage-comments-panel-overlay"));
            
            /* Add listeners for buttons */
            
            document.getElementById("savepage-comments-panel-continue").addEventListener("click",clickContinue,false);
            document.getElementById("savepage-comments-panel-cancel").addEventListener("click",clickCancel,false);
            
            /* Focus text area */
            
            document.getElementById("savepage-comments-panel-textarea").focus();
            
            /* Populate comments contents */
            
            if (pageType > 0)  /* saved page */
            {
                comments = document.querySelector("meta[name='savepage-comments']").content;  /* decodes HTML entities */
                
                document.getElementById("savepage-comments-panel-textarea").value = comments;
            }
            
            /* Select this tab */
            
            chrome.runtime.sendMessage({ type: "selectTab" });
        }
    }
    
    function clickContinue()
    {
        var comments;
        
        comments = document.getElementById("savepage-comments-panel-textarea").value;
        
        comments = comments.replace(/&/g,"&amp;");
        comments = comments.replace(/"/g,"&quot;");
        comments = comments.replace(/\u000A/g,"&NewLine;");
        
        enteredComments = comments;
        
        document.documentElement.removeChild(document.getElementById("savepage-comments-panel-container"));
        
        window.setTimeout(function() { generateHTML(); },10);  /* allow time for enter comments panel to close */
    }
    
    function clickCancel()
    {
        document.documentElement.removeChild(document.getElementById("savepage-comments-panel-container"));
        
        chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
        
        chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: false });
    }
}

/************************************************************************/

/* Third Pass - to generate HTML and save to file */

function generateHTML()
{
    var i,j,totalscans,totalloads,maxstrsize,totalstrsize,count,mimetype,charset,pageurl,filename,htmlBlob,objectURL,link;
    
    passNumber = 3;
    
    chrome.runtime.sendMessage({ type: "setSaveState", savestate: 3 });
    
    /* Generate HTML */
    
    timeStart[3] = performance.now();
    
    extractHTML(0,window,document.documentElement,false,false,"0",0,0);
    
    timeFinish[3] = performance.now();
    
    /* Append metrics and resource summary */
    
    if (includeSummary)
    {
        totalscans = timeFinish[1]-timeStart[1]+timeFinish[2]-timeStart[2]+timeFinish[3]-timeStart[3];
        totalloads = timeFinish[4]-timeStart[4]+timeFinish[5]-timeStart[5];
        
        htmlStrings[htmlStrings.length] = "\n\n<!--\n\n";
        
        htmlStrings[htmlStrings.length] = "SAVE PAGE WE\n\n";
        
        htmlStrings[htmlStrings.length] = "Metrics and Resource Summary\n\n";
        
        htmlStrings[htmlStrings.length] = "Pass 1 scan:  " + ("     " + Math.round(timeFinish[1]-timeStart[1])).substr(-6) + " ms\n";
        htmlStrings[htmlStrings.length] = "Pass 2 scan:  " + ("     " + Math.round(timeFinish[2]-timeStart[2])).substr(-6) + " ms\n";
        htmlStrings[htmlStrings.length] = "Pass 3 scan:  " + ("     " + Math.round(timeFinish[3]-timeStart[3])).substr(-6) + " ms\n";
        htmlStrings[htmlStrings.length] = "Total scans:  " + ("     " + Math.round(totalscans)).substr(-6) + " ms\n\n";
        
        htmlStrings[htmlStrings.length] = "Pass 1 loads: " + ("     " + Math.round(timeFinish[4]-timeStart[4])).substr(-6) + " ms\n";
        htmlStrings[htmlStrings.length] = "Pass 2 loads: " + ("     " + Math.round(timeFinish[5]-timeStart[5])).substr(-6) + " ms\n";
        htmlStrings[htmlStrings.length] = "Total loads:  " + ("     " + Math.round(totalloads)).substr(-6) + " ms\n\n";
        
        htmlStrings[htmlStrings.length] = "String count:     "  + ("    " + htmlStrings.length).substr(-5) + "\n";
        
        maxstrsize = totalstrsize = 0;
        
        for (i = 0; i < htmlStrings.length; i++)
        {
            totalstrsize += htmlStrings[i].length;
            
            if (htmlStrings[i].length > maxstrsize) maxstrsize = htmlStrings[i].length;
        }
        
        htmlStrings[htmlStrings.length] = "Max size:      "  + ("       " + maxstrsize).substr(-8) + "\n";
        htmlStrings[htmlStrings.length] = "Total size:   "  + ("        " + totalstrsize).substr(-9) + "\n\n";
        
        htmlStrings[htmlStrings.length] = "Resource count:    "  + ("   " + resourceLocation.length).substr(-4) + "\n";
        
        if (pageType == 0)
        {
            htmlStrings[htmlStrings.length] = "\nNum  Refs  Reps  Status   Reason    MimeType    CharSet   ByteSize    URL\n\n";
            
            for (i = 0; i < resourceLocation.length; i++)
            {
                count = mergeCSSImages ? resourceRemembered[i]-resourceCSSRemembered[i]+Object.keys(resourceCSSFrameKeys[i]).length : resourceRemembered[i];
                
                j = resourceMimeType[i].indexOf("/");
                
                mimetype = resourceMimeType[i].substr(0,j).substr(0,5);
                mimetype += "/";
                mimetype += resourceMimeType[i].substr(j+1,4);
                
                charset = (resourceCharSet[i] == "") ? "binary" : resourceCharSet[i];
                
                htmlStrings[htmlStrings.length] = ("   " + i).substr(-3) + "  " +
                                                  ("    " + resourceRemembered[i]).substr(-4) + "  " +
                                                  ("    " + resourceReplaced[i]).substr(-4) + "  " +
                                                  resourceStatus[i] + "  " +
                                                  (resourceReason[i] + "        ").substr(0,8) + "  " +
                                                  (mimetype + "          ").substr(0,10) + "  " +
                                                  (charset + "        ").substr(0,8) + "  " +
                                                  ("        " + resourceContent[i].length).substr(-8) + "    " +
                                                  resourceLocation[i] + "\n";
            }
        }
        
        htmlStrings[htmlStrings.length] = "\n-->\n";
    }
    
    /* Release resources */
    
    frameKey.length = 0;
    frameURL.length = 0;
    frameHTML.length = 0;
    frameFonts.length = 0;
    
    resourceLocation.length = 0;
    resourceReferer.length = 0;
    resourceMimeType.length = 0;
    resourceCharSet.length = 0;
    resourcePassive.length = 0;
    resourceContent.length = 0;
    resourceStatus.length = 0;
    resourceReason.length = 0;
    resourceRemembered.length = 0;
    resourceReplaced.length = 0;
    resourceCSSRemembered.length = 0;
    resourceCSSFrameKeys.length = 0;
    
    pageInfoBarText = "";
    enteredComments = "";
    
    /* Code to test large saved file sizes */
    
    // var fileSizeMB = 1024;
    
    // var string32 = "|--abcdefghijklmnopqrstuvwxyz--|"
    
    // htmlStrings.length = 0;
    
    // for (i = 0; i < fileSizeMB; i++)
    // {
        // htmlStrings[i] = "";
        
        // for (j = 0; j < 1024*1024/32; j++) htmlStrings[i] += string32;
    // }
    
    /* Save to file using HTML5 download attribute */
    
    pageurl = (pageType == 0) ? document.URL : document.querySelector("meta[name='savepage-url']").content;
    
    filename = getSavedFileName(pageurl,document.title,false);
    
    htmlBlob = new Blob(htmlStrings, { type : "text/html" });
    
    objectURL = window.URL.createObjectURL(htmlBlob);
    
    htmlStrings.length = 0;
    
    link = document.createElement("a");
    link.download = filename;
    link.href = objectURL;
    
    link.addEventListener("click",handleClick,true);
    
    link.dispatchEvent(new MouseEvent("click"));  /* save page as .html file */
    
    link.removeEventListener("click",handleClick,true);
    
    chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
    
    chrome.runtime.sendMessage({ type: "saveDone", external: externalSave, success: true });
    
    window.setTimeout(
    function()
    {
        window.URL.revokeObjectURL(objectURL);
    },100);
    
    function handleClick(event)
    {
        event.stopPropagation();
    }
}

function extractHTML(depth,frame,element,crossframe,nosrcframe,framekey,parentpreserve,indent)
{
    var i,j,prefix,style,inline,preserve,property,displayed,startTag,endTag,textContent,baseuri,location,csstext,origurl,datauri,origstr;
    var visible,width,height,currentsrc,subframekey,htmltext,startindex,endindex,origsrcdoc,origsandbox,parser,framedoc,doctype,target,text,asciistring,date,pageurl,state;
    var retainElements = new Array("html","head","body","base","command","link","meta","noscript","script","style","template","title");
    var voidElements = new Array("area","base","br","col","command","embed","frame","hr","img","input","keygen","link","menuitem","meta","param","source","track","wbr");
    var htmlFrameStrings = new Array();
    var matches = new Array();
    
    /* Determine if element is phrasing content - set inline based on CSS display value */
    
    /* Determine if element format should be preserved - set preserve based on CSS white-space value */
    /*   0 = collapse newlines, collapse spaces (normal or nowrap) */
    /*   1 = preserve newlines, collapse spaces (pre-line)         */
    /*   2 = preserve newlines, preserve spaces (pre or pre-wrap)  */
    
    if (pageType == 0 && formatHTML && depth == 0)
    {
        if (crossframe)
        {
            /* In a cross-origin frame, the document created by DOMParser */
            /* does not have an associated frame window, which means that */
            /* the window.getComputedStyle() function cannot be called.   */
            
            /* Assume all elements are block with collapsed newlines and spaces */
            
            inline = false;
            preserve = 0;
        }
        else if ((style = frame.getComputedStyle(element)) == null)  /* should not happen */
        {
            inline = false;
            preserve = 0;
        }
        else
        {
            property = style.getPropertyValue("display");
            if (property.indexOf("inline") >= 0) inline = true;
            else inline = false;
            
            property = style.getPropertyValue("white-space");
            if (property == "pre" || property == "pre-wrap") preserve = 2;
            else if (property == "pre-line") preserve = 1;
            else /* normal or nowrap */ preserve = 0;
        }
    }
    else
    {
        inline = false;
        preserve = 0;
    }
    
    /* Purge elements that have been collapsed by the page, page editors or content blockers - so are not displayed */
    
    if (purgeElements)
    {
        if (crossframe)
        {
            /* In a cross-origin frame, the document created by DOMParser */
            /* does not have an associated frame window, which means that */
            /* the window.getComputedStyle() function cannot be called.   */
            
            /* Assume all elements are displayed */
            
            displayed = true;
        }
        else if ((style = frame.getComputedStyle(element)) == null) displayed = true;  /* should not happen */
        else displayed = (style.getPropertyValue("display") != "none");  /* element collapsed */
    }
    else displayed = true;
    
    /* Do not purge essential HTML elements */
    /* Do not purge <svg> elements because child elements may be referenced by <use> elements in other <svg> elements */
    
    if (retainElements.indexOf(element.localName) < 0 && !(element instanceof SVGElement) && !displayed) return;
    
    /* Extract HTML from DOM and replace external resources with data URI's */
    
    startTag = "<" + element.localName;
    for (i = 0; i < element.attributes.length; i++)
    {
        if (element.attributes[i].name != "zoompage-fontsize")
        {
            startTag += " " + element.attributes[i].name;
            startTag += "=\"";
            startTag += element.attributes[i].value.replace(/"/g,"&quot;");
            startTag += "\"";
        }
    }
    startTag += ">";
    
    textContent = "";
    
    if (voidElements.indexOf(element.localName) >= 0) endTag = "";
    else endTag = "</" + element.localName + ">";
    
    /* External images referenced in any element's style attribute */
    
    if (element.hasAttribute("style"))
    {
        csstext = element.getAttribute("style");
        
        baseuri = element.ownerDocument.baseURI;
        
        csstext = replaceCSSImageURLs(csstext,baseuri,framekey);
        
        startTag = startTag.split("style=\"" + element.getAttribute("style").replace(/"/g,"&quot;") + "\"").join("style=\"" + csstext.replace(/"/g,"&quot;") + "\"");
    }
    
    /* Internal script in <script> element */
    /* External script in <script> element */
    
    if (element.localName == "script")
    {
        if (!element.hasAttribute("src"))  /* internal script */
        {
            if ((menuAction == 2 && saveScripts) && !crossframe && !nosrcframe) textContent = element.textContent;
        }
        else /* external script */
        {
            if ((menuAction == 2 && saveScripts) && element.src != "" && !crossframe && !nosrcframe)
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    origurl = element.getAttribute("src");
                    
                    datauri = replaceURL(origurl,baseuri);
                    
                    origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                    
                    startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                }
            }
            else
            {
                origurl = element.getAttribute("src");
                
                origstr = " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + "");  /* replacing with src="" would be invalid HTML */
            }
        }
    }
    
    /* External images or fonts referenced in <style> element */
    
    else if (element.localName == "style")
    {
        if (element.id == "zoompage-pageload-style" || element.id == "zoompage-zoomlevel-style" || element.id == "zoompage-fontsize-style")  /* Zoom Page WE */
        {
            startTag = "";
            endTag = "";
            textContent = "";
        }
        else if (element.hasAttribute("class") && element.getAttribute("class").indexOf("darkreader") >= 0)  /* Dark Reader*/
        {
            startTag = "";
            endTag = "";
            textContent = "";
        }
        else
        {
            if (!element.disabled)
            {
                try
                {
                    if (element.sheet.cssRules.length > 0)
                    {
                        /* There may be rules in element.sheet.cssRules that are not in element.textContent */ 

                        /* This is often the case for CSS-in-JS libraries, for example: */
                        /* - Styled Components Issue #1571 */
                        /* - Styled Components >= v4 - data-styled attribute - e.g. observationdeck.kinja.com pages */
                        /* - Styled Components <= v3 - data-styled-components attribute - e.g. reddit.com pages */
                        /* - Styled JSX - data-styled-jsx attribute - e.g. www.flightstats.com pages */
                        /* - React Native - id="react-native-stylesheet" attribute - e.g. twitter.com pages */
                        /* - React-JSS or JSS - data-jss attribute - e.g. https://www.dailykos.com */
                        /* - Glamor - data-glamor attribute - e.g. https://www.dailykos.com */
                        /* - Emotion - data-emotion attribute - not tested */
                        /* - Aphrodite - data-aphrodite attribute - not tested */
                        /* - Styletron - data-styletron attribute - not tested */
                        /* - Unknown - data-lights - e.g. https://www.nytimes.com */
                        
                        csstext = "";
                        
                        for (i = 0; i < element.sheet.cssRules.length; i++)
                            csstext += element.sheet.cssRules[i].cssText + "\n";
                    }
                    else csstext = element.textContent;
                }
                catch (e)  /* sheet.cssRules does not exist or cross-origin style sheet */
                {
                    csstext = element.textContent;
                }
                
                baseuri = element.ownerDocument.baseURI;
                
                textContent = replaceCSSURLsInStyleSheet(csstext,baseuri,[],framekey);
                
                if (swapDevices) textContent = swapScreenAndPrintDevices(textContent);
            }
            else
            {
                startTag = startTag.replace(/<style/,"<style data-savepage-disabled=\"\"");
                
                textContent = "";
            }
        }
    }
    
    /* External images or fonts referenced in <link> element */
    /* External icon referenced in <link> element */
    
    else if (element.localName == "link" && !(element.parentElement instanceof SVGElement))  /* <link> is invalid inside <svg> */
    {
        if (element.rel.toLowerCase() == "stylesheet" && element.getAttribute("href") != "" && element.href != "")  /* href attribute and property may be different */
        {
            if (!element.disabled)
            {
                if (!isSchemeDataOrMozExtension(element.href))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    if (baseuri != null)
                    {
                        location = resolveURL(element.href,baseuri);
                        
                        if (location != null)
                        {
                            for (i = 0; i < resourceLocation.length; i++)
                                if (resourceLocation[i] == location && resourceStatus[i] == "success") break;
                            
                            if (i < resourceLocation.length)  /* style sheet found */
                            {
                                csstext = resourceContent[i];
                                
                                /* Converting <link> into <style> means that CSS rules are embedded in saved HTML file */
                                /* Therefore need to escape any </style> end tags that may appear inside CSS strings */
                                
                                csstext = csstext.replace(/<\/style>/gi,"<\\/style>");
                                
                                baseuri = element.href;
                                
                                textContent = replaceCSSURLsInStyleSheet(csstext,baseuri,[location],framekey);
                                
                                if (swapDevices) textContent = swapScreenAndPrintDevices(textContent);
                                
                                startTag = "<style data-savepage-href=\"" + element.getAttribute("href") + "\"";
                                if (element.type != "") startTag += " type=\"" + element.type + "\"";
                                if (element.media != "") startTag += " media=\"" + element.media + "\"";
                                startTag += ">";
                                endTag = "</style>";
                                
                                resourceReplaced[i]++;
                            }
                        }
                    }
                }
            }
            else
            {
                origurl = element.getAttribute("href");
                
                origstr = " data-savepage-href=\"" + origurl + "\" data-savepage-disabled=\"\"";
                
                startTag = startTag.replace(/ href="[^"]*"/,origstr + " href=\"\"");
            }
        }
        else if ((element.rel.toLowerCase() == "icon" || element.rel.toLowerCase() == "shortcut icon") && element.href != "")
        {
            if (!isSchemeDataOrMozExtension(element.href))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("href");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-href=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ href="[^"]*"/,origstr + " href=\"" + datauri + "\"");
            }
        }
    }
    else if (element.localName == "link" && (element.parentElement instanceof SVGElement))
    {
        /* Workaround for <link> element inside <svg> fragment which is invalid */
        
        startTag = "";
        endTag = "";
    }
    
    /* External image referenced in <body> element */
    
    else if (element.localName == "body")
    {
        if (element.background != "")
        {
            if (!isSchemeDataOrMozExtension(element.background))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("background");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-background=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ background="[^"]*"/,origstr + " background=\"" + datauri + "\"");
            }
        }
    }
    
    /* External image referenced in <img> element - can be inside <picture> element */
    
    else if (element.localName == "img")
    {
        /* Purge images that have been hidden by the page, page editors or content blockers - so are not visible */
        
        if (purgeElements)
        {
            if (crossframe)
            {
                /* In a cross-origin frame, the document created by DOMParser */
                /* does not have an associated frame window, which means that */
                /* the window.getComputedStyle() function cannot be called.   */
                
                /* Assume all images are visible */
                
                visible = true;
            }
            else if ((style = frame.getComputedStyle(element)) == null) visible = true;  /* should not happen */
            else visible = (style.getPropertyValue("visibility") != "hidden" && style.getPropertyValue("opacity") != "0");  /* element hidden */
        }
        else visible = true;
        
        if (!visible)
        {
            width = style.getPropertyValue("width");
            height = style.getPropertyValue("height");
            
            startTag = "<img data-savepage-purge=\"\" style=\"display: inline-block; width: " + width + "; height: " + height + ";\">";
        }
        else
        {
            /* currentSrc is set from src or srcset attributes on this <img> element */
            /* or from srcset attribute on <source> element inside <picture> element */
            
            /* Firefox - workaround because element.currentSrc may be null string in cross-origin frames */
            
            currentsrc = (element.currentSrc == "") ? element.src : element.currentSrc;
            
            if (currentsrc != "")
            {
                if (element.src == currentsrc)  /* currentSrc set from src attribute */
                {
                    if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                    {
                        baseuri = element.ownerDocument.baseURI;
                        
                        origurl = element.getAttribute("src");
                        
                        datauri = replaceURL(origurl,baseuri);
                        
                        origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                        
                        startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                    }
                }
                else  /* currentSrc set from srcset attribute */
                {
                    if (!isSchemeDataOrMozExtension(currentsrc))  /* exclude existing data uri or moz-extension url */
                    {
                        baseuri = element.ownerDocument.baseURI;
                        
                        origurl = (element.src == "") ? "" : element.getAttribute("src");
                        
                        datauri = replaceURL(currentsrc,baseuri);
                        
                        origstr = " data-savepage-src=\"" + origurl + "\"" + " data-savepage-currentsrc=\"" + currentsrc + "\"";
                        
                        if (element.src != "") startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                        else startTag = startTag.replace(/<img/,"<img" + origstr + " src=\"" + datauri + "\"");
                    }
                    else if (element.currentSrc.substr(0,5).toLowerCase() == "data:")  /* existing data uri */
                    {
                        origurl = (element.src == "") ? "" : element.getAttribute("src");
                        
                        datauri = currentsrc;
                        
                        origstr = " data-savepage-src=\"" + origurl + "\"";
                        
                        if (element.src != "") startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                        else startTag = startTag.replace(/<img/,"<img" + origstr + " src=\"" + datauri + "\"");
                    }
                }
            }
            
            if (element.srcset != "")
            {
                origurl = element.getAttribute("srcset");
                
                origstr = " data-savepage-srcset=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ srcset="[^"]*"/,origstr + "");  /* replacing with srcset="" would be invalid HTML */
            }
        }
    }
    
    /* External image referenced in <input> element */
    /* Reinstate checked state or text value of <input> element */
    
    else if (element.localName == "input")
    {
        if (element.type.toLowerCase() == "image" && element.src != "")
        {
            if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("src");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
            }
        }
        
        if (element.type.toLowerCase() == "file" || element.type.toLowerCase() == "password")
        {
            /* maintain security */
            
            if (element.hasAttribute("value")) startTag = startTag.replace(/ value="[^"]*"/," value=\"\"");
            else startTag = startTag.replace(/>$/," value=\"\">");
        }
        else if (element.type.toLowerCase() == "checkbox" || element.type.toLowerCase() == "radio")
        {
            if (!element.checked) startTag = startTag.replace(/ checked="[^"]*"/,"");
            else if (!element.hasAttribute("checked")) startTag = startTag.replace(/>$/," checked=\"\">");
        }
        else
        {
            if (element.hasAttribute("value")) startTag = startTag.replace(/ value="[^"]*"/," value=\"" + element.value + "\"");
            else startTag = startTag.replace(/>$/," value=\"" + element.value + "\">");
        }
    }
    
    /* Reinstate text value of <textarea> element */
    
    else if (element.localName == "textarea")
    {
        textContent = element.value;
    }
    
    /* Reinstate selected state of <option> element */
    
    else if (element.localName == "option")
    {
        if (element.selected) startTag = startTag.replace(/ selected="[^"]*"/," selected=\"\"");
        else startTag = startTag.replace(/ selected="[^"]*"/,"");
    }
    
    /* External audio referenced in <audio> element */
    
    else if (element.localName == "audio")
    {
        if (element.src != "")
        {
            if (element.src == element.currentSrc)
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    origurl = element.getAttribute("src");
                    
                    datauri = replaceURL(origurl,baseuri);
                    
                    origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                    
                    startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                }
            }
            else if (removeUnsavedURLs)
            {
                origurl = element.getAttribute("src");
                
                origstr = " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"\"");
            }
        }
    }
    
    /* External video referenced in <video> element */
    
    else if (element.localName == "video")
    {
        if (element.src != "")
        {
            if (element.src == element.currentSrc)
            {
                if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    origurl = element.getAttribute("src");
                    
                    datauri = replaceURL(origurl,baseuri);
                    
                    origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                    
                    startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                }
            }
            else if (removeUnsavedURLs)
            {
                origurl = element.getAttribute("src");
                
                origstr = " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"\"");
            }
        }
        
        if (element.poster != "")
        {
            if (!isSchemeDataOrMozExtension(element.poster))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("poster");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-poster=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ poster="[^"]*"/,origstr + " poster=\"" + datauri + "\"");
            }
        }
    }
    
    /* External audio/video/image referenced in <source> element */
    
    else if (element.localName == "source")
    {
        if (element.parentElement)
        {
            if (element.parentElement.localName == "audio" || element.parentElement.localName == "video")
            {
                if (element.src != "")
                {
                    if (element.src == element.parentElement.currentSrc)
                    {
                        if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
                        {
                            baseuri = element.ownerDocument.baseURI;
                            
                            origurl = element.getAttribute("src");
                            
                            datauri = replaceURL(origurl,baseuri);
                            
                            origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                            
                            startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                        }
                    }
                    else if (removeUnsavedURLs)
                    {
                        origurl = element.getAttribute("src");
                        
                        origstr = " data-savepage-src=\"" + origurl + "\"";
                        
                        startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"\"");
                    }
                }
            }
            else if (element.parentElement.localName == "picture")
            {
                if (element.srcset != "")
                {
                    if (removeUnsavedURLs)
                    {
                        origurl = element.getAttribute("srcset");
                        
                        origstr = " data-savepage-srcset=\"" + origurl + "\"";
                        
                        startTag = startTag.replace(/ srcset="[^"]*"/,origstr + " srcset=\"\"");
                    }
                }
            }
        }
    }
    
    /* External subtitles referenced in <track> element */
    
    else if (element.localName == "track")
    {
        if (element.src != "")
        {
            if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("src");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
            }
        }
    }
    
    /* External data referenced in <object> element */
    
    else if (element.localName == "object")
    {
        if (element.data != "")
        {
            if (!isSchemeDataOrMozExtension(element.data))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("data");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-data=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ data="[^"]*"/,origstr + " data=\"" + datauri + "\"");
            }
        }
    }
    
    /* External data referenced in <embed> element */
    
    else if (element.localName == "embed")
    {
        if (element.src != "")
        {
            if (!isSchemeDataOrMozExtension(element.src))  /* exclude existing data uri or moz-extension url */
            {
                baseuri = element.ownerDocument.baseURI;
                
                origurl = element.getAttribute("src");
                
                datauri = replaceURL(origurl,baseuri);
                
                origstr = (datauri == origurl) ? "" : " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
            }
        }
    }
    
    /* Handle nested frames and child elements & text nodes & comment nodes */
    /* Generate HTML into array of strings */
    
    if (element.localName == "iframe")  /* iframe elements */
    {
        if (pageType == 0)
        {
            if (depth < maxFrameDepth)
            {
                nosrcframe = nosrcframe || (element.src == "" && element.srcdoc == "");
                
                subframekey = element.getAttribute("data-savepage-key");
                
                try
                {
                    if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before extracting */
                    {
                        startindex = htmlStrings.length;
                        
                        extractHTML(depth+1,element.contentWindow,element.contentDocument.documentElement,crossframe,nosrcframe,subframekey,preserve,indent+2);
                        
                        endindex = htmlStrings.length;
                        
                        htmlFrameStrings = htmlStrings.splice(startindex,endindex-startindex);
                        
                        htmltext = htmlFrameStrings.join("");
                        
                        htmltext = htmltext.replace(/&/g,"&amp;");
                        htmltext = htmltext.replace(/"/g,"&quot;");
                        
                        if (pageType == 0 && formatHTML && depth == 0)
                        {
                            htmltext = htmltext.replace(/\n/g,newlineIndent(indent+2));
                            htmltext = newlineIndent(indent+2) + "<!-- srcdoc begin -->" + newlineIndent(indent+2) + htmltext;
                            htmltext += newlineIndent(indent+2) + "<!-- srcdoc end -->";
                        }
                        
                        startTag = startTag.replace(/<iframe/,"<iframe data-savepage-sameorigin=\"\"");
                        
                        if (element.hasAttribute("srcdoc"))
                        {
                            origsrcdoc = element.getAttribute("srcdoc");
                            
                            origstr = " data-savepage-srcdoc=\"" + origsrcdoc + "\"";
                            
                            startTag = startTag.replace(/ srcdoc="[^"]*"/,origstr + " srcdoc=\"" + htmltext + "\"");
                        }
                        else startTag = startTag.replace(/<iframe/,"<iframe srcdoc=\"" + htmltext + "\"");
                    }
                }
                catch (e)  /* attempting cross-domain web page access */
                {
                    if (retainCrossFrames)
                    {
                        for (i = 0; i < frameKey.length; i++)
                        {
                            if (frameKey[i] == subframekey) break;
                        }
                        
                        if (i != frameKey.length)
                        {
                            parser = new DOMParser();
                            framedoc = parser.parseFromString(frameHTML[i],"text/html");
                            
                            startindex = htmlStrings.length;
                            
                            extractHTML(depth+1,null,framedoc.documentElement,true,nosrcframe,subframekey,preserve,indent+2);
                            
                            endindex = htmlStrings.length;
                            
                            htmlFrameStrings = htmlStrings.splice(startindex,endindex-startindex);
                            
                            htmltext = htmlFrameStrings.join("");
                            
                            htmltext = htmltext.replace(/&/g,"&amp;");
                            htmltext = htmltext.replace(/"/g,"&quot;");
                            
                            if (pageType == 0 && formatHTML && depth == 0)
                            {
                                htmltext = htmltext.replace(/\n/g,newlineIndent(indent+2));
                                htmltext = newlineIndent(indent+2) + "<!-- srcdoc begin -->" + newlineIndent(indent+2) + htmltext;
                                htmltext += newlineIndent(indent+2) + "<!-- srcdoc end -->";
                            }
                            
                            startTag = startTag.replace(/<iframe/,"<iframe data-savepage-crossorigin=\"\"");
                            
                            if (element.hasAttribute("srcdoc"))
                            {
                                origsrcdoc = element.getAttribute("srcdoc");
                                
                                origstr = " data-savepage-srcdoc=\"" + origsrcdoc + "\"";
                                
                                startTag = startTag.replace(/ srcdoc="[^"]*"/,origstr + " srcdoc=\"" + htmltext + "\"");
                            }
                            else startTag = startTag.replace(/<iframe/,"<iframe srcdoc=\"" + htmltext + "\"");
                            
                            if (element.hasAttribute("sandbox"))  /* prevent scripts executing in cross-origin frames */
                            {
                                origsandbox = element.getAttribute("sandbox");
                                
                                origstr = " data-savepage-sandbox=\"" + origsandbox + "\"";
                                
                                startTag = startTag.replace(/ sandbox="[^"]*"/,origstr + " sandbox=\"\"");
                            }
                            else startTag = startTag.replace(/<iframe/,"<iframe sandbox=\"\"");
                        }
                    }
                }
            }
            
            if (element.hasAttribute("src"))
            {
                origurl = element.getAttribute("src");
                
                origstr = " data-savepage-src=\"" + origurl + "\"";
                
                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"\"");
            }
            
            if (pageType == 0 && formatHTML && depth == 0 && !inline && parentpreserve == 0) htmlStrings[htmlStrings.length] = newlineIndent(indent);
        }
        
        htmlStrings[htmlStrings.length] = startTag;
        htmlStrings[htmlStrings.length] = endTag;
    }
    else if (element.localName == "frame")  /* frame elements */
    {
        if (pageType == 0)
        {
            datauri = null;
            
            if (depth < maxFrameDepth)
            {
                nosrcframe = nosrcframe || element.src == "";
                
                subframekey = element.getAttribute("data-savepage-key");
                
                try
                {
                    if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before extracting */
                    {
                        startindex = htmlStrings.length;
                        
                        extractHTML(depth+1,element.contentWindow,element.contentDocument.documentElement,crossframe,nosrcframe,subframekey,preserve,indent+2);
                        
                        endindex = htmlStrings.length;
                        
                        htmlFrameStrings = htmlStrings.splice(startindex,endindex-startindex);
                        
                        htmltext = htmlFrameStrings.join("");
                        
                        datauri = "data:text/html;charset=utf-8," + encodeURIComponent(htmltext);
                        
                        startTag = startTag.replace(/<frame/,"<frame data-savepage-sameorigin=\"\"");
                        
                        if (element.hasAttribute("src"))
                        {
                            origurl = element.getAttribute("src");
                            
                            origstr = " data-savepage-src=\"" + origurl + "\"";
                            
                            startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                        }
                        else startTag = startTag.replace(/<frame/,"<frame src=\"" + datauri + "\"");
                    }
                }
                catch (e)  /* attempting cross-domain web page access */
                {
                    if (retainCrossFrames)
                    {
                        for (i = 0; i < frameKey.length; i++)
                        {
                            if (frameKey[i] == subframekey) break;
                        }
                        
                        if (i != frameKey.length)
                        {
                            parser = new DOMParser();
                            framedoc = parser.parseFromString(frameHTML[i],"text/html");
                            
                            startindex = htmlStrings.length;
                            
                            extractHTML(depth+1,null,framedoc.documentElement,true,nosrcframe,subframekey,preserve,indent+2);
                            
                            endindex = htmlStrings.length;
                            
                            htmlFrameStrings = htmlStrings.splice(startindex,endindex-startindex);
                            
                            htmltext = htmlFrameStrings.join("");
                            
                            datauri = "data:text/html;charset=utf-8," + encodeURIComponent(htmltext);
                            
                            startTag = startTag.replace(/<frame/,"<frame data-savepage-crossorigin=\"\"");
                            
                            if (element.hasAttribute("src"))
                            {
                                origurl = element.getAttribute("src");
                                
                                origstr = " data-savepage-src=\"" + origurl + "\"";
                                
                                startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"" + datauri + "\"");
                            }
                            else startTag = startTag.replace(/<frame/,"<frame src=\"" + datauri + "\"");
                        }
                    }
                }
            }
            
            if (datauri == null)
            {
                if (element.src != "")
                {
                    if (removeUnsavedURLs)
                    {
                        origurl = element.getAttribute("src");
                        
                        origstr = " data-savepage-src=\"" + origurl + "\"";
                        
                        startTag = startTag.replace(/ src="[^"]*"/,origstr + " src=\"\"");
                    }
                }
            }
            
            if (pageType == 0 && formatHTML && depth == 0 && !inline && parentpreserve == 0) htmlStrings[htmlStrings.length] = newlineIndent(indent);
        }
        
        htmlStrings[htmlStrings.length] = startTag;
    }
    else
    {
        if (element.localName == "html")
        {
            /* Add !DOCTYPE declaration */
            
            doctype = element.ownerDocument.doctype;
            
            if (doctype != null)
            {
                htmltext = '<!DOCTYPE ' + doctype.name + (doctype.publicId ? ' PUBLIC "' + doctype.publicId + '"' : '') +
                           ((doctype.systemId && !doctype.publicId) ? ' SYSTEM' : '') + (doctype.systemId ? ' "' + doctype.systemId + '"' : '') + '>';
                
                htmlStrings[htmlStrings.length] = htmltext;
            }
            
            htmlStrings[htmlStrings.length] = startTag;
        }
        else if (element.localName == "head")
        {
            if (formatHTML && depth == 0) htmlStrings[htmlStrings.length] = newlineIndent(indent);
            htmlStrings[htmlStrings.length] = startTag;
            
            /* Add <base> element to make relative URL's work in saved file */
            
            if (element.ownerDocument.head.querySelector("base") != null) target = element.ownerDocument.head.querySelector("base").target;
            else target = "";
            
            prefix = (formatHTML && depth == 0) ? "\n    " : "\n";
    
            htmltext = prefix + "<base href=\"" + element.ownerDocument.baseURI + "\"";
            if (target != "") htmltext += " target=\"" + target + "\"";
            htmltext += ">";
            
            htmlStrings[htmlStrings.length] = htmltext;
        }
        else if (startTag != "")
        {
            if (pageType == 0 && formatHTML && depth == 0 && !inline && parentpreserve == 0) htmlStrings[htmlStrings.length] = newlineIndent(indent);
            htmlStrings[htmlStrings.length] = startTag;
        }
        
        if (element.localName == "style" ||  /* <style> element */
            element.localName == "script" ||  /* <script> element */
            (element.localName == "link" && !(element.parentElement instanceof SVGElement) &&  /* <link> is invalid inside <svg> */
             element.rel.toLowerCase() == "stylesheet" && element.getAttribute("href") != "" && element.href != ""))  /* <link rel="stylesheet" href="..."> element */
        {
            if (formatHTML && depth == 0)
            {
                textContent = textContent.trim();
                if (pageType == 0) textContent = textContent.replace(/\n/g,newlineIndent(indent+2));
                if (textContent != "") textContent = newlineIndent(indent+2) + textContent;
                textContent += newlineIndent(indent);
            }
            
            htmlStrings[htmlStrings.length] = textContent;
        }
        else if (element.localName == "textarea")  /* <textarea> element */
        {
            textContent = textContent.replace(/&/g,"&amp;");
            textContent = textContent.replace(/</g,"&lt;");
            textContent = textContent.replace(/>/g,"&gt;");
            
            htmlStrings[htmlStrings.length] = textContent;
        }
        else if (voidElements.indexOf(element.localName) >= 0) ;  /* void element */
        else
        {
            /* Handle shadow child nodes */
            
            if (element.shadowRoot != null)
            {
                if (pageType == 0 && formatHTML && depth == 0)
                {
                    htmlStrings[htmlStrings.length] = newlineIndent(indent);
                    indent += 2;
                }
                
                htmlStrings[htmlStrings.length] = "<template data-savepage-shadowroot=\"\">";
                
                for (i = 0; i < element.shadowRoot.childNodes.length; i++)
                {
                    if (element.shadowRoot.childNodes[i] != null)  /* in case web page not fully loaded before extracting */
                    {
                        if (element.shadowRoot.childNodes[i].nodeType == 1)  /* element node */
                        {
                            extractHTML(depth,frame,element.shadowRoot.childNodes[i],crossframe,nosrcframe,framekey,preserve,indent+2);
                        }
                        else if (element.shadowRoot.childNodes[i].nodeType == 3)  /* text node */
                        {
                            text = element.shadowRoot.childNodes[i].textContent;
                            
                            if (element.shadowRoot.localName != "noscript")
                            {
                                text = text.replace(/&/g,"&amp;");
                                text = text.replace(/</g,"&lt;");
                                text = text.replace(/>/g,"&gt;");
                            }
                            
                            if (pageType == 0 && formatHTML && depth == 0)
                            {
                                /* HTML whitespace == HTML space characters == spaces + newlines */
                                /* HTML spaces: space (U+0020), tab (U+0009), form feed (U+000C) */
                                /* HTML newlines: line feed (U+000A) or carriage return (U+000D) */
                                
                                if (preserve == 0) text = text.replace(/[\u0020\u0009\u000C\u000A\u000D]+/g," ");
                                else if (preserve == 1) text = text.replace(/[\u0020\u0009\u000C]+/g," ");
                            }
                            
                            htmlStrings[htmlStrings.length] = text;
                        }
                        else if (element.shadowRoot.childNodes[i].nodeType == 8)  /* comment node */
                        {
                            text = element.shadowRoot.childNodes[i].textContent;
                            
                            if (pageType == 0 && formatHTML && depth == 0 && !inline && preserve == 0)
                            {
                                text = text.replace(/\n/g,newlineIndent(indent+2));
                                
                                htmlStrings[htmlStrings.length] = newlineIndent(indent+2);
                            }
                            
                            htmlStrings[htmlStrings.length] = "<!--" + text + "-->";
                        }
                    }
                }
                
                if (pageType == 0 && formatHTML && depth == 0)
                {
                    indent -= 2;
                    htmlStrings[htmlStrings.length] = newlineIndent(indent);
                }
                
                htmlStrings[htmlStrings.length] = "</template>";
            }
            
            /* Handle normal child nodes */
            
            for (i = 0; i < element.childNodes.length; i++)
            {
                if (element.childNodes[i] != null)  /* in case web page not fully loaded before extracting */
                {
                    if (element.childNodes[i].nodeType == 1)  /* element node */
                    {
                        /* Skip existing <base> elements and Save Page WE <script> and <meta> elements */
                        
                        if (element.childNodes[i].localName == "base") continue;
                        
                        if (depth == 0)
                        {
                            if (element.childNodes[i].localName == "script" && element.childNodes[i].id.substr(0,8) == "savepage") continue;
                            if (element.childNodes[i].localName == "meta" && element.childNodes[i].name.substr(0,8) == "savepage") continue;
                        }
                        
                        /* Handle other element nodes */
                        
                        extractHTML(depth,frame,element.childNodes[i],crossframe,nosrcframe,framekey,preserve,indent+2);
                    }
                    else if (element.childNodes[i].nodeType == 3)  /* text node */
                    {
                        text = element.childNodes[i].textContent;
                        
                        /* Skip text nodes before skipped elements/comments and at end of <head>/<body> elements */
                        
                        if (pageType > 0 && formatHTML && depth == 0)
                        {
                            if (text.trim() == "" && (i+1) < element.childNodes.length && element.childNodes[i+1].nodeType == 1)
                            {
                                if (element.childNodes[i+1].localName == "base") continue;
                                if (element.childNodes[i+1].localName == "script" && element.childNodes[i+1].id.substr(0,8) == "savepage") continue;
                                if (element.childNodes[i+1].localName == "meta" && element.childNodes[i+1].name.substr(0,8) == "savepage") continue;
                            }
                                
                            if (text.trim() == "" && (i+1) < element.childNodes.length && element.childNodes[i+1].nodeType == 8)
                            {
                                if (element.childNodes[i+1].textContent.indexOf("SAVE PAGE WE") >= 0) continue;
                            }
                            
                            if (text.trim() == "" && i == element.childNodes.length-1)
                            {
                                if (element.localName == "head") continue;
                                if (element.localName == "body") continue;
                            }
                        }
                        
                        /* Handle other text nodes */
                        
                        if (element.localName != "noscript")
                        {
                            text = text.replace(/&/g,"&amp;");
                            text = text.replace(/</g,"&lt;");
                            text = text.replace(/>/g,"&gt;");
                        }
                        
                        if (pageType == 0 && formatHTML && depth == 0)
                        {
                            /* HTML whitespace == HTML space characters == spaces + newlines */
                            /* HTML spaces: space (U+0020), tab (U+0009), form feed (U+000C) */
                            /* HTML newlines: line feed (U+000A) or carriage return (U+000D) */
                            
                            if (preserve == 0) text = text.replace(/[\u0020\u0009\u000C\u000A\u000D]+/g," ");
                            else if (preserve == 1) text = text.replace(/[\u0020\u0009\u000C]+/g," ");
                        }
                        
                        htmlStrings[htmlStrings.length] = text;
                    }
                    else if (element.childNodes[i].nodeType == 8)  /* comment node */
                    {
                        text = element.childNodes[i].textContent;
                        
                        /* Skip existing Save Page WE metrics and resource summary comment */
                        
                        if (text.indexOf("SAVE PAGE WE") >= 0) continue;
                        
                        /* Handle other comment nodes */
                        
                        if (pageType == 0 && formatHTML && depth == 0 && !inline && preserve == 0)
                        {
                            text = text.replace(/\n/g,newlineIndent(indent+2));
                            
                            htmlStrings[htmlStrings.length] = newlineIndent(indent+2);
                        }
                        
                        htmlStrings[htmlStrings.length] = "<!--" + text + "-->";
                    }
                }
            }
        }
        
        if (element.localName == "html" || element.localName == "body")
        {
            if (formatHTML && depth == 0) htmlStrings[htmlStrings.length] = newlineIndent(indent);
            htmlStrings[htmlStrings.length] = endTag;
        }
        else if (element.localName == "head")
        {
            prefix = (formatHTML && depth == 0) ? "\n    " : "\n";
            
            if (depth == 0)
            {
                /* Add favicon if missing */
                
                if (!iconFound)
                {
                    baseuri = element.ownerDocument.baseURI;
                    
                    datauri = replaceURL("/favicon.ico",baseuri);
                    
                    htmltext = prefix + "<link rel=\"icon\" href=\"" + datauri + "\">";
                    
                    htmlStrings[htmlStrings.length] = htmltext;
                }
            }
            
            /* Add <style> element containing CSS URL variables */
            
            if (pageType == 0 && mergeCSSImages)
            {
                htmltext = prefix + "<style id=\"savepage-cssvariables\">";
                htmltext += prefix + "  :root {";
                
                for (i = 0; i < resourceLocation.length; i++)
                {
                    if (resourceCSSFrameKeys[i][framekey] == true)
                    {
                        try { asciistring = btoa(resourceContent[i]); }
                        catch (e) { asciistring = ""; }  /* resource content not a binary string */
                        
                        htmltext += prefix + "    --savepage-url-" + i + ": url(data:" + resourceMimeType[i] + ";base64," + asciistring + ");";   /* binary data encoded as Base64 ASCII string */
                    }
                }
                
                htmltext += prefix + "  }";
                htmltext += prefix + "</style>";
                
                htmlStrings[htmlStrings.length] = htmltext;
            }
            
            if (depth == 0)
            {
                /* Add shadow loader script */
                
                htmltext = prefix + "<script id=\"savepage-shadowloader\" type=\"application/javascript\">";
                htmltext += prefix + "  \"use strict\"";
                htmltext += prefix + "  window.addEventListener(\"DOMContentLoaded\",";
                htmltext += prefix + "  function(event)";
                htmltext += prefix + "  {";
                htmltext += prefix + "    savepage_ShadowLoader(" + maxFrameDepth + ");";
                htmltext += prefix + "  },false);";
                htmltext += prefix + "  " + shadowLoaderText;
                htmltext += prefix + "</script>";
                
                htmlStrings[htmlStrings.length] = htmltext;
                
                /* Add page info bar html, css and script */
                
                if (includeInfoBar)
                {
                    date = new Date();
                    
                    pageurl = (pageType == 0) ? document.URL : document.querySelector("meta[name='savepage-url']").content;
                    
                    pageInfoBarText = pageInfoBarText.replace(/%URL%/,pageurl);
                    pageInfoBarText = pageInfoBarText.replace(/%DECODED-URL%/,decodeURIComponent(pageurl));
                    pageInfoBarText = pageInfoBarText.replace(/%DATE%/,date.toDateString().substr(8,2) + " " + date.toDateString().substr(4,3) + " " + date.toDateString().substr(11,4));
                    pageInfoBarText = pageInfoBarText.replace(/%TIME%/,date.toTimeString().substr(0,8));
                    
                    htmltext = prefix + "<script id=\"savepage-pageinfo-bar-insert\" type=\"application/javascript\">";
                    htmltext += prefix + "  \"use strict\"";
                    htmltext += prefix + "  window.addEventListener('load',function(event) {";
                    htmltext += prefix + "    var parser = new DOMParser();";
                    htmltext += prefix + "    var pageinfodoc = parser.parseFromString('" + pageInfoBarText + "','text/html');";
                    htmltext += prefix + "    var container = document.createElement('div');";
                    htmltext += prefix + "    container.setAttribute('id','savepage-pageinfo-bar-container');";
                    htmltext += prefix + "    document.documentElement.appendChild(container);";
                    htmltext += prefix + "    container.appendChild(pageinfodoc.getElementById('savepage-pageinfo-bar-style'));";
                    htmltext += prefix + "    container.appendChild(pageinfodoc.getElementById('savepage-pageinfo-bar-content'));";
                    htmltext += prefix + "    document.getElementById('savepage-pageinfo-bar-button').addEventListener('click',function(event) {";
                    htmltext += prefix + "      var container = document.getElementById('savepage-pageinfo-bar-container');";
                    htmltext += prefix + "      document.documentElement.removeChild(container);";
                    htmltext += prefix + "    },false);";
                    htmltext += prefix + "  },false);";
                    htmltext += prefix + "</script>";
                    
                    htmlStrings[htmlStrings.length] = htmltext;
                }
                
                /* Add saved page information */
                
                date = new Date();
                
                if (menuAction == 0)
                {
                    state = "Basic Items;";
                }
                else if (menuAction == 1)
                {
                    state = "Standard Items;";
                }
                else if (menuAction == 2)
                {
                    state = "Custom Items;";
                    if (saveHTMLImagesAll) state += " HTML image files (all);";
                    if (saveHTMLAudioVideo) state += " HTML audio & video files;";
                    if (saveHTMLObjectEmbed) state += " HTML object & embed files;";
                    if (saveCSSImagesAll) state += " CSS image files (all);";
                    if (saveCSSFontsAll) state += " CSS font files (all);";
                    else if (saveCSSFontsWoff) state += " CSS font files (woff for any browser);";
                    if (saveScripts) state += " Scripts (in same-origin frames);";
                }
                
                if (retainCrossFrames) state += " Retained cross-origin frames;";
                if (removeUnsavedURLs) state += " Removed unsaved URLs;";
                if (allowPassive) state += " Allowed passive mixed content;";
                if (refererHeader == 1) state += " Sent referer headers with origin only;";
                else if (refererHeader == 2) state += " Sent referer headers with origin and path;";
                state += " Max frame depth = " + maxFrameDepth + ";";
                state += " Max resource size = " + maxResourceSize + "MB;";
                state += " Max resource time = " + maxResourceTime + "s;";
                
                pageurl = (pageType == 0) ? document.URL : document.querySelector("meta[name='savepage-url']").content;
                
                htmltext = prefix + "<meta name=\"savepage-url\" content=\"" + decodeURIComponent(pageurl) + "\">";
                htmltext += prefix + "<meta name=\"savepage-title\" content=\"" + document.title + "\">";
                htmltext += prefix + "<meta name=\"savepage-from\" content=\"" + decodeURIComponent(document.URL) + "\">";
                htmltext += prefix + "<meta name=\"savepage-date\" content=\"" + date.toString() + "\">";
                htmltext += prefix + "<meta name=\"savepage-state\" content=\"" + state + "\">";
                htmltext += prefix + "<meta name=\"savepage-version\" content=\"" + chrome.runtime.getManifest().version + "\">";
                htmltext += prefix + "<meta name=\"savepage-comments\" content=\"" + enteredComments + "\">";
                    
                htmlStrings[htmlStrings.length] = htmltext;
            }
            
            htmlStrings[htmlStrings.length] = newlineIndent(indent);
            htmlStrings[htmlStrings.length] = endTag;
        }
        else if (endTag != "")
        {
            if (pageType == 0 && formatHTML && depth == 0 && !inline && preserve == 0 && element.children.length > 0)
            {
                htmlStrings[htmlStrings.length] = newlineIndent(indent);
            }
            
            htmlStrings[htmlStrings.length] = endTag;
        }
    }
}

function replaceCSSURLsInStyleSheet(csstext,baseuri,importstack,framekey)
{
    var regex;
    var matches = new Array();
    
    /* @import url() excluding existing data uri or */
    /* font or image url() excluding existing data uri or */
    /* avoid matches inside double-quote strings */
    /* avoid matches inside single-quote strings */
    /* avoid matches inside comments */
    
    regex = new RegExp(/(?:( ?)@import\s*(?:url\(\s*)?((?:"[^"]+")|(?:'[^']+')|(?:[^\s);]+))(?:\s*\))?\s*;)|/.source +  /* p1 & p2 */
                       /(?:( ?)@font-face\s*({[^}]*}))|/.source +  /* p3 & p4 */
                       /(?:( ?)url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\))|/.source +  /* p5 & p6 */
                       /(?:"(?:\\"|[^"])*")|/.source +
                       /(?:'(?:\\'|[^'])*')|/.source +
                       /(?:\/\*(?:\*[^\/]|[^\*])*?\*\/)/.source,
                       "gi");
    
    csstext = csstext.replace(regex,_replaceCSSURLOrImportStyleSheet);
    
    return csstext;
    
    function _replaceCSSURLOrImportStyleSheet(match,p1,p2,p3,p4,p5,p6,offset,string)
    {
        var i,location,csstext,datauriorcssvar,origstr,urlorvar;
        
        if (match.trim().substr(0,7).toLowerCase() == "@import")  /* @import url() */
        {
            p2 = removeQuotes(p2);
            
            if (!isSchemeDataOrMozExtension(p2))  /* exclude existing data uri or moz-extension url */
            {
                if (baseuri != null)
                {
                    location = resolveURL(p2,baseuri);
                    
                    if (location != null)
                    {
                        for (i = 0; i < resourceLocation.length; i++)
                            if (resourceLocation[i] == location && resourceStatus[i] == "success") break;
                        
                        if (i < resourceLocation.length)  /* style sheet found */
                        {
                            if (importstack.indexOf(location) < 0)
                            {
                                importstack.push(location);
                                
                                csstext = replaceCSSURLsInStyleSheet(resourceContent[i],resourceLocation[i],importstack,framekey);
                                
                                importstack.pop();
                                
                                return p1 + "/*savepage-import-url=" + p2 + "*/" + p1 + csstext;
                            }
                        }
                    }
                }
                
                if (removeUnsavedURLs) return p1 + "/*savepage-import-url=" + p2 + "*/" + p1;
                else return match;  /* original @import rule */
            }
        }
        else if (match.trim().substr(0,10).toLowerCase() == "@font-face")  /* @font-face rule */
        {
            regex = /( ?)url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;  /* image url() */
            
            return match.replace(regex,_replaceURL);
            
            function _replaceURL(match,p1,p2,offset,string)
            {
                var cssvar,datauri,origstr;
                
                p2 = removeQuotes(p2);
                
                if (!isSchemeDataOrMozExtension(p2))  /* exclude existing data uri or moz-extension url */
                {
                    datauri = replaceURL(p2,baseuri);
                    
                    origstr = (datauri == p2) ? p1 : p1 + "/*savepage-url=" + p2 + "*/" + p1;
                    
                    return origstr + "url(" + datauri + ")";
                }
                else return match;  /* original data uri */ 
            }
        }
        else if (match.trim().substr(0,4).toLowerCase() == "url(")  /* font or image url() */
        {
            p6 = removeQuotes(p6);
            
            if (!isSchemeDataOrMozExtension(p6))  /* exclude existing data uri or moz-extension url */
            {
                datauriorcssvar = replaceCSSImageURL(p6,baseuri,framekey);
                
                origstr = (datauriorcssvar == p6) ? p5 : p5+ "/*savepage-url=" + p6 + "*/" + p5;
                
                urlorvar = (datauriorcssvar.substr(0,2) == "--") ? "var" : "url";
                
                return origstr + urlorvar + "(" + datauriorcssvar + ")";
            }
            else return match;  /* original data uri */ 
        }
        else if (match.substr(0,1) == "\"") return match;  /* double-quote string */
        else if (match.substr(0,1) == "'") return match;  /* single-quote string */
        else if (match.substr(0,2) == "/*") return match;  /* comment */
    }
}

function replaceCSSImageURLs(csstext,baseuri,framekey)
{
    var regex;
    
    regex = /( ?)url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;  /* image url() */
    
    csstext = csstext.replace(regex,_replaceCSSImageURL);
    
    return csstext;
    
    function _replaceCSSImageURL(match,p1,p2,offset,string)
    {
        var datauriorcssvar,origstr,urlorvar;
        
        p2 = removeQuotes(p2);
        
        if (!isSchemeDataOrMozExtension(p2))  /* exclude existing data uri or moz-extension url */
        {
            datauriorcssvar = replaceCSSImageURL(p2,baseuri,framekey);
            
            origstr = (datauriorcssvar == p2) ? p1 : p1 + "/*savepage-url=" + p2 + "*/" + p1;
            
            urlorvar = (datauriorcssvar.substr(0,2) == "--") ? "var" : "url";
            
            return origstr + urlorvar + "(" + datauriorcssvar + ")";
        }
        else return match;  /* original data uri */ 
    }
}

function replaceCSSImageURL(url,baseuri,framekey)
{
    var i,location,count,asciistring;
    
    if (pageType > 0) return url;  /* saved page - ignore new resources when re-saving */
    
    if (baseuri != null)
    {
        location = resolveURL(url,baseuri);
        
        if (location != null)
        {
            for (i = 0; i < resourceLocation.length; i++)
                if (resourceLocation[i] == location && resourceStatus[i] == "success") break;
            
            if (i < resourceLocation.length)
            {
                if (resourceCharSet[i] == "")  /* charset not defined - binary data */
                {
                    count = mergeCSSImages ? resourceRemembered[i]-resourceCSSRemembered[i]+Object.keys(resourceCSSFrameKeys[i]).length : resourceRemembered[i];
                    
                    if (resourceContent[i].length*count <= maxResourceSize*1024*1024)  /* skip large and/or repeated resource */
                    {
                        if (mergeCSSImages)
                        {
                            if (resourceCSSFrameKeys[i][framekey] == true)
                            {
                                resourceReplaced[i]++;
                                
                                return "--savepage-url-" + i;
                            }
                        }
                        else
                        {
                            resourceReplaced[i]++;
                            
                            try { asciistring = btoa(resourceContent[i]); }
                            catch (e) { asciistring = ""; }  /* resource content not a binary string */
                            
                            return "data:" + resourceMimeType[i] + ";base64," + asciistring;  /* binary data encoded as Base64 ASCII string */
                        }
                    }
                }
            }
        }
    }
    
    if (removeUnsavedURLs) return "";  /* null string */
    else return url;  /* original url */
}

function replaceURL(url,baseuri)
{
    var i,location,count,asciistring;
    
    if (pageType > 0) return url;  /* saved page - ignore new resources when re-saving */
    
    if (baseuri != null)
    {
        location = resolveURL(url,baseuri);
        
        if (location != null)
        {
            for (i = 0; i < resourceLocation.length; i++)
                if (resourceLocation[i] == location && resourceStatus[i] == "success") break;
            
            if (i < resourceLocation.length)
            {
                if (resourceCharSet[i] == "")  /* charset not defined - binary data */
                {
                    count = resourceRemembered[i];
                    
                    if (resourceContent[i].length*count <= maxResourceSize*1024*1024)  /* skip large and/or repeated resource */
                    {
                        resourceReplaced[i]++;
                        
                        try { asciistring = btoa(resourceContent[i]); }
                        catch (e) { asciistring = ""; }  /* resource content not a binary string */
                        
                        return "data:" + resourceMimeType[i] + ";base64," + asciistring;  /* binary data encoded as Base64 ASCII string */
                    }
                }
                else  /* charset defined - character data */
                {
                    resourceReplaced[i]++;
                    
                    return "data:" + resourceMimeType[i] + ";charset=utf-8," + encodeURIComponent(resourceContent[i]);  /* characters encoded as UTF-8 %escaped string */
                }
            }
        }
    }
    
    if (removeUnsavedURLs) return "";  /* null string */
    else return url;  /* original url */
}

function swapScreenAndPrintDevices(csstext)
{
    var regex;
    
    regex = /@media[^{]*{/gi;  /* @media rule */
        
    csstext = csstext.replace(regex,_replaceDevice);
    
    return csstext;
    
    function _replaceDevice(match,offset,string)
    {
        match = match.replace(/screen/gi,"######");
        match = match.replace(/print/gi,"screen");
        match = match.replace(/######/gi,"print");
        
        return match;
    }
}

/************************************************************************/

/* Save utility functions */

function resolveURL(url,baseuri)
{
    var resolvedURL;
    
    try
    {
        resolvedURL = new URL(url,baseuri);
    }
    catch (e)
    {
        return null;  /* baseuri invalid or null */
    }
    
    return resolvedURL.href;
}

function removeQuotes(url)
{
    if (url.substr(0,1) == "\"" || url.substr(0,1) == "'") url = url.substr(1);
    
    if (url.substr(-1) == "\"" || url.substr(-1) == "'") url = url.substr(0,url.length-1);
    
    return url;
}

function isSchemeDataOrMozExtension(url)
{
    /* Exclude existing data uri or moz-extension url */
    
    if (url.substr(0,5).toLowerCase() == "data:" || url.substr(0,14).toLowerCase() == "moz-extension:") return true;

    return false;
}

function convertUTF8ToUTF16(utf8str)
{
    var i,byte1,byte2,byte3,byte4,codepoint,utf16str;
    
    /* Convert UTF-8 string to Javascript UTF-16 string */
    /* Each codepoint in UTF-8 string comprises one to four 8-bit values */
    /* Each codepoint in UTF-16 string comprises one or two 16-bit values */
    
    i = 0;
    utf16str = "";
    
    while (i < utf8str.length)
    {
        byte1 = utf8str.charCodeAt(i++);
        
        if ((byte1 & 0x80) == 0x00)
        {
            utf16str += String.fromCharCode(byte1);  /* one 16-bit value */
        }
        else if ((byte1 & 0xE0) == 0xC0)
        {
            byte2 = utf8str.charCodeAt(i++);
            
            codepoint = ((byte1 & 0x1F) << 6) + (byte2 & 0x3F);
            
            utf16str += String.fromCodePoint(codepoint);  /* one 16-bit value */
        }
        else if ((byte1 & 0xF0) == 0xE0)
        {
            byte2 = utf8str.charCodeAt(i++);
            byte3 = utf8str.charCodeAt(i++);
            
            codepoint = ((byte1 & 0x0F) << 12) + ((byte2 & 0x3F) << 6) + (byte3 & 0x3F);
            
            utf16str += String.fromCodePoint(codepoint);  /* one 16-bit value */
        }
        else if ((byte1 & 0xF8) == 0xF0)
        {
            byte2 = utf8str.charCodeAt(i++);
            byte3 = utf8str.charCodeAt(i++);
            byte4 = utf8str.charCodeAt(i++);
            
            codepoint = ((byte1 & 0x07) << 18) + ((byte2 & 0x3F) << 12) + ((byte3 & 0x3F) << 6) + (byte4 & 0x3F);
            
            utf16str += String.fromCodePoint(codepoint);  /* two 16-bit values */
        }
    }
    
    return utf16str;
}

function newlineIndent(indent)
{
    var i,str;
    
    str = "\n";
    
    for (i = 0; i < indent; i++) str += " ";
    
    return str;
}

function getSavedFileName(url,title,extract)
{
    var i,documentURL,host,path,lastsegment,file,extension,filename,datestr,dsep,tsep,date,time;
    var pathsegments = new Array();
    var dateobj = new Date();
    var matches = new Array();
    
    documentURL = new URL(url);
    
    host = documentURL.hostname;
    host = decodeURIComponent(host);
    host = sanitizeString(host);
    
    path = documentURL.pathname;
    path = decodeURIComponent(path);
    path = sanitizeString(path);
    
    pathsegments = path.split("/");
    lastsegment = pathsegments.pop();
    if (lastsegment == "") lastsegment = pathsegments.pop();
    
    i = lastsegment.lastIndexOf(".");
    
    if (i < 0)
    {
        file = lastsegment;
        extension = "";
    }
    else
    {
        file = lastsegment.substring(0,i);
        extension = lastsegment.substring(i);
    }
    
    if (!extract) extension = ".html";
    
    pathsegments.shift();  /* remove initial empty segment */
    pathsegments.push(file);
    path = pathsegments.join("/");
    
    title = sanitizeString(title);
    title = title.trim();
    
    if (title == "") title = file;
    
    filename = savedFileName + extension;
    
    datestr = new Date(dateobj.getTime()-(dateobj.getTimezoneOffset()*60000)).toISOString();
    
    matches = filename.match(/%DATE\((.?)\)%/);
    dsep = (matches == null) ? "" : matches[1];
    date = datestr.substr(0,10).replace(/-/g,dsep);
    
    matches = filename.match(/%TIME\((.?)\)%/);
    tsep = (matches == null) ? "" : matches[1];
    time = datestr.substr(11,8).replace(/:/g,tsep);
    
    filename = replaceField(filename,"%DATE(" + dsep + ")%",date);
    filename = replaceField(filename,"%TIME(" + tsep + ")%",time);
    filename = replaceField(filename,"%HOST%",host);
    filename = replaceField(filename,"%FILE%",file);
    filename = replaceField(filename,"%PATH%",path);
    filename = replaceField(filename,"%TITLE%",title);
    
    filename = filename.replace(/(\\|\/|:|\*|\?|"|<|>|\|)/g,"_");
    
    if (replaceSpaces) filename = filename.replace(/\s/g,replaceChar);
    
    return filename;
}

function sanitizeString(string)
{
    var i,charcode;
    
    /* Remove control characters: 0-31 and 255 */ 
    /* Remove other line break characters: 133, 8232, 8233 */ 
    /* Remove zero-width characters: 6158, 8203, 8204, 8205, 8288, 65279 */ 
    /* Change all space characters to normal spaces: 160, 5760, 8192-8202, 8239, 8287, 12288 */
    /* Change all hyphen characters to normal hyphens: 173, 1470, 6150, 8208-8213, 8315, 8331, 8722, 11834, 11835, 65112, 65123, 65293 */
    
    for (i = 0; i < string.length; i++)
    {
        charcode = string.charCodeAt(i);
        
        if (charcode <= 31 || charcode == 255 ||
            charcode == 133 || charcode == 8232 || charcode == 8233 ||
            charcode == 6158 || charcode == 8203 || charcode == 8204 || charcode == 8205 || charcode == 8288 || charcode == 65279)
        {
            string = string.substr(0,i) + string.substr(i+1);
        }
        
        if (charcode == 160 || charcode == 5760 || (charcode >= 8192 && charcode <= 8202) || charcode == 8239 || charcode == 8287 || charcode == 12288)
        {
            string = string.substr(0,i) + " " + string.substr(i+1);
        }
        
        if (charcode == 173 || charcode == 1470 || charcode == 6150 || (charcode >= 8208 && charcode <= 8213) ||
            charcode == 8315 || charcode == 8331 || charcode == 8722 || charcode == 11834 || charcode == 11835 ||
            charcode == 65112 || charcode == 65123 || charcode == 65293)
        {
            string = string.substr(0,i) + "-" + string.substr(i+1);
        }
    }
    
    return string;
}

function replaceField(string,field,repstr)
{
    var i,minlength;
    
    i = string.indexOf(field);
    
    if (i < 0) return string;
    
    minlength = string.replace(/(%DATE\(.?\)%|%TIME\(.?\)%|%HOST%|%FILE%|%PATH%|%TITLE%)/g,"").length;
    
    if (repstr.length <= maxFileNameLength-minlength) string = string.replace(field,repstr);
    else string = string.replace(field,repstr.substr(0,maxFileNameLength-minlength));
    
    return string;
}

/************************************************************************/

/* View saved page information function */

function viewSavedPageInfo()
{
    var i,xhr,parser,pageinfodoc,container,metaurl,metatitle,metafrom,metadate,metastate,metaversion,metacomments;
    
    /* Load page info panel */
    
    xhr = new XMLHttpRequest();
    xhr.open("GET",chrome.runtime.getURL("pageinfo-panel.html"),true);
    xhr.onload = complete;
    xhr.send();
    
    function complete()
    {
        if (xhr.status == 200)
        {
            /* Parse page info document */
            
            parser = new DOMParser();
            pageinfodoc = parser.parseFromString(xhr.responseText,"text/html");
            
            /* Create container element */
            
            container = document.createElement("div");
            container.setAttribute("id","savepage-pageinfo-panel-container");
            document.documentElement.appendChild(container);
            
            /* Append page info elements */
            
            container.appendChild(pageinfodoc.getElementById("savepage-pageinfo-panel-style"));
            container.appendChild(pageinfodoc.getElementById("savepage-pageinfo-panel-overlay"));
            
            /* Add listeners for buttons */
            
            document.getElementById("savepage-pageinfo-panel-open").addEventListener("click",clickOpenURL,false);
            document.getElementById("savepage-pageinfo-panel-okay").addEventListener("click",clickOkay,false);
            
            /* Focus okay button */
            
            document.getElementById("savepage-pageinfo-panel-okay").focus();
            
            /* Populate page info contents */
            
            metaurl = document.querySelector("meta[name='savepage-url']").content;
            metatitle = document.querySelector("meta[name='savepage-title']").content;
            metafrom = document.querySelector("meta[name='savepage-from']").content;
            metadate = document.querySelector("meta[name='savepage-date']").content;
            metastate = document.querySelector("meta[name='savepage-state']").content;
            metaversion = document.querySelector("meta[name='savepage-version']").content;
            metacomments = "";
            
            if (metaversion > +"8.0") metacomments = document.querySelector("meta[name='savepage-comments']").content;  /* decodes HTML entities */
            
            if (metaversion < +"6.0") metastate = metastate.replace(/(.*) (Max frame depth = \d+; Max resource size = \d+MB;) (.*)/,"$1 $3 $2");
            if (metaversion < +"7.0") metastate = metastate.replace(/CSS fonts used;/,"\n - " + "$&");
            
            metastate = metastate.replace(/; /g,";\n");
            metastate = metastate.replace(/;/g,"");
            metastate = metastate.replace(/Custom Items/,"$&:");
            metastate = metastate.replace(/HTML image files \(all\)/," - " + "$&");
            metastate = metastate.replace(/HTML audio & video files/," - " + "$&");
            metastate = metastate.replace(/HTML object & embed files/," - " + "$&");
            metastate = metastate.replace(/CSS image files \(all\)/," - " + "$&");
            metastate = metastate.replace(/CSS font files \(all\)/," - " + "$&");
            metastate = metastate.replace(/CSS font files \(woff for any browser\)/," - " + "$&");
            metastate = metastate.replace(/Scripts \(in same-origin frames\)/," - " + "$&");
            
            if (document.querySelector("script[id='savepage-pageloader']") == null &&  /* Version 7.0-14.0 */
                document.querySelector("meta[name='savepage-resourceloader']") == null)  /* Version 15.0-15.1 */
            {
                metastate = metastate.replace(/Used page loader/,"$&" + " (Removed)");
                metastate = metastate.replace(/Used resource loader/,"$&" + " (Removed)");
            }
            
            metaversion = "Save Page WE " + metaversion;
            
            document.getElementById("savepage-pageinfo-panel-url").textContent = metaurl;
            document.getElementById("savepage-pageinfo-panel-title").textContent = metatitle;
            document.getElementById("savepage-pageinfo-panel-from").textContent = metafrom;
            document.getElementById("savepage-pageinfo-panel-date").textContent = metadate;
            document.getElementById("savepage-pageinfo-panel-state").textContent = metastate;
            document.getElementById("savepage-pageinfo-panel-version").textContent = metaversion;
            document.getElementById("savepage-pageinfo-panel-comments").children[0].value = metacomments;
        }
    }
    
    function clickOpenURL()
    {
        window.open(metaurl);
    }
    
    function clickOkay()
    {
        document.documentElement.removeChild(document.getElementById("savepage-pageinfo-panel-container"));
    }
}

/************************************************************************/

/* Remove Resource Loader function */

/* For pages saved using Version 7.0-15.1 */

function removeResourceLoader()
{
    var resourceBlobURL = new Array();
    var resourceMimeType = new Array();
    var resourceCharSet = new Array();
    var resourceContent = new Array();
    var resourceStatus = new Array();
    var resourceRemembered = new Array();
    
    var resourceCount;
    
    gatherBlobResources();
    
    /* First Pass - to gather blob resources */
    
    function gatherBlobResources()
    {
        chrome.runtime.sendMessage({ type: "setSaveState", savestate: 4 });
        
        findBlobResources(0,window,document.documentElement);
        
        loadBlobResources();
    }
    
    function findBlobResources(depth,frame,element)
    {
        var i,csstext,regex;
        var matches = new Array();
        
        if (element.hasAttribute("style"))
        {
            csstext = element.style.cssText;
            
            regex = /url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;
            
            while ((matches = regex.exec(csstext)) != null)
            {
                matches[1] = removeQuotes(matches[1]);
                
                if (matches[1].substr(0,5).toLowerCase() == "blob:")  /* blob url */
                {
                    rememberBlobURL(matches[1],"image/png","");
                }
            }
        }
        
        if (element.localName == "script")
        {
            /* src will be data uri - not replaced by blob url */
        }
        else if (element.localName == "style")
        {
            csstext = element.textContent;
            
            regex = /url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;
            
            while ((matches = regex.exec(csstext)) != null)
            {
                matches[1] = removeQuotes(matches[1]);
                
                if (matches[1].substr(0,5).toLowerCase() == "blob:")  /* blob url */
                {
                    rememberBlobURL(matches[1],"image/png","");
                }
            }
        }
        else if (element.localName == "link" && (element.rel.toLowerCase() == "icon" || element.rel.toLowerCase() == "shortcut icon"))
        {
            if (element.href.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.href,"image/vnd.microsoft.icon","");
        }
        else if (element.localName == "body")
        {
            if (element.background.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.background,"image/png","");
        }
        else if (element.localName == "img")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"image/png","");
        }
        else if (element.localName == "input" && element.type.toLowerCase() == "image")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"image/png","");
        }
        else if (element.localName == "audio")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"audio/mpeg","");
        }
        else if (element.localName == "video")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"video/mp4","");
            if (element.poster.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.poster,"image/png","");
        }
        else if (element.localName == "source")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:")
            {
                if (element.parentElement)
                {
                    if (element.parentElement.localName == "audio") rememberBlobURL(element.src,"audio/mpeg","");
                    else if (element.parentElement.localName == "video") rememberBlobURL(element.src,"video/mp4","");
                }
            }
        }
        else if (element.localName == "track")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"text/vtt","utf-8");
        }
        else if (element.localName == "object")
        {
            if (element.data.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.data,"application/octet-stream","");
        }
        else if (element.localName == "embed")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"application/octet-stream","");
        }
        
        /* Handle nested frames and child elements */
        
        if (element.localName == "iframe" || element.localName == "frame")  /* frame elements */
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") rememberBlobURL(element.src,"text/html","utf-8");
            
            if (depth < maxFrameDepth)
            {
                try
                {
                    if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before finding */
                    {
                        findBlobResources(depth+1,element.contentWindow,element.contentDocument.documentElement);
                    }
                }
                catch (e) {}  /* attempting cross-domain web page access */
            }
        }
        else
        {
            /* Handle shadow child elements */
            
            if (element.shadowRoot != null)
            {
                for (i = 0; i < element.shadowRoot.children.length; i++)
                    if (element.shadowRoot.children[i] != null)  /* in case web page not fully loaded before finding */
                        findBlobResources(depth,frame,element.shadowRoot.children[i]);
            }
            
            /* Handle normal child elements */
            
            for (i = 0; i < element.children.length; i++)
                if (element.children[i] != null)  /* in case web page not fully loaded before finding */
                    findBlobResources(depth,frame,element.children[i]);
        }
    }
    
    function rememberBlobURL(bloburl,mimetype,charset)
    {
        var i;
        
        for (i = 0; i < resourceBlobURL.length; i++)
            if (resourceBlobURL[i] == bloburl) break;
        
        if (i == resourceBlobURL.length)  /* new blob */
        {
            resourceBlobURL[i] = bloburl;
            resourceMimeType[i] = mimetype;  /* default if load fails */
            resourceCharSet[i] = charset;  /* default if load fails */
            resourceContent[i] = "";  /* default if load fails */
            resourceStatus[i] = "pending";
            resourceRemembered[i] = 1;
        }
        else resourceRemembered[i]++;  /* repeated blob */
    }
    
    /* After first pass - load blob resources */
    
    function loadBlobResources()
    {
        var i,xhr;
        
        resourceCount = 0;
        
        for (i = 0; i < resourceBlobURL.length; i++)
        {
            if (resourceStatus[i] == "pending") 
            {
                resourceCount++;
                
                try
                {
                    xhr = new XMLHttpRequest();
                    
                    xhr.open("GET",resourceBlobURL[i],true);
                    xhr.setRequestHeader("Cache-Control","no-store");
                    xhr.responseType = "arraybuffer";
                    xhr.timeout = 1000;
                    xhr.onload = loadSuccess;
                    xhr.onerror = loadFailure;
                    xhr.ontimeout = loadFailure;
                    xhr._resourceIndex = i;
                    
                    xhr.send();  /* throws exception if url is invalid */
                }
                catch(e)
                {
                    resourceStatus[i] = "failure";
                    
                    --resourceCount;
                }
            }
        }
        
        if (resourceCount <= 0) checkDataResources();
    }
    
    function loadSuccess()
    {
        var i,binaryString,contenttype,mimetype,charset;
        var byteArray = new Uint8Array(this.response);
        var matches = new Array();
        
        if (this.status == 200)
        {
            binaryString = "";
            for (i = 0; i < byteArray.byteLength; i++) binaryString += String.fromCharCode(byteArray[i]);
            
            contenttype = this.getResponseHeader("Content-Type");
            if (contenttype == null) contenttype = "";
            
            matches = contenttype.match(/([^;]+)/i);
            if (matches != null) mimetype = matches[1].toLowerCase();
            else mimetype = "";
            
            matches = contenttype.match(/;charset=([^;]+)/i);
            if (matches != null) charset = matches[1].toLowerCase();
            else charset = "";
            
            switch (resourceMimeType[this._resourceIndex].toLowerCase())  /* expected MIME type */
            {
                case "image/png":  /* image file */
                case "image/vnd.microsoft.icon":  /* icon file */
                case "audio/mpeg":  /* audio file */
                case "video/mp4":  /* video file */
                case "application/octet-stream":  /* data file */
                
                    if (mimetype != "") resourceMimeType[this._resourceIndex] = mimetype;
                    
                    resourceContent[this._resourceIndex] = binaryString;
                    
                    break;
                    
               case "text/vtt":  /* subtitles file */
               case "text/html":  /* iframe html file */
                    
                    if (mimetype != "") resourceMimeType[this._resourceIndex] = mimetype;
                    if (charset != "") resourceCharSet[this._resourceIndex] = charset;
                    
                    resourceContent[this._resourceIndex] = binaryString;
                    
                    break;
            }
            
            resourceStatus[this._resourceIndex] = "success";
        }
        else resourceStatus[this._resourceIndex] = "failure";
        
        if (--resourceCount <= 0) checkDataResources();
    }
    
    function loadFailure()
    {
        resourceStatus[this._resourceIndex] = "failure";
        
        if (--resourceCount <= 0) checkDataResources();
    }
    
    /* After first pass - check data resources */
    
    function checkDataResources()
    {
        var i,dataurisize,skipcount,count;
        
        /* Check for large resource sizes */
        
        dataurisize = 0;
        skipcount = 0;
        
        for (i = 0; i < resourceBlobURL.length; i++)
        {
            if (resourceCharSet[i] == "")  /* charset not defined - binary data */
            {
                count = resourceRemembered[i];
                
                if (resourceContent[i].length*count > maxResourceSize*1024*1024) skipcount++;  /* skip large and/or repeated resource */
                else dataurisize += resourceContent[i].length*count*(4/3);  /* base64 expands by 4/3 */
            }
        }
        
        if (dataurisize > maxTotalSize*1024*1024)
        {
            showMessage("Cannot remove resource loader","Remove",
                        "Cannot remove resource loader because the total size of resources exceeds " + maxTotalSize + "MB.\n\n" +
                        "It may be possible to remove resource loader by trying this suggestion:\n\n" +
                        "    •  Reduce the 'Maximum size allowed for a resource' option value.",
                        null,
                        function savecancel()
                        {
                            chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
                        });
        }
        else if (showWarning)
        {
            if (skipcount > 0)
            {
                showMessage("Some resources exceed maximum size","Remove",
                            skipcount + " resources exceed maximum size and will be discarded.\n\n" +
                            "It may be possible to retain these resources by trying this suggestion:\n\n" +
                            "    •  Increase the 'Maximum size allowed for a resource' option value.",
                            function removecontinue()
                            {
                                substituteBlobResources();
                            },
                            function removecancel()
                            {
                                chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 });
                            });
            }
            else substituteBlobResources();
        }
        else substituteBlobResources();
    }
    
    /* Second Pass - to substitute blob URL's with data URI's */
    
    function substituteBlobResources()
    {
        var i,script,meta;
        
        /* Remove page loader script */  /* Version 7.0-14.0 */
        
        script = document.getElementById("savepage-pageloader");
        if (script != null) script.parentElement.removeChild(script);
        
        /* Remove resource loader meta element */  /* Version 15.0+ */
        
        meta = document.getElementsByName("savepage-resourceloader")[0];
        if (meta != null) meta.parentElement.removeChild(meta);
        
        /* Release blob memory allocation */
        
        for (i = 0; i < resourceBlobURL.length; i++) 
            window.URL.revokeObjectURL(resourceBlobURL[i]);
        
        /* Replace blob URL's with data URI's */
        
        replaceBlobResources(0,window,document.documentElement);  /* replace blob url's with data uri's */
        
        pageType = 1;  /* saved page */
        
        chrome.runtime.sendMessage({ type: "setPageType", pagetype: pageType });
        
        window.setTimeout(function() { chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 }); },1000);
    }
    
    function replaceBlobResources(depth,frame,element)
    {
        var i,csstext,regex;
        
        if (element.hasAttribute("style"))
        {
            csstext = element.style.cssText;
            
            regex = /url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;
            
            element.style.cssText = csstext.replace(regex,replaceCSSBlobURL);
        }
        
        if (element.localName == "script")
        {
            /* src will be data uri - not replaced by blob url */
        }
        else if (element.localName == "style")
        {
            csstext = element.textContent;
            
            regex = /url\(\s*((?:"[^"]+")|(?:'[^']+')|(?:[^\s)]+))\s*\)/gi;
            
            element.textContent = csstext.replace(regex,replaceCSSBlobURL);
        }
        else if (element.localName == "link" && (element.rel.toLowerCase() == "icon" || element.rel.toLowerCase() == "shortcut icon"))
        {
            if (element.href.substr(0,5).toLowerCase() == "blob:") element.href = replaceBlobURL(element.href);
        }
        else if (element.localName == "body")
        {
            if (element.background.substr(0,5).toLowerCase() == "blob:") element.background = replaceBlobURL(element.background);
        }
        else if (element.localName == "img")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") element.src = replaceBlobURL(element.src);
        }
        else if (element.localName == "input" && element.type.toLowerCase() == "image")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") element.src = replaceBlobURL(element.src);
        }
        else if (element.localName == "audio")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:")
            {
                element.src = replaceBlobURL(element.src);
                element.load();
            }
        }
        else if (element.localName == "video")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:")
            {
                element.src = replaceBlobURL(element.src);
                element.load();
            }
            if (element.poster.substr(0,5).toLowerCase() == "blob:") element.poster = replaceBlobURL(element.poster);
        }
        else if (element.localName == "source")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:")
            {
                element.src = replaceBlobURL(element.src);
                if (element.parentElement) element.parentElement.load();
            }
        }
        else if (element.localName == "track")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") element.src = replaceBlobURL(element.src);
        }
        else if (element.localName == "object")
        {
            if (element.data.substr(0,5).toLowerCase() == "blob:") element.data = replaceBlobURL(element.data);
        }
        else if (element.localName == "embed")
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") element.src = replaceBlobURL(element.src);
        }
        
        /* Handle nested frames and child elements */
        
        if (element.localName == "iframe" || element.localName == "frame")  /* frame elements */
        {
            if (element.src.substr(0,5).toLowerCase() == "blob:") element.src = replaceBlobURL(element.src);
            
            if (depth < maxFrameDepth)
            {
                try
                {
                    if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before replacing */
                    {
                        replaceBlobResources(depth+1,element.contentWindow,element.contentDocument.documentElement);
                    }
                }
                catch (e) {}  /* attempting cross-domain web page access */
            }
        }
        else
        {
            /* Handle shadow child elements */
            
            if (element.shadowRoot != null)
            {
                for (i = 0; i < element.shadowRoot.children.length; i++)
                    if (element.shadowRoot.children[i] != null)  /* in case web page not fully loaded before replacing */
                        replaceBlobResources(depth,frame,element.shadowRoot.children[i]);
            }
            
            /* Handle normal child elements */
            
            for (i = 0; i < element.children.length; i++)
                if (element.children[i] != null)  /* in case web page not fully loaded before replacing */
                    replaceBlobResources(depth,frame,element.children[i]);
        }
    }
    
    function replaceCSSBlobURL(match,p1,offset,string)
    {
        p1 = removeQuotes(p1);
        
        if (p1.substr(0,5).toLowerCase() == "blob:")  /* blob url */
        {
            return "url(" + replaceBlobURL(p1) + ")";
        }
        else return match;
    }
    
    function replaceBlobURL(bloburl)
    {
        var i,count,asciistring;
        
        for (i = 0; i < resourceBlobURL.length; i++)
            if (resourceBlobURL[i] == bloburl && resourceStatus[i] == "success") break;
        
        if (i < resourceBlobURL.length)
        {
            if (resourceCharSet[i] == "")  /* charset not defined - binary data */
            {
                count = resourceRemembered[i];
                
                if (resourceContent[i].length*count <= maxResourceSize*1024*1024)  /* skip large and/or repeated resource */
                {
                    try { asciistring = btoa(resourceContent[i]); }
                    catch (e) { asciistring = ""; }  /* resource content not a binary string */
                    
                    return "data:" + resourceMimeType[i] + ";base64," + asciistring;  /* binary data encoded as Base64 ASCII string */
                }
            }
            else  /* charset defined - character data */
            {
                return "data:" + resourceMimeType[i] + ";charset=utf-8," + encodeURIComponent(resourceContent[i]);  /* characters encoded as UTF-8 %escaped string */
            }
        }
        
        return bloburl;
    }
}

/************************************************************************/

/* Extract saved page media (image/audio/video) function */

function extractSavedPageMedia(srcurl)
{
    chrome.runtime.sendMessage({ type: "setSaveState", savestate: 5 });
    
    if (!extract(0,window,document.documentElement))
    {
        showMessage("Extract Image/Audio/Video failed","Extract","Image/Audio/Video element not found.",null,cancel);
    }

    window.setTimeout(function() { chrome.runtime.sendMessage({ type: "setSaveState", savestate: -1 }); },1000);
    
    function extract(depth,frame,element)
    {
        var i,baseuri,location,mediaURL,filename,datestr,text,link;
        var pathsegments = new Array();
        var date = new Date();
        
        if (element.localName == "img" || element.localName == "audio" || element.localName == "video" || element.localName == "source")
        {
            if (element.src == srcurl)  /* image/audio/video found */
            {
                baseuri = element.ownerDocument.baseURI;
                
                if (baseuri != null)
                {
                    location = resolveURL(element.getAttribute("data-savepage-src"),baseuri);
                    
                    if (location != null)
                    {
                        filename = getSavedFileName(location,"",true);
                        
                        link = document.createElement("a");
                        link.download = filename;
                        link.href = srcurl;
                        
                        link.addEventListener("click",handleClick,true);
                        
                        link.dispatchEvent(new MouseEvent("click"));  /* save image/audio/video as file */
                        
                        link.removeEventListener("click",handleClick,true);
                        
                        function handleClick(event)
                        {
                            event.stopPropagation();
                        }
                        
                        return true;
                    }
                }
            }
        }
        
        /* Handle nested frames and child elements */
        
        if (element.localName == "iframe" || element.localName == "frame")  /* frame elements */
        {
            if (depth < maxFrameDepth)
            {
                try
                {
                    if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before extracting */
                    {
                        if (extract(depth+1,element.contentWindow,element.contentDocument.documentElement)) return true;
                    }
                }
                catch (e) {}  /* attempting cross-domain web page access */
            }
        }
        else
        {
            /* Handle shadow child elements */
            
            if (element.shadowRoot != null)
            {
                for (i = 0; i < element.shadowRoot.children.length; i++)
                    if (element.shadowRoot.children[i] != null)  /* in case web page not fully loaded before extracting */
                        if (extract(depth,frame,element.shadowRoot.children[i])) return true;
            }
            
            /* Handle normal child elements */
            
            for (i = 0; i < element.children.length; i++)
                if (element.children[i] != null)  /* in case web page not fully loaded before extracting */
                    if (extract(depth,frame,element.children[i])) return true;
        }
        
        return false;
    }
}

/************************************************************************/

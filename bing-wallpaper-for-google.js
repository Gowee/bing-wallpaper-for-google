// ==UserScript==   
// @name         Bing Wallpaper for Google
// @namespace    https://github.com/Gowee
// @version      0.1.1
// @description  Apply the Today on Bing wallpapers to the homepage of Google.
// @author       Gowee <whygowe@gmail.com>
// @match        https://www.google.com/
// @include      /^https?:\/\/www\.google(\.com?)?\.[a-z]{2}(\/(webhp(\?.*)?)?)?$/
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_xmlhttpRequest
// @require      https://gitcdn.xyz/repo/mitchellmebane/GM_fetch/e9f8aa00af862665625500e2c2459840084226b4/GM_fetch.js
// @run-at       document-start
// @downloadURL none
// ==/UserScript==

{
    (function () {
        'use strict';

        var Promise = window.Bluebird || window.Promise;

        if (self.GM_fetch) {
            return
        }

        function normalizeName(name) {
            if (typeof name !== 'string') {
                name = name.toString();
            }
            if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
                throw new TypeError('Invalid character in header field name')
            }
            return name.toLowerCase()
        }

        function normalizeValue(value) {
            if (typeof value !== 'string') {
                value = value.toString();
            }
            return value
        }

        function Headers(headers) {
            this.map = {}

            if (headers instanceof Headers) {
                headers.forEach(function (value, name) {
                    this.append(name, value)
                }, this)

            } else if (headers) {
                Object.getOwnPropertyNames(headers).forEach(function (name) {
                    this.append(name, headers[name])
                }, this)
            }
        }

        Headers.prototype.append = function (name, value) {
            name = normalizeName(name)
            value = normalizeValue(value)
            var list = this.map[name]
            if (!list) {
                list = []
                this.map[name] = list
            }
            list.push(value)
        }

        Headers.prototype['delete'] = function (name) {
            delete this.map[normalizeName(name)]
        }

        Headers.prototype.get = function (name) {
            var values = this.map[normalizeName(name)]
            return values ? values[0] : null
        }

        Headers.prototype.getAll = function (name) {
            return this.map[normalizeName(name)] || []
        }

        Headers.prototype.has = function (name) {
            return this.map.hasOwnProperty(normalizeName(name))
        }

        Headers.prototype.set = function (name, value) {
            this.map[normalizeName(name)] = [normalizeValue(value)]
        }

        Headers.prototype.forEach = function (callback, thisArg) {
            Object.getOwnPropertyNames(this.map).forEach(function (name) {
                this.map[name].forEach(function (value) {
                    callback.call(thisArg, value, name, this)
                }, this)
            }, this)
        }

        function consumed(body) {
            if (body.bodyUsed) {
                return Promise.reject(new TypeError('Already read'))
            }
            body.bodyUsed = true
        }

        function fileReaderReady(reader) {
            return new Promise(function (resolve, reject) {
                reader.onload = function () {
                    resolve(reader.result)
                }
                reader.onerror = function () {
                    reject(reader.error)
                }
            })
        }

        function readBlobAsArrayBuffer(blob) {
            var reader = new FileReader()
            reader.readAsArrayBuffer(blob)
            return fileReaderReady(reader)
        }

        function readBlobAsText(blob) {
            var reader = new FileReader()
            reader.readAsText(blob)
            return fileReaderReady(reader)
        }

        var support = {
            blob: 'FileReader' in self && 'Blob' in self && (function () {
                try {
                    new Blob();
                    return true
                } catch (e) {
                    return false
                }
            })(),
            formData: 'FormData' in self
        }

        function Body() {
            this.bodyUsed = false


            this._initBody = function (body) {
                this._bodyInit = body
                if (typeof body === 'string') {
                    this._bodyText = body
                } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
                    this._bodyBlob = body
                } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
                    this._bodyFormData = body
                } else if (!body) {
                    this._bodyText = ''
                } else {
                    throw new Error('unsupported BodyInit type')
                }
            }

            if (support.blob) {
                this.blob = function () {
                    var rejected = consumed(this)
                    if (rejected) {
                        return rejected
                    }

                    if (this._bodyBlob) {
                        return Promise.resolve(this._bodyBlob)
                    } else if (this._bodyFormData) {
                        throw new Error('could not read FormData body as blob')
                    } else {
                        return Promise.resolve(new Blob([this._bodyText]))
                    }
                }

                this.arrayBuffer = function () {
                    return this.blob().then(readBlobAsArrayBuffer)
                }

                this.text = function () {
                    var rejected = consumed(this)
                    if (rejected) {
                        return rejected
                    }

                    if (this._bodyBlob) {
                        return readBlobAsText(this._bodyBlob)
                    } else if (this._bodyFormData) {
                        throw new Error('could not read FormData body as text')
                    } else {
                        return Promise.resolve(this._bodyText)
                    }
                }
            } else {
                this.text = function () {
                    var rejected = consumed(this)
                    return rejected ? rejected : Promise.resolve(this._bodyText)
                }
            }

            if (support.formData) {
                this.formData = function () {
                    return this.text().then(decode)
                }
            }

            this.json = function () {
                return this.text().then(JSON.parse)
            }

            return this
        }

        // HTTP methods whose capitalization should be normalized
        var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

        function normalizeMethod(method) {
            var upcased = method.toUpperCase()
            return (methods.indexOf(upcased) > -1) ? upcased : method
        }

        function Request(url, options) {
            options = options || {}
            this.url = url

            this.credentials = options.credentials || 'omit'
            this.headers = new Headers(options.headers)
            this.method = normalizeMethod(options.method || 'GET')
            this.mode = options.mode || null
            this.referrer = null

            if ((this.method === 'GET' || this.method === 'HEAD') && options.body) {
                throw new TypeError('Body not allowed for GET or HEAD requests')
            }
            this._initBody(options.body)
        }

        function decode(body) {
            var form = new FormData()
            body.trim().split('&').forEach(function (bytes) {
                if (bytes) {
                    var split = bytes.split('=')
                    var name = split.shift().replace(/\+/g, ' ')
                    var value = split.join('=').replace(/\+/g, ' ')
                    form.append(decodeURIComponent(name), decodeURIComponent(value))
                }
            })
            return form
        }

        function headers(responseHeaders) {
            var head = new Headers()
            var pairs = responseHeaders.trim().split('\n')
            pairs.forEach(function (header) {
                var split = header.trim().split(':')
                var key = split.shift().trim()
                var value = split.join(':').trim()
                head.append(key, value)
            })
            return head
        }

        Body.call(Request.prototype)

        function Response(bodyInit, options) {
            if (!options) {
                options = {}
            }

            this._initBody(bodyInit)
            this.type = 'default'
            this.url = null
            this.status = options.status
            this.ok = this.status >= 200 && this.status < 300
            this.statusText = options.statusText
            this.headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers)
            this.url = options.url || ''
        }

        Body.call(Response.prototype)

        self.Headers = Headers;
        self.Request = Request;
        self.Response = Response;

        self.GM_fetch = function (input, init) {
            // TODO: Request constructor should accept input, init
            var request
            if (Request.prototype.isPrototypeOf(input) && !init) {
                request = input
            } else {
                request = new Request(input, init)
            }

            return new Promise(function (resolve, reject) {
                var xhr_details = {};
                var _parsedRespHeaders;

                function responseURL(finalUrl, rawRespHeaders, respHeaders) {
                    if (finalUrl) {
                        return finalUrl;
                    }

                    // Avoid security warnings on getResponseHeader when not allowed by CORS
                    if (/^X-Request-URL:/m.test(rawRespHeaders)) {
                        return respHeaders.get('X-Request-URL')
                    }

                    return;
                }

                xhr_details.method = request.method;

                xhr_details.url = request.url;

                xhr_details.synchronous = false;

                xhr_details.onload = function (resp) {
                    var status = resp.status
                    if (status < 100 || status > 599) {
                        reject(new TypeError('Network request failed'))
                        return
                    }

                    var rawRespHeaders = resp.responseHeaders;
                    _parsedRespHeaders = headers(rawRespHeaders);

                    var options = {
                        status: status,
                        statusText: resp.statusText,
                        headers: _parsedRespHeaders,
                        url: responseURL(resp.finalUrl, rawRespHeaders, _parsedRespHeaders)
                    }
                    var body = resp.responseText;
                    resolve(new Response(body, options))
                }

                xhr_details.onerror = function () {
                    reject(new TypeError('Network request failed'))
                }

                xhr_details.headers = {};
                request.headers.forEach(function (value, name) {
                    xhr_details.headers[name] = value;
                });

                if (typeof request._bodyInit !== 'undefined') {
                    xhr_details.data = request._bodyInit;
                }

                GM_xmlhttpRequest(xhr_details);

                /*
                // need to see if there's any way of doing this
                if (request.credentials === 'include') {
                  xhr.withCredentials = true
                }
                
                GM_xmlhttpRequest has a responseType param, but this didn't seem to work, at least in TamperMonkey
                if ('responseType' in xhr && support.blob) {
                  xhr.responseType = 'blob'
                }
                */
            })
        }
        self.GM_fetch.polyfill = true
    })();

    // TODO: better UI
    // TODO: next/previous wallpapers
    let copyright = null;
    let copyrightTip = null;

    document.addEventListener("DOMContentLoaded", () => {
        const fsr = document.getElementById("fsr");
        const wrapper = document.createElement("span");
        copyrightTip = document.createElement("a");
        wrapper.classList.add("bing-wallpaper-copyright-wrapper");
        wrapper.appendChild(copyrightTip);
        fsr.prepend(wrapper);

        if (copyright) {
            applyCopyrightTip();
        }
    });

    launch();
    function launch(_e) {
        applyStyles();
        updateWallpaper();
    }

    function applyStyles() {
        const style = document.createElement("style");
        style.textContent = `
        body {
            background-color: #555;
        }
        a {
            color: #fff !important;
        }
        #fbar {
            background: none;
            border: none;
        }
        .bing-wallpaper-copyright-wrapper {
            display: inline-block;
            /*content: "Loading a wallpaper from Bing...";*/
            color: rgba(255, 255, 255, 0.618);
            background-color: rgba(0, 0, 0, 0.372);
            line-height: 32px;
            border-radius: 4px;
        }
        `;
        document.documentElement.appendChild(style);
        return style;
    }

    async function updateWallpaper() {
        const market = (window.hasOwnProperty("google") && google.kHL) || document.documentElement.lang;
        let cachedWallpaper = JSON.parse((await GM.getValue("bing_wallpaper_cache")) || "null");
        // console.log("cached:", cachedWallpaper);
        if (cachedWallpaper) {
            applyWallpaper(cachedWallpaper);
        }
        const newWallpaper = await getBingWallpaper();
        GM.setValue("bing_wallpaper_cache", JSON.stringify(newWallpaper));
        if (!cachedWallpaper || newWallpaper.url != cachedWallpaper.url) {
            applyWallpaper(newWallpaper);
        }
    }

    async function applyWallpaper(wallpaper) {
        console.log("applyWallpaper", wallpaper);
        let count = 0;
        while (!document.body) {
            if (count >= 15) {
                throw Exception(`Failed to get document.body after ${count} times attempts.`);
            }
            await new Promise((resolve) => { setTimeout(resolve, 30) });
            count += 1;
        }
        document.body.style.backgroundImage = `url(${wallpaper.url})`;
        copyright = wallpaper.copyright;
        if (copyrightTip) {
            // If the element is fetched, then trigger applying.
            // O.W. applying will be triggered by the DOMContentLoaded listener.
            // TODO: better flow structure?
            applyCopyrightTip();
        }
        console.log(`Bing Wallpaper: \n\tCopyright by ${wallpaper.copyright.notice}`);
    }

    function applyCopyrightTip() {
        console.log("applyCopyrightTip", copyright);
        copyrightTip.href = copyright.url;
        copyrightTip.textContent = copyright.title;
        copyrightTip.title = copyright.notice;
    }

    async function getBingWallpaper(market) {


        const response = await GM_fetch(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${market}`);
        const payload = await response.json();
        const wallpaper = {
            url: new URL(payload.images[0].url, "https://www.bing.com"),
            copyright: {
                title: payload.images[0].title,
                notice: payload.images[0].copyright,
                url: payload.images[0].copyrightlink
            }
        };
        return wallpaper;
    }

}

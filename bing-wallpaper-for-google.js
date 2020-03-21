// ==UserScript==   
// @name         Bing Wallpaper for Google
// @namespace    https://github.com/Gowee
// @version      0.1.4
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

        a, #SIvCob, .fbar span {
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

        #gbwa > div > a {
            background-position: -1519px -35px;
            opacity: 0.87777;
        }
        `;
        document.documentElement.appendChild(style);
        return style;
    }

    async function updateWallpaper() {
        const market = (window.hasOwnProperty("google") && google.kHL) || document.documentElement.lang;
        console.log(`Market: ${market}`);
        let cachedWallpaper = JSON.parse((await GM.getValue("bing_wallpaper_cache")) || "null");
        if (cachedWallpaper) {
            applyWallpaper(cachedWallpaper);
        }
        const newWallpaper = await getBingWallpaper(market);
        GM.setValue("bing_wallpaper_cache", JSON.stringify(newWallpaper));
        if (!cachedWallpaper || newWallpaper.url != cachedWallpaper.url) {
            console.log("Bing wallpaper updated.");
            applyWallpaper(newWallpaper);
        }
    }

    async function applyWallpaper(wallpaper) {
        let count = 0;
        while (!document.body) {
            if (count >= 15) {
                throw Error(`Failed to get document.body after ${count} times attempts.`);
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
        console.log(copyrightTip);
        console.log(`Bing Wallpaper: \n\t${wallpaper.copyright.notice}`);
    }

    function applyCopyrightTip() {
        console.log(copyright);
        copyrightTip.href = copyright.url;
        copyrightTip.textContent = copyright.title;
        copyrightTip.title = copyright.notice;
    }

    async function getBingWallpaper(market) {
        const response = await GM_fetch(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${market}`);
        const payload = await response.json();
        let copyrightUrl = payload.images[0].copyrightlink;
        if ((new URL(copyrightUrl)).protocol === "javascript:") {
            console.log("No accessible copyright URL found.");
            copyrightUrl = "https://www.bing.com/";
        }
        console.log(payload.images[0]);
        const wallpaper = {
            url: (new URL(payload.images[0].url, "https://www.bing.com")).toString(),
            copyright: {
                title: payload.images[0].title || payload.images[0].copyright,
                notice: payload.images[0].copyright,
                url: copyrightUrl
            }
        };
        return wallpaper;
    }

}

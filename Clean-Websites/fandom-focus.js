// ==UserScript==
// @name         Fandom Focus
// @namespace    https://github.com/arrupe
// @version      1.0
// @description  Restore Fandom to a clean, readable, and distraction-free layout.
// @author       arrupe
// @license      MIT
// @match        *://*.fandom.com/*
// @run-at       document-start
// @grant        none
// @icon         https://www.fandom.com/favicon.ico
// ==/UserScript==

(function() {
    // Verified against the live Fandom "fandomdesktop / odyssey" layout, Oct 2026.
    // Notes on what changed since 3.3:
    //  - The article body is now a CSS grid (grid-template-columns: ~900px 360px),
    //    not a flex row. Zeroing column-gap alone left content at 900px with an
    //    empty 360px rail column, so we collapse the grid to a single column.
    //  - The left offset that clears the fixed Explore nav now lives as a
    //    margin-left on .main-container (the old body.f2-page / .app-wrapper /
    //    .base-layout-wrapper hooks no longer exist), so those dead rules are gone.
    //  - The age-gate modal's hashed class (AgeGateDialog-module_modal__huX7o)
    //    changes on every redeploy, so it's matched by substring instead.

    document.documentElement.appendChild(document.createElement('style')).textContent = `
        /* --- Hide chrome / clutter --- */
        #global-explore-navigation,
        #onetrust-consent-sdk,
        .page__right-rail,
        #age-gate,
        [class*="AgeGateDialog"],
        .notifications-placeholder {
            display: none !important;
        }

        /* --- Reclaim the space the fixed left nav reserved --- */
        /* The 124px margin-left on .main-container offsets content to clear the
           66px fixed Explore nav we just hid; remove it and go full width. */
        .main-container {
            margin-left: 0 !important;
            width: 100% !important;
        }

        /* --- Collapse the right-rail grid column so the article fills the width --- */
        /* Not while VisualEditor is active, so editing keeps its own layout. */
        html:not(.ve-active) .page.has-right-rail {
            grid-template-columns: minmax(0, 1fr) !important;
            column-gap: 0 !important;
        }

        /* --- Full-width community header banner --- */
        .fandom-community-header__background.fullScreen {
            width: 100% !important;
        }

        .fandom-community-header__background.fitCenter {
            background-size: cover !important;
        }

        /* --- Ad placeholders --- */
        /* Fandom prefixes every ad container with "fandom-ad-", so this is
           precise and safe. Delete this block if you'd rather keep ads. */
        [class*="fandom-ad-"],
        .top-ads-container,
        .bottom-ads-container {
            display: none !important;
        }
    `;
})();
// ==UserScript==
// @name         Form Tools
// @namespace    https://github.com/arrupe/
// @version      1.2.0
// @description  Reveal passwords on hover; Alt-hover/Shift-click/Ctrl+Alt-click checkbox shortcuts; resizable or auto-expanding textareas; Ctrl+right-click a textarea for a basic rich-text toolbar.
// @author       arrupe
// @license      MIT
// @match        https://*/*
// @match        http://*/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @icon         https://cdn-icons-png.flaticon.com/512/13330/13330986.png
// ==/UserScript==

(() => {
    'use strict';

    // Based on Show Password onMouseOver (arrupe), Select All Checkboxes
    // (Hoothin), Auto-Expand / Resizable Textareas, and Rich Text Editor Enabler.
    // No external dependencies.
    const OPTIONS = Object.freeze({
        revealPasswords: true,
        visibleOnly: true,
        customCheckboxes: true,     // Requires role="checkbox" and aria-checked.
        resizableTextareas: true,   // Force textareas to be user-resizable.
        autoExpandTextareas: false, // Grow textarea height to fit content as you type.
        richTextEditor: true,       // Ctrl + right-click a textarea to add a formatting toolbar.
        richTextSubmitHtml: true,   // Write the editor's HTML back to the textarea (vs. plain text).
    });

    const NATIVE = 'input[type="checkbox"]';
    const CUSTOM = '[role="checkbox"][aria-checked]';
    const SELECTOR = OPTIONS.customCheckboxes ? `${NATIVE},${CUSTOM}` : NATIVE;
    const hoverRoots = new WeakSet();
    const handledHoverEvents = new WeakSet();
    let revealedPassword = null;
    let lastCheckbox = null;
    let hoveredCheckbox = null;

    const isNative = element => element.matches(NATIVE);
    const parentOf = node => node.parentElement || node.getRootNode().host || null;

    function isCheckbox(element) {
        return element?.nodeType === 1 && typeof element.click === 'function' &&
            element.matches(SELECTOR) &&
            (isNative(element) || !element.querySelector(NATIVE));
    }

    function checkboxFromPath(path, allowLabels = false) {
        for (const node of path) {
            if (isCheckbox(node)) return node;
            if (allowLabels && node?.localName === 'label' &&
                node.control && isNative(node.control)) return node.control;
        }
        return null;
    }

    function checkboxFromNode(node) {
        const path = [];
        for (let current = node; current?.nodeType === 1; current = parentOf(current)) {
            path.push(current);
        }
        return checkboxFromPath(path, true);
    }

    function isVisible(element) {
        if (!element.getClientRects().length) return false;
        const visibility = getComputedStyle(element).visibility;
        return visibility !== 'hidden' && visibility !== 'collapse';
    }

    function isEligible(element) {
        if (!isCheckbox(element) || !element.isConnected || element.matches(':disabled')) {
            return false;
        }
        for (let node = element; node; node = parentOf(node)) {
            if (node.matches('[inert],[aria-disabled="true"]')) return false;
        }
        if (!OPTIONS.visibleOnly || isVisible(element)) return true;

        // Support styled checkboxes whose native input is hidden behind a label.
        return isNative(element) && Array.from(element.labels || []).some(isVisible);
    }

    function getCheckboxes(root = document) {
        return Array.from(root.querySelectorAll(SELECTOR)).filter(isEligible);
    }

    function checkedState(element) {
        if (isNative(element)) return element.checked;
        const state = element.getAttribute('aria-checked');
        return state === 'mixed' ? null : state === 'true';
    }

    function setChecked(element, checked) {
        if (!isEligible(element)) return;
        if (checkedState(element) !== checked) {
            // Use the site's normal click handling; do not force framework state.
            element.click();
        } else if (isNative(element) && element.indeterminate) {
            element.indeterminate = false;
        }
    }

    function applyState(elements, checked) {
        for (const element of elements) setChecked(element, checked);
    }

    function formOwner(element) {
        return element.form || element.closest('form');
    }

    function getRange(first, last) {
        if (!first?.isConnected || first.getRootNode() !== last.getRootNode() ||
            formOwner(first) !== formOwner(last)) return [];

        const owner = formOwner(last);
        const boxes = getCheckboxes(last.getRootNode())
            .filter(element => formOwner(element) === owner);
        const start = boxes.indexOf(first);
        const end = boxes.indexOf(last);
        return start < 0 || end < 0
            ? []
            : boxes.slice(Math.min(start, end), Math.max(start, end) + 1);
    }

    function hidePassword() {
        if (!revealedPassword) return;
        const { element, attributes } = revealedPassword;
        revealedPassword = null;
        element.removeEventListener('pointerleave', hidePassword);
        if (element.type === 'text') element.type = 'password';
        for (const [name, value] of attributes) {
            if (value === null) element.removeAttribute(name);
            else element.setAttribute(name, value);
        }
    }

    function showPassword(element) {
        if (!OPTIONS.revealPasswords || document.hidden || element.type !== 'password') return;
        hidePassword();
        const attributes = ['spellcheck', 'autocorrect'].map(name =>
            [name, element.getAttribute(name)]);
        element.setAttribute('spellcheck', 'false');
        element.setAttribute('autocorrect', 'off');
        element.type = 'text';
        revealedPassword = { element, attributes };
        element.addEventListener('pointerleave', hidePassword);
    }

    function watchHoverRoot(root) {
        if (hoverRoots.has(root)) return;
        hoverRoots.add(root);
        root.addEventListener('pointerover', onPointerOver, true);
        root.addEventListener('pointerout', onPointerOut, true);
    }

    function prepareHover(event) {
        if (!event.isTrusted || event.pointerType !== 'mouse' ||
            handledHoverEvents.has(event)) return null;
        handledHoverEvents.add(event);
        const path = event.composedPath();

        // Learn open shadow roots when encountered; no DOM-wide scans or polling.
        // Local listeners also receive transitions between children in one root.
        for (const node of path) {
            if (node?.nodeType === 11 && node.host) watchHoverRoot(node);
            if (node?.shadowRoot) watchHoverRoot(node.shadowRoot);
        }
        return path;
    }

    function onPointerOver(event) {
        const path = prepareHover(event);
        if (!path) return;
        if (revealedPassword && !path.includes(revealedPassword.element)) hidePassword();
        const password = path.find(node =>
            node?.localName === 'input' && node.type === 'password');
        if (password) showPassword(password);

        const checkbox = checkboxFromPath(path, true);
        const previous = hoveredCheckbox;
        hoveredCheckbox = checkbox;
        if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
        if (checkbox && checkbox !== previous && isEligible(checkbox) &&
            checkboxFromNode(event.relatedTarget) !== checkbox) {
            checkbox.click();
        }
    }

    function onPointerOut(event) {
        const path = prepareHover(event);
        if (!path) return;
        if (checkboxFromNode(event.relatedTarget) !== hoveredCheckbox) hoveredCheckbox = null;
        if (revealedPassword && path.includes(revealedPassword.element)) hidePassword();
    }

    function onClick(event) {
        if (!event.isTrusted || event.button !== 0 || event.defaultPrevented) return;

        // Do not resolve labels here: their forwarded input click is handled once.
        const checkbox = checkboxFromPath(event.composedPath());
        if (!checkbox || !isEligible(checkbox)) return;
        const previous = lastCheckbox;
        lastCheckbox = checkbox;

        const selectAll = event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey;
        const selectRange = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
        if (!selectAll && !selectRange) return;

        const boxes = selectAll ? getCheckboxes(checkbox.getRootNode()) : getRange(previous, checkbox);
        if (!boxes.length) return; // A first Shift-click remains a normal click.

        // Native inputs are already toggled before click listeners run.
        // ARIA widgets have not yet run their own target click handler.
        const checked = isNative(checkbox) ? checkbox.checked : checkedState(checkbox) !== true;
        event.preventDefault();
        event.stopImmediatePropagation();

        // Let cancellation restore the native input first, then send plain clicks.
        // A timer (not a microtask) ensures the original event has finished.
        setTimeout(() => applyState(boxes, checked), 0);
    }

    // --- Textareas (merged from Auto-Expand / Resizable Textareas) ---
    // Resizing is one injected style rule, so it covers current and future
    // textareas with no per-element work and no DOM scanning. Auto-expand needs
    // per-element height updates, so it uses a delegated input listener plus an
    // added-nodes observer to size pre-filled textareas as they are inserted.

    function textareaFromPath(path) {
        for (const node of path) {
            if (node?.localName === 'textarea') return node;
        }
        return null;
    }

    function autoExpand(textarea) {
        textarea.style.setProperty('height', 'auto', 'important');
        textarea.style.setProperty('height', `${textarea.scrollHeight}px`, 'important');
    }

    function expandAll(root = document) {
        for (const textarea of root.querySelectorAll('textarea')) autoExpand(textarea);
    }

    function onInput(event) {
        const textarea = textareaFromPath(event.composedPath());
        if (textarea) autoExpand(textarea);
    }

    function watchAddedTextareas() {
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.localName === 'textarea') autoExpand(node);
                    else node.querySelectorAll?.('textarea').forEach(autoExpand);
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    function injectTextareaStyle() {
        if (!OPTIONS.resizableTextareas) return;
        // Horizontal-only when auto-expanding, so dragging the height doesn't
        // fight the height we set on input; otherwise free resize in both axes.
        const resize = OPTIONS.autoExpandTextareas ? 'horizontal' : 'both';
        const style = document.createElement('style');
        style.textContent = `textarea { resize: ${resize} !important; }`;
        (document.head || document.documentElement).appendChild(style);
    }

    function initTextareas() {
        injectTextareaStyle();
        if (!OPTIONS.autoExpandTextareas) return;
        document.addEventListener('input', onInput, true);
        const start = () => { expandAll(); watchAddedTextareas(); };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }

    // --- Rich text editor (merged from Rich Text Editor Enabler) ---
    // Ctrl + right-click a textarea to swap it for a contenteditable div with a
    // small Bold / Italic / Underline / List toolbar. The original textarea stays
    // in the DOM (hidden) and is kept in sync so the form still submits.
    //
    // Caveat: a <textarea> submits plain text, so with richTextSubmitHtml the
    // server receives literal HTML tags (<b>...</b>). That is only useful where
    // the destination renders or accepts HTML. Set richTextSubmitHtml:false to
    // submit plain text instead (the formatting is then visual only).

    let rteToolbar = null;

    function buildRteToolbar() {
        if (rteToolbar) return rteToolbar;
        const bar = document.createElement('div');
        Object.assign(bar.style, {
            position: 'absolute', zIndex: '2147483647', background: '#f1f1f1',
            border: '1px solid #ccc', padding: '4px', borderRadius: '4px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)', display: 'none',
        });
        const buttons = [
            { html: '<b>B</b>', cmd: 'bold' },
            { html: '<i>I</i>', cmd: 'italic' },
            { html: '<u>U</u>', cmd: 'underline' },
            { html: '&bull; List', cmd: 'insertUnorderedList' },
        ];
        for (const { html, cmd } of buttons) {
            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = html;
            Object.assign(button.style, {
                margin: '0 2px', padding: '2px 6px', cursor: 'pointer',
                border: '1px solid #999', background: '#fff',
            });
            button.addEventListener('mousedown', event => {
                event.preventDefault(); // Keep the editor focused and its selection intact.
                // execCommand is deprecated but remains the simplest cross-browser
                // way to format inside a contenteditable element.
                document.execCommand(cmd, false, null);
            });
            bar.appendChild(button);
        }
        document.body.appendChild(bar);
        rteToolbar = bar;
        return bar;
    }

    function positionRteToolbar(editor) {
        const bar = buildRteToolbar();
        const rect = editor.getBoundingClientRect();
        bar.style.top = `${rect.top + window.scrollY - 35}px`;
        bar.style.left = `${rect.left + window.scrollX}px`;
        bar.style.display = 'block';
    }

    function enableRichText(textarea) {
        if (textarea.dataset.rteEnabled) return;
        textarea.dataset.rteEnabled = 'true';

        const editor = document.createElement('div');
        editor.contentEditable = 'true';
        editor.dataset.rteEditor = 'true';
        Object.assign(editor.style, {
            width: `${textarea.clientWidth}px`,
            minHeight: `${textarea.clientHeight}px`,
            border: '1px solid #aaa', padding: '6px', overflowY: 'auto',
            background: '#fff', color: '#000', resize: 'both',
        });
        // textContent, not innerHTML: treat the existing value as plain text so
        // any markup already in the field is shown, not parsed into live nodes.
        editor.textContent = textarea.value;

        textarea.style.display = 'none';
        textarea.parentNode.insertBefore(editor, textarea.nextSibling);

        const sync = () => {
            textarea.value = OPTIONS.richTextSubmitHtml ? editor.innerHTML : editor.innerText;
        };
        sync();
        editor.addEventListener('input', sync);
        editor.addEventListener('focus', () => positionRteToolbar(editor));
    }

    function initRichText() {
        if (!OPTIONS.richTextEditor) return;
        document.addEventListener('contextmenu', event => {
            if (!event.ctrlKey) return;
            const textarea = event.target?.closest?.('textarea');
            if (!textarea) return;
            event.preventDefault();
            enableRichText(textarea);
        }, true);
        // One listener hides the toolbar when the pointer goes elsewhere,
        // instead of adding a fresh document listener per converted field.
        document.addEventListener('mousedown', event => {
            if (!rteToolbar || rteToolbar.style.display === 'none') return;
            if (rteToolbar.contains(event.target)) return;
            if (event.target?.closest?.('[data-rte-editor]')) return;
            rteToolbar.style.display = 'none';
        }, true);
    }

    const registerMenu = typeof GM_registerMenuCommand === 'function'
        ? GM_registerMenuCommand
        : typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function'
            ? GM.registerMenuCommand.bind(GM)
            : null;

    if (registerMenu) {
        // Menu commands apply to this document/frame, not nested shadow roots.
        registerMenu('Select all checkboxes', () => applyState(getCheckboxes(), true));
        registerMenu('Deselect all checkboxes', () => applyState(getCheckboxes(), false));
        registerMenu('Invert checkboxes', () => {
            const targets = getCheckboxes().map(element => [element, checkedState(element) !== true]);
            for (const [element, checked] of targets) setChecked(element, checked);
        });
    }

    watchHoverRoot(document);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') hidePassword();
    }, true);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) hidePassword();
    });
    window.addEventListener('blur', hidePassword);
    window.addEventListener('pagehide', hidePassword);
    initTextareas();
    initRichText();
})();
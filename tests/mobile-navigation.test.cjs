// Offline behavior fixture: no browser, network, or third-party dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(process.env.SITE_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');
const buttonTag = html.match(/<button\b[^>]*class="mobile-menu-btn"[^>]*>/)[0];
const navigation = html.match(/<div\b[^>]*class="mobile-nav"[^>]*>([\s\S]*?)<\/div>/);
const script = html.slice(html.indexOf('// Close mobile menu on link click'), html.indexOf('// Dynamic days counter'));

function fixture() {
    function element() {
        const classes = new Set();
        const attributes = new Map();
        const listeners = [];
        return {
            classList: {
                contains: name => classes.has(name),
                remove: name => classes.delete(name),
                toggle(name) {
                    if (classes.has(name)) { classes.delete(name); return false; }
                    classes.add(name); return true;
                }
            },
            setAttribute: (name, value) => attributes.set(name, String(value)),
            getAttribute: name => attributes.get(name),
            addEventListener(type, fn) { assert.equal(type, 'click'); listeners.push(fn); },
            click() { listeners.forEach(fn => fn()); }
        };
    }
    const button = element();
    const menu = element();
    const links = Array.from(navigation[1].matchAll(/<a\b/g), () => element());
    button.setAttribute('aria-expanded', buttonTag.match(/aria-expanded="([^"]+)"/)[1]);
    const context = vm.createContext({ document: {
        querySelector: selector => ({ '.mobile-nav': menu, '.mobile-menu-btn': button })[selector],
        querySelectorAll(selector) { assert.equal(selector, '.mobile-nav a'); return links; }
    }});
    // Inline handlers are registered before the bottom-of-page listener.
    const inline = buttonTag.match(/onclick="([^"]+)"/);
    if (inline) button.addEventListener('click', () => vm.runInContext(inline[1], context));
    vm.runInContext(script, context);
    return { button, menu, links };
}

function state(ui, expanded) {
    assert.equal(ui.menu.classList.contains('active'), expanded, 'menu visibility class');
    assert.equal(ui.button.getAttribute('aria-expanded'), String(expanded), 'announced expanded state');
}

test('initial state is collapsed and controls the navigation element', () => {
    state(fixture(), false);
    assert.equal(buttonTag.match(/aria-controls="([^"]+)"/)[1], navigation[0].match(/id="([^"]+)"/)[1]);
});
test('opening announces expanded', () => {
    const ui = fixture(); ui.button.click(); state(ui, true);
});
test('closing announces collapsed', () => {
    const ui = fixture(); ui.button.click(); ui.button.click(); state(ui, false);
});
test('repeated activations keep visual and announced state synchronized', () => {
    const ui = fixture();
    for (let i = 0; i < 10; i++) { ui.button.click(); state(ui, i % 2 === 0); }
});
test('each navigation link closes the menu and allows reopening', () => {
    const ui = fixture(); assert.ok(ui.links.length > 0);
    for (const link of ui.links) {
        ui.button.click(); link.click(); state(ui, false);
        ui.button.click(); state(ui, true); link.click();
    }
});

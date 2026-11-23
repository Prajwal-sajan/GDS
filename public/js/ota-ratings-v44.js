/* OTA Ratings settings v44 — no scraped metrics or fake OTA sync. */
(function () {
  'use strict';
  const names = { redbus:'RedBus', abhibus:'AbhiBus' };
  const state = { provider:'abhibus', settingsProvider:'abhibus', open:false, providers:null, canConfigure:false };
  const E = value => window.esc(String(value == null ? '' : value));
  const escName = provider => names[provider] || 'OTA';
  const button = (value, active, action) =>
    '<button type="button" data-ds-action="' + action + ':' + value +
    '" class="' + (active === value ? 'on' : '') + '" aria-pressed="' + (active === value ? 'true' : 'false') + '">' +
    escName(value) + '</button>';
  const api = {
    get provider() { return state.provider; },
    get open() { return state.open; },
    matches(row) {
      const source = String(row && row.ota || '').toLowerCase().replace(/[^a-z]/g,'');
      return source === state.provider;
    },
    async load() {
      try {
        const response = await G.get('/ota-ratings/settings');
        state.providers = response.providers || {};
        state.canConfigure = true;
      } catch (error) {
        state.providers = null;
        state.canConfigure = false;
      }
    },
    sourceLabel() {
      const info = state.providers && state.providers[state.provider];
      if (info && info.live_connector_available && info.last_fetched_at) {
        return 'Updated from ' + escName(state.provider) + ' · ' + E(info.last_fetched_at);
      }
      return 'GDS rating records · ' + escName(state.provider) + ' live feed not connected';
    },
    providerToggle() {
      return '<div class="ds-ota-switch" role="group" aria-label="OTA ratings provider">' +
        button('redbus',state.provider,'ota-provider') +
        button('abhibus',state.provider,'ota-provider') + '</div>';
    },
    panelHtml(canEdit) {
      if (!state.open) return '';
      const provider = state.settingsProvider;
      const info = state.providers && state.providers[provider] || {};
      const abi = provider === 'abhibus';
      const name = abi ? 'AbhiBus (EDGE) login' : 'RedBus operator login';
      const description = abi
        ? 'Your login at edge.abhibus.com. Used to fetch your ratings from AbhiBus. Refresh fetches the latest; it also fetches every 3 hours.'
        : 'Set the operator account used for permitted RedBus ratings access. Live syncing requires an approved RedBus connector.';
      const saved = info.password_saved === true;
      const note = abi
        ? 'SaveTrip uses this login only to READ your ratings and reviews; nothing is replied to, rated or sent on AbhiBus. The password is never shown again.'
        : 'Credentials are stored for read-only ratings access. No reply, rating or message is posted to RedBus. The password is never shown again.';
      const ability = state.canConfigure && canEdit;
      return '<section class="ds-ota-settings-panel" aria-label="OTA Ratings settings">' +
        '<div class="ds-ota-provider-tabs" role="group" aria-label="Configure OTA provider">' +
        button('redbus',provider,'ota-settings-provider') + button('abhibus',provider,'ota-settings-provider') + '</div>' +
        '<h3 class="ds-ota-settings-title">' + name + '</h3>' +
        '<p class="ds-ota-settings-description">' + description + '</p>' +
        '<form data-ds-ota-form autocomplete="off">' +
        '<div class="ds-ota-settings-grid">' +
        '<label class="ds-ota-settings-field"><span>' + (abi ? 'EDGE username' : 'RedBus username') + '</span>' +
        '<input data-ds-ota-username name="username" type="text" maxlength="256" spellcheck="false" value="' + E(info.username || '') + '" ' + (ability ? '' : 'disabled ') + 'autocomplete="off" /></label>' +
        '<label class="ds-ota-settings-field"><span>' + (abi ? 'EDGE password' : 'RedBus password') + '</span>' +
        '<input data-ds-ota-password name="password" type="password" maxlength="1024" ' +
        'placeholder="' + (saved ? 'Saved. Leave blank to keep it' : 'Enter password') + '" ' +
        (ability ? '' : 'disabled ') + 'autocomplete="new-password" /></label>' +
        '</div>' +
        '<p class="ds-ota-settings-privacy">' + note + '</p>' +
        '<div class="ds-ota-settings-actions"><button type="submit" class="ds-ota-save" data-ds-action="ota-save" ' +
        (ability ? '' : 'disabled ') + '>Save</button>' +
        '<button type="button" data-ds-action="ota-cancel">Cancel</button></div>' +
        '<p class="ds-ota-settings-hint" role="status">' +
        (ability ? 'Credentials are encrypted on the server when a credential key is configured. Live OTA imports and 3-hour polling are inactive until the provider connector is authorized and implemented.' :
          'Account settings can only be changed by users with Settings Modify permission.') +
        '</p></form></section>';
    },
    toggle() { state.open = !state.open; state.settingsProvider = state.provider; },
    cancel() { state.open = false; state.settingsProvider = state.provider; },
    chooseProvider(provider) {
      if (!names[provider]) return;
      state.provider = provider;
      if (state.open) state.settingsProvider = provider;
    },
    chooseSettingsProvider(provider) {
      if (names[provider]) state.settingsProvider = provider;
    },
    async save(el) {
      const form = el.querySelector('[data-ds-ota-form]');
      if (!form || !state.canConfigure) throw new Error('OTA settings are unavailable');
      const username = form.querySelector('[data-ds-ota-username]').value;
      const password = form.querySelector('[data-ds-ota-password]').value;
      const provider = state.settingsProvider;
      const result = await G.put('/ota-ratings/settings/' + provider, { username, password });
      state.providers = Object.assign({},state.providers,{ [provider]:result.settings });
      form.querySelector('[data-ds-ota-password]').value = '';
      state.open = false;
      G.toast('Account settings saved. OTA live sync is not yet connected.', 'ok');
    },
    async refresh() {
      try {
        await G.post('/ota-ratings/refresh/' + state.provider, {});
      } catch (error) {
        G.toast(error.message || 'Live OTA refresh is not connected', 'warn');
      }
    }
  };
  window.OTARatingsV44 = api;
})();

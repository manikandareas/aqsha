# Selia Components

These components were generated from the Selia registry during Phase 2 of the UI migration and curated into `@aqsha/ui`.

Generated component set:

- `accordion`
- `alert`
- `alert-dialog`
- `autocomplete`
- `avatar`
- `badge`
- `breadcrumb`
- `button`
- `card`
- `checkbox`
- `chip`
- `collapsible`
- `combobox`
- `command`
- `dialog`
- `divider`
- `drawer`
- `field`
- `fieldset`
- `form`
- `heading`
- `icon-box`
- `input`
- `input-group`
- `item`
- `kbd`
- `label`
- `menu`
- `menubar`
- `meter`
- `number-field`
- `pagination`
- `popover`
- `preview-card`
- `progress`
- `radio`
- `scroll-area`
- `select`
- `separator`
- `sidebar`
- `slider`
- `spinner`
- `stack`
- `switch`
- `table`
- `tabs`
- `text`
- `textarea`
- `toast`
- `toggle`
- `toggle-group`
- `toolbar`
- `tooltip`

Local curation:

- imports use the package-local `../lib/cn` helper instead of an app-local alias;
- generated source stays under `src/selia` so app code can import explicit paths like `@aqsha/ui/selia/button`;
- Selia theme CSS lives in `src/styles/selia.css`.

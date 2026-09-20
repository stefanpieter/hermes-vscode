import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as {
  contributes: {
    viewsContainers: Record<string, { id: string }[]>;
    views: Record<string, { id: string }[]>;
    menus?: Record<string, { command: string }[]>;
    commands: { command: string; icon?: unknown }[];
  };
};

test('declares exactly one webview view', () => {
  // ChatPanelProvider keeps a single `this.view`, so a second container
  // resolving the same provider overwrites it and every post() goes to the
  // hidden panel — the chat renders nothing while still reporting Connected.
  const views = Object.values(manifest.contributes.views).flat();
  assert.equal(views.length, 1, 'a second view would silently steal this.view');
  assert.equal(views[0].id, 'hermes.chatView');
});

test('puts the chat in the secondary sidebar', () => {
  // "auxiliarybar" is not a real container key: the manifest accepts it and
  // the container never appears. The working key is "secondarySidebar".
  const containers = Object.keys(manifest.contributes.viewsContainers);
  assert.deepEqual(containers, ['secondarySidebar']);
});

test('contributes a title-bar button with an explicit icon', () => {
  const titleMenu = manifest.contributes.menus?.['editor/title'] ?? [];
  assert.ok(titleMenu.some(item => item.command === 'hermes.openChat'));

  const open = manifest.contributes.commands.find(c => c.command === 'hermes.openChat');
  // Without an icon the command renders as text in the title bar.
  assert.ok(open?.icon, 'hermes.openChat needs an icon to appear as a button');
});

test('the icon carries its own colour', () => {
  // currentColor resolves to black in the editor title bar, which renders the
  // icon as an unreadable silhouette on a dark toolbar.
  const svg = fs.readFileSync(
    path.join(__dirname, '..', '..', 'resources', 'hermes-icon.svg'), 'utf8');
  assert.ok(!/fill="currentColor"/.test(svg), 'icon must not rely on currentColor');
  assert.match(svg, /fill="#[0-9A-Fa-f]{6}"/);
});

import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { seedPng, flowerPng, narrationWav, form } from './media.mjs';

const runtime = await startRuntime();
const json = (body) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

try {
  const { project } = await (await runtime.fetch('/api/projects', { role: 'member', method: 'POST', ...json({ name: 'Onboarding walkthrough' }) })).json();
  const up = await runtime.fetch(`/api/projects/${project.id}/scenes`, {
    role: 'member', method: 'POST',
    body: form([
      { name: 'welcome.png', type: 'image/png', data: seedPng() },
      { name: 'tour.png', type: 'image/png', data: flowerPng() },
    ]),
  });
  expect(up.status).toBe(201);
  const scenes = (await up.json()).scenes;
  expect((await runtime.fetch(`/api/projects/${project.id}/audio`, {
    role: 'member', method: 'POST',
    body: form([{ field: 'file', name: 'intro.wav', type: 'audio/wav', data: narrationWav(3) }], { durationMs: 9000 }),
  })).status).toBe(200);
  const patched = await runtime.fetch(`/api/projects/${project.id}`, {
    role: 'member', method: 'PATCH',
    ...json({ settings: { quality: '1080p', shape: '9:16', hand: false, endHold: 1.5, speed: 1.5 } }),
  });
  expect(patched.status).toBe(200);
  const before = await (await runtime.fetch(`/api/projects/${project.id}`, { role: 'member' })).json();

  await runtime.restart();

  const after = await (await runtime.fetch(`/api/projects/${project.id}`, { role: 'member' })).json();
  expect(after).toEqual(before);
  expect(after.project.settings).toMatchObject({ quality: '1080p', shape: '9:16', hand: false, endHold: 1.5, speed: 1.5, colorReveal: true });
  expect(after.project.audio).toMatchObject({ name: 'intro.wav', durationMs: 9000 });
  expect(after.scenes.map((s) => s.name)).toEqual(['welcome.png', 'tour.png']);
  expect(after.scenes.reduce((a, s) => a + s.durationMs, 0)).toBe(7500);
  const img = await runtime.fetch(`/api/files/scenes/${scenes[1].id}`, { role: 'member' });
  expect(Buffer.from(await img.arrayBuffer()).equals(flowerPng())).toBe(true);
  const audio = await runtime.fetch(`/api/files/audio/${project.id}`, { role: 'member' });
  expect(Buffer.from(await audio.arrayBuffer()).equals(narrationWav(3))).toBe(true);

  const listed = await (await runtime.fetch('/api/projects', { role: 'member' })).json();
  expect(listed.projects.find((p) => p.id === project.id)).toMatchObject({ name: 'Onboarding walkthrough', sceneCount: 2 });

  const ctx = await runtime.context('member');
  const page = await ctx.newPage();
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByTestId('scene-item')).toHaveCount(2);
  await expect(page.getByTestId('summary')).toContainText('0:09');
  await expect(page.getByTestId('summary')).toContainText('1080p · 9:16');
  await ctx.close();
} finally {
  await runtime.close();
}

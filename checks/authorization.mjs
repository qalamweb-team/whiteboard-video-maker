import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { seedPng, narrationWav, form } from './media.mjs';

const runtime = await startRuntime();
const json = (body) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

try {
  await runtime.assertPrivateAccess(['/', '/api/projects']);

  // The owner's private project, with an image and a voiceover.
  const created = await runtime.fetch('/api/projects', { role: 'owner', method: 'POST', ...json({ name: 'Quarterly plan' }) });
  expect(created.status).toBe(201);
  const { project } = await created.json();
  const up = await runtime.fetch(`/api/projects/${project.id}/scenes`, {
    role: 'owner', method: 'POST', body: form([{ name: 'plan.png', type: 'image/png', data: seedPng() }]),
  });
  expect(up.status).toBe(201);
  const [scene] = (await up.json()).scenes;
  expect((await runtime.fetch(`/api/projects/${project.id}/audio`, {
    role: 'owner', method: 'POST',
    body: form([{ field: 'file', name: 'talk.wav', type: 'audio/wav', data: narrationWav(2) }], { durationMs: 2000 }),
  })).status).toBe(200);

  const privatePaths = [
    `/projects/${project.id}`,
    `/api/projects/${project.id}`,
    `/api/files/scenes/${scene.id}`,
    `/api/files/audio/${project.id}`,
  ];

  // Anonymous visitors and other organizations are refused everywhere.
  for (const role of [undefined, 'outsider']) {
    for (const path of privatePaths) {
      const res = await runtime.fetch(path, { role });
      expect([401, 403, 302, 303]).toContain(res.status);
    }
    const write = await runtime.fetch(`/api/projects/${project.id}/scenes`, {
      role, method: 'POST', body: form([{ name: 'x.png', type: 'image/png', data: seedPng() }]),
    });
    expect([401, 403, 302, 303]).toContain(write.status);
  }

  // Another member of the same organization can neither read nor change it.
  const list = await (await runtime.fetch('/api/projects', { role: 'member' })).json();
  expect(list.projects.map((p) => p.id)).not.toContain(project.id);
  for (const path of privatePaths.slice(1)) {
    expect((await runtime.fetch(path, { role: 'member' })).status).toBe(404);
  }
  expect((await runtime.fetch(`/api/projects/${project.id}`, { role: 'member', method: 'PATCH', ...json({ name: 'Taken' }) })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${project.id}`, { role: 'member', method: 'PATCH', ...json({ settings: { quality: '480p' } }) })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${project.id}/scenes`, {
    role: 'member', method: 'POST', body: form([{ name: 'x.png', type: 'image/png', data: seedPng() }]),
  })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${project.id}/audio`, { role: 'member', method: 'DELETE' })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${project.id}`, { role: 'member', method: 'DELETE' })).status).toBe(404);

  // In the browser the member sees no trace of it, in the list or the editor.
  const ctx = await runtime.context('member');
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Quarterly plan')).toHaveCount(0);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByTestId('project-missing')).toBeVisible();
  await expect(page.getByText('Quarterly plan')).toHaveCount(0);
  await expect(page.getByTestId('scene-item')).toHaveCount(0);
  await ctx.close();

  // The owner's project is untouched.
  const detail = await (await runtime.fetch(`/api/projects/${project.id}`, { role: 'owner' })).json();
  expect(detail.project.name).toBe('Quarterly plan');
  expect(detail.project.settings.quality).toBe('720p');
  expect(detail.project.audio.name).toBe('talk.wav');
  expect(detail.scenes).toHaveLength(1);

  // The app has no sign-in of its own.
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/register', '/logout']) {
    const res = await runtime.fetch(path, { role: 'member' });
    expect(res.status).not.toBe(200);
    expect(await res.text()).not.toMatch(/type="password"/i);
  }
  const home = await runtime.fetch('/', { role: 'member' });
  expect(await home.text()).not.toMatch(/type="password"/i);
} finally {
  await runtime.close();
}

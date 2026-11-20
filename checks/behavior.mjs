import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { seedPng, sproutPng, flowerPng, narrationWav, form } from './media.mjs';

const runtime = await startRuntime();
const png = (name, data) => ({ name, mimeType: 'image/png', buffer: data });

async function durations(page) {
  const inputs = page.getByTestId('scene-duration');
  const n = await inputs.count();
  const out = [];
  for (let i = 0; i < n; i++) out.push(Number(await inputs.nth(i).inputValue()));
  return out;
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
async function saved(page) {
  await expect(page.getByTestId('save-state')).toHaveText('Saved', { timeout: 10000 });
}

try {
  // ---- Request-level: projects, image scenes and voiceover through the API.
  const created = await runtime.fetch('/api/projects', {
    role: 'member', method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Water cycle' }),
  });
  expect(created.status).toBe(201);
  const { project } = await created.json();
  expect(project.name).toBe('Water cycle');
  expect(project.settings.quality).toBe('720p');
  expect(project.settings.shape).toBe('auto');
  expect(project.settings.endHold).toBe(2);

  const up = await runtime.fetch(`/api/projects/${project.id}/scenes`, {
    role: 'member', method: 'POST',
    body: form([
      { name: 'clouds.png', type: 'image/png', data: seedPng() },
      { name: 'rain.png', type: 'image/png', data: sproutPng() },
    ]),
  });
  expect(up.status).toBe(201);
  const upBody = await up.json();
  expect(upBody.scenes.map((s) => s.name)).toEqual(['clouds.png', 'rain.png']);
  expect(upBody.scenes.every((s) => s.durationMs > 0)).toBe(true);

  const refused = await runtime.fetch(`/api/projects/${project.id}/scenes`, {
    role: 'member', method: 'POST',
    body: form([{ name: 'notes.txt', type: 'text/plain', data: Buffer.from('hello') }]),
  });
  expect(refused.status).toBe(400);
  expect((await refused.json()).error).toMatch(/JPG or PNG/);

  const img = await runtime.fetch(`/api/files/scenes/${upBody.scenes[0].id}`, { role: 'member' });
  expect(img.status).toBe(200);
  expect(img.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await img.arrayBuffer()).equals(seedPng())).toBe(true);

  const audio = await runtime.fetch(`/api/projects/${project.id}/audio`, {
    role: 'member', method: 'POST',
    body: form([{ field: 'file', name: 'voice.wav', type: 'audio/wav', data: narrationWav(10) }], { durationMs: 10000 }),
  });
  expect(audio.status).toBe(200);
  const detail = await (await runtime.fetch(`/api/projects/${project.id}`, { role: 'member' })).json();
  expect(detail.project.audio).toMatchObject({ name: 'voice.wav', durationMs: 10000 });
  // Sync is on by default: scenes plus the 2 s end hold fill the 10 s voiceover.
  expect(sum(detail.scenes.map((s) => s.durationMs))).toBe(8000);
  const badAudio = await runtime.fetch(`/api/projects/${project.id}/audio`, {
    role: 'member', method: 'POST',
    body: form([{ field: 'file', name: 'voice.png', type: 'image/png', data: seedPng() }], { durationMs: 1000 }),
  });
  expect(badAudio.status).toBe(400);
  expect((await badAudio.json()).error).toMatch(/MP3, WAV or M4A/);
  const audioFile = await runtime.fetch(`/api/files/audio/${project.id}`, { role: 'member' });
  expect(audioFile.status).toBe(200);
  expect((await runtime.fetch(`/api/projects/${project.id}/audio`, { role: 'member', method: 'DELETE' })).status).toBe(200);
  const noAudio = await (await runtime.fetch(`/api/projects/${project.id}`, { role: 'member' })).json();
  expect(noAudio.project.audio).toBeNull();

  // ---- Phone-sized smoke.
  {
    const phone = await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await phone.newPage();
    await p.goto('/');
    await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(p.getByTestId('project-row').filter({ hasText: 'Water cycle' })).toBeVisible();
    await expect(p.getByTestId('new-project')).toBeVisible();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await phone.close();
  }

  // ---- Browser journey as the owner.
  const ctx = await runtime.context('owner');
  const page = await ctx.newPage();
  await page.goto('/');
  await runtime.assertBackLink(page);
  await expect(page.getByTestId('projects-empty')).toBeVisible();

  // F001: create, rename, delete.
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('Draft idea');
  await Promise.all([page.waitForURL(/\/projects\/[^/]+$/), page.getByTestId('project-name-submit').click()]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Draft idea');
  await page.goto('/');
  const draftRow = page.getByTestId('project-row').filter({ hasText: 'Draft idea' });
  await expect(draftRow).toContainText('0 scenes');
  await draftRow.getByTestId('rename-project').click();
  await page.getByTestId('project-name-input').fill('Old draft');
  await page.getByTestId('project-name-submit').click();
  const oldRow = page.getByTestId('project-row').filter({ hasText: 'Old draft' });
  await expect(oldRow).toBeVisible();
  await oldRow.getByTestId('delete-project').click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByTestId('projects-empty')).toBeVisible();

  await page.getByTestId('new-project').click();
  await page.getByTestId('project-name-input').fill('How plants grow');
  await Promise.all([page.waitForURL(/\/projects\/[^/]+$/), page.getByTestId('project-name-submit').click()]);
  const editorUrl = page.url();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How plants grow');

  // F002: several images at once, refused types, reorder, remove.
  await page.getByTestId('image-input').setInputFiles([
    png('seed.png', seedPng()), png('sprout.png', sproutPng()), png('flower.png', flowerPng()), png('extra.png', seedPng()),
  ]);
  await expect(page.getByTestId('scene-item')).toHaveCount(4);
  await expect(page.getByTestId('scene-item').nth(0)).toContainText('seed.png');
  expect(await durations(page)).toEqual([5, 5, 5, 5]);
  await page.getByTestId('image-input').setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }]);
  await expect(page.getByTestId('upload-error')).toContainText('JPG or PNG');
  await expect(page.getByTestId('scene-item')).toHaveCount(4);
  await page.getByTestId('scene-item').nth(3).getByRole('button', { name: 'Remove scene 4' }).click();
  await expect(page.getByTestId('scene-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Move scene 1 later' }).click();
  await expect(page.getByTestId('scene-item').nth(0)).toContainText('sprout.png');
  await page.getByRole('button', { name: 'Move scene 2 earlier' }).click();
  await expect(page.getByTestId('scene-item').nth(0)).toContainText('seed.png');
  const scene1Img = page.getByTestId('scene-item').nth(0).locator('img');
  await expect(scene1Img).toBeVisible();
  expect(await scene1Img.evaluate((el) => el.naturalWidth)).toBe(800);

  // F004: summary and defaults.
  await expect(page.getByTestId('summary')).toContainText('3 images');
  await expect(page.getByTestId('summary')).toContainText('0:17');
  await expect(page.getByTestId('summary')).toContainText('720p · Auto');

  // F002/F005: a duration typed in, and the timeline in proportion.
  await page.getByTestId('scene-duration').nth(0).fill('2.5');
  await page.getByTestId('scene-duration').nth(0).press('Enter');
  await saved(page);
  await expect(page.getByTestId('summary')).toContainText('0:15');
  const clips = page.getByTestId('timeline-clip');
  await expect(clips).toHaveCount(3);
  const w0 = (await clips.nth(0).boundingBox()).width;
  const w1 = (await clips.nth(1).boundingBox()).width;
  expect(Math.abs(w0 / w1 - 0.5)).toBeLessThan(0.08);

  // F005: drag an edge to lengthen a scene.
  const handle = clips.nth(1).getByTestId('clip-resize');
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 60, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await saved(page);
  const afterResize = await durations(page);
  expect(afterResize[1]).toBeGreaterThan(5);
  expect(afterResize[0]).toBe(2.5);

  // F005: drag a scene along the timeline to reorder it.
  const c0 = await clips.nth(0).boundingBox();
  const c2 = await clips.nth(2).boundingBox();
  await page.mouse.move(c0.x + c0.width / 2, c0.y + 10);
  await page.mouse.down();
  await page.mouse.move(c2.x + c2.width - 4, c2.y + 10, { steps: 10 });
  await page.mouse.up();
  await saved(page);
  await expect(page.getByTestId('scene-item').nth(2)).toContainText('seed.png');
  await expect(page.getByTestId('timeline-clip').nth(2)).toContainText('3');
  await page.getByRole('button', { name: 'Move scene 3 earlier' }).click();
  await page.getByRole('button', { name: 'Move scene 2 earlier' }).click();
  await expect(page.getByTestId('scene-item').nth(0)).toContainText('seed.png');
  await saved(page);

  // F003: voiceover, sync on by default, manual edits become the new split.
  await page.getByTestId('audio-input').setInputFiles([{ name: 'narration.wav', mimeType: 'audio/wav', buffer: narrationWav(6) }]);
  await expect(page.getByTestId('audio-info')).toContainText('narration.wav');
  await expect(page.getByTestId('audio-info')).toContainText('0:06');
  await expect(page.getByTestId('toggle-sync')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('summary')).toContainText('0:06');
  expect(Math.abs(sum(await durations(page)) - 4)).toBeLessThan(0.05);
  await page.getByTestId('scene-duration').nth(0).fill('2');
  await page.getByTestId('scene-duration').nth(0).press('Enter');
  await saved(page);
  const split = await durations(page);
  expect(split[0]).toBe(2);
  expect(Math.abs(sum(split) - 4)).toBeLessThan(0.05);
  await expect(page.getByTestId('summary')).toContainText('0:06');
  await page.getByTestId('audio-input').setInputFiles([{ name: 'cover.png', mimeType: 'image/png', buffer: seedPng() }]);
  await expect(page.getByTestId('upload-error')).toContainText('MP3, WAV or M4A');
  await expect(page.getByTestId('audio-info')).toContainText('narration.wav');

  // F004: render settings, advanced values, and they reopen as left.
  await page.getByTestId('quality-1080p').click();
  await page.getByTestId('shape-9:16').click();
  await page.getByTestId('toggle-hand').click();
  await expect(page.getByTestId('toggle-hand')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('advanced').click();
  await expect(page.getByTestId('setting-endHold')).toHaveValue('2');
  await page.getByTestId('setting-endHold').fill('1');
  await page.getByTestId('setting-endHold').press('Enter');
  await saved(page);
  await page.getByTestId('setting-fps').fill('500');
  await page.getByTestId('setting-fps').press('Enter');
  await saved(page);
  await expect(page.getByTestId('setting-fps')).toHaveValue('60');
  await expect(page.getByTestId('summary')).toContainText('1080p · 9:16');
  expect(Math.abs(sum(await durations(page)) - 5)).toBeLessThan(0.05);
  await page.reload();
  await expect(page.getByTestId('summary')).toContainText('3 images');
  await expect(page.getByTestId('summary')).toContainText('0:06');
  await expect(page.getByTestId('summary')).toContainText('1080p · 9:16');
  await expect(page.getByTestId('toggle-hand')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('toggle-color')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('audio-info')).toContainText('narration.wav');
  await expect(page.getByTestId('scene-item').nth(0)).toContainText('seed.png');
  await page.getByTestId('advanced').click();
  await expect(page.getByTestId('setting-endHold')).toHaveValue('1');
  await expect(page.getByTestId('setting-fps')).toHaveValue('60');

  // F005: preview plays, draws on the board, Space pauses.
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('preview-time')).not.toHaveText(/^0:00/, { timeout: 5000 });
  await page.waitForTimeout(800);
  const inked = await page.getByTestId('preview-canvas').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 160 && d[i + 1] < 160 && d[i + 2] < 160) n++;
    return n;
  });
  expect(inked).toBeGreaterThan(50);
  await page.locator('body').press('Space');
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('aria-label', 'Play');

  // F006: export with cancel, then a full export to a downloadable file.
  await page.getByTestId('quality-480p').click();
  await page.getByTestId('shape-auto').click();
  await page.getByTestId('toggle-hand').click();
  await saved(page);
  await page.getByTestId('export').click();
  await expect(page.getByTestId('export-progress')).toBeVisible();
  await page.getByTestId('export-cancel').click();
  await expect(page.getByTestId('export-progress')).toBeHidden();
  await expect(page.getByTestId('download-link')).toBeHidden();
  await page.getByTestId('export').click();
  await expect(page.getByTestId('export-progress')).toBeVisible();
  const link = page.getByTestId('download-link');
  await expect(link).toBeVisible({ timeout: 40000 });
  const fileName = await link.getAttribute('download');
  expect(fileName).toMatch(/^How plants grow\.(mp4|webm)$/);
  const video = await link.evaluate(async (a) => {
    const blob = await (await fetch(a.href)).blob();
    return { size: blob.size, type: blob.type };
  });
  expect(video.size).toBeGreaterThan(1000);
  expect(video.type).toMatch(/^video\/(mp4|webm)/);
  await expect(page.getByTestId('export-result')).toContainText('854×480');

  // The list shows the project with its scene count.
  const list = await ctx.newPage();
  await list.goto('/');
  await expect(list.getByTestId('project-row').filter({ hasText: 'How plants grow' })).toContainText('3 scenes');
  await list.close();

  expect(page.url()).toBe(editorUrl);
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  await runtime.screenshot(page);
  await ctx.close();
} finally {
  await runtime.close();
}

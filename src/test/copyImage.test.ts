import * as assert from 'assert';
import { createViewer } from './viewerHarness';

suite('Copy image as PNG', () => {
    function openMenu(viewer: ReturnType<typeof createViewer>, clientX = 250, clientY = 125): void {
        let prevented = false;
        let stopped = false;
        viewer.getElement('imageCanvas').listeners.get('contextmenu')!({
            clientX, clientY,
            preventDefault() { prevented = true; },
            stopPropagation() { stopped = true; }
        });
        assert.ok(prevented && stopped, 'the image menu must replace the webview context menu');
    }

    test('copies rendered PNG pixels at image dimensions with the displayed window settings', async () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([0, 64, 128, 255]));
        viewer.setWindow('64', '128');
        openMenu(viewer);
        assert.strictEqual(viewer.getElement('imageContextMenu').style.display, 'block');
        assert.strictEqual(viewer.getElement('copyImagePng').disabled, false);
        const paintedPixels = viewer.painted[viewer.painted.length - 1].slice();
        const copy = viewer.getElement('copyImagePng').listeners.get('click')!();
        assert.strictEqual(viewer.clipboardItems.length, 1, 'clipboard write starts before PNG encoding finishes');
        // A subsequent render must not change the image being copied.
        viewer.display(new Uint8Array([255, 128, 64, 0]), 'uint8', true, 1, 'coronal');
        await copy;
        const png = await viewer.clipboardItems[0]['image/png'];
        assert.strictEqual(png.type, 'image/png');
        assert.strictEqual(png.width, 2);
        assert.strictEqual(png.height, 2);
        assert.deepStrictEqual(png.pixels, paintedPixels);
        assert.strictEqual(viewer.getElement('imageContextMenu').style.display, 'none');
    });

    test('disables copying before rendering and after metadata changes', async () => {
        const viewer = createViewer();
        openMenu(viewer);
        assert.strictEqual(viewer.getElement('copyImagePng').disabled, true);
        await viewer.run('copyImageAsPng()');
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        openMenu(viewer);
        viewer.getElement('width').listeners.get('input')!();
        assert.strictEqual(viewer.getElement('imageContextMenu').style.display, 'none');
        openMenu(viewer);
        assert.strictEqual(viewer.getElement('copyImagePng').disabled, true);
        await viewer.run('copyImageAsPng()');
        assert.strictEqual(viewer.clipboardItems.length, 0);
    });

    test('keeps the menu in the viewport and dismisses it with Escape or an outside click', () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        openMenu(viewer, 799, 599);
        const menu = viewer.getElement('imageContextMenu');
        assert.strictEqual(menu.style.left, '616px');
        assert.strictEqual(menu.style.top, '560px');
        let prevented = false;
        viewer.documentListeners.get('keydown')!({ key: 'Escape', preventDefault() { prevented = true; } });
        assert.ok(prevented);
        assert.strictEqual(menu.style.display, 'none');
        assert.strictEqual(viewer.run('document.activeElement === canvas'), true);
        openMenu(viewer);
        viewer.documentListeners.get('pointerdown')!({ target: viewer.getElement('copyImagePng') });
        assert.strictEqual(menu.style.display, 'block');
        viewer.documentListeners.get('pointerdown')!({ target: viewer.getElement('width') });
        assert.strictEqual(menu.style.display, 'none');
    });

    test('supports the keyboard context menu without navigating slices', () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        viewer.getElement('imageCanvas').listeners.get('keydown')!({
            key: 'F10', shiftKey: true, preventDefault() {}, stopPropagation() {}
        });
        assert.strictEqual(viewer.getElement('imageContextMenu').style.display, 'block');
        const requests = viewer.postedMessages.length;
        viewer.documentListeners.get('keydown')!({ key: 'ArrowDown', preventDefault() {} });
        assert.strictEqual(viewer.postedMessages.length, requests);
    });

    test('prevents overlapping clipboard writes', async () => {
        const viewer = createViewer();
        viewer.display(new Uint8Array([1, 2, 3, 4]));
        const firstCopy = viewer.run('copyImageAsPng()');
        openMenu(viewer);
        assert.strictEqual(viewer.getElement('copyImagePng').disabled, true);
        await viewer.run('copyImageAsPng()');
        await firstCopy;
        assert.strictEqual(viewer.clipboardItems.length, 1);
        openMenu(viewer);
        assert.strictEqual(viewer.getElement('copyImagePng').disabled, false);
    });

    for (const [setup, message] of [
        ['ClipboardItem = undefined;', 'Image clipboard access is unavailable'],
        ['navigator.clipboard.write = async () => { throw new Error("Clipboard permission denied"); };', 'Clipboard permission denied'],
        ['canvas.toBlob = callback => callback(null);', 'Unable to encode the displayed image as PNG']
    ]) {
        test(`reports copy failures: ${message}`, async () => {
            const viewer = createViewer();
            viewer.display(new Uint8Array([1, 2, 3, 4]));
            viewer.run(setup);
            await viewer.run('copyImageAsPng()');
            assert.ok(viewer.getElement('errorMessage').textContent.includes(message));
            assert.strictEqual(viewer.getElement('errorPanel').style.display, 'block');
            assert.strictEqual(viewer.run('copyingImage'), false);
        });
    }
});

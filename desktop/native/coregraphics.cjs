'use strict';

// Apple: https://developer.apple.com/documentation/coregraphics/cgevent
// Apple: https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted
// Koffi struct-by-value ABI: https://koffi.dev/composites
// Importing this module does not load native libraries or post an input event.
let bindings;
function loadBindings() {
  if (process.platform !== 'darwin') throw new Error('Desktop control requires macOS.');
  if (bindings) return bindings;
  const koffi = require('koffi');
  const point = koffi.struct({x: 'double', y: 'double'});
  const size = koffi.struct({width: 'double', height: 'double'});
  const rect = koffi.struct({origin: point, size});
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  const ax = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
  bindings = {
    mainDisplay: cg.func('CGMainDisplayID', 'uint32_t', []),
    displayBounds: cg.func('CGDisplayBounds', rect, ['uint32_t']),
    createMouse: cg.func('CGEventCreateMouseEvent', 'void *', ['void *', 'uint32_t', point, 'uint32_t']),
    // The non-variadic API avoids variadic ABI differences on Apple Silicon.
    createScroll: cg.func('CGEventCreateScrollWheelEvent2', 'void *', ['void *', 'uint32_t', 'uint32_t', 'int32_t', 'int32_t', 'int32_t']),
    post: cg.func('CGEventPost', 'void', ['uint32_t', 'void *']),
    release: cf.func('CFRelease', 'void', ['void *']),
    trusted: ax.func('AXIsProcessTrusted', 'uint8_t', [])
  };
  return bindings;
}

function createNativeDriver() {
  function bounds() {
    const native = loadBindings();
    const rect = native.displayBounds(native.mainDisplay());
    const result = {x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height};
    if (!Object.values(result).every(Number.isFinite) || result.width < 1 || result.height < 1) throw new Error('Main display bounds are unavailable.');
    return result;
  }
  const isTrusted = () => Boolean(loadBindings().trusted());
  function trustedBindings() {
    const native = loadBindings();
    if (!native.trusted()) throw new Error('Accessibility permission is required for desktop control.');
    return native;
  }
  function position(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Mouse coordinates must be finite.');
    const display = bounds();
    return {x: Math.max(display.x, Math.min(display.x + display.width - 1, x)), y: Math.max(display.y, Math.min(display.y + display.height - 1, y))};
  }
  function postAndRelease(native, event) {
    if (!event) throw new Error('macOS could not create the input event.');
    try { native.post(0, event); } finally { native.release(event); }
  }
  return Object.freeze({
    bounds,
    isTrusted,
    move(x, y) {
      const native = trustedBindings();
      postAndRelease(native, native.createMouse(null, 5, position(x, y), 0));
    },
    click(x, y) {
      const native = trustedBindings();
      const location = position(x, y);
      const down = native.createMouse(null, 1, location, 0);
      if (!down) throw new Error('macOS could not create the mouse-down event.');
      let up;
      try {
        up = native.createMouse(null, 2, location, 0);
        if (!up) throw new Error('macOS could not create the mouse-up event.');
        // Both events exist before mouse-down is posted. No held-button state.
        try { native.post(0, down); } finally { native.post(0, up); }
      } finally {
        native.release(down);
        if (up) native.release(up);
      }
    },
    scroll(delta) {
      if (!Number.isFinite(delta)) throw new TypeError('Scroll delta must be finite.');
      const pixels = Math.round(Math.max(-55, Math.min(55, delta)));
      if (!pixels) return;
      const native = trustedBindings();
      // Public driver convention: positive = content scrolls down.
      postAndRelease(native, native.createScroll(null, 0, 1, -pixels, 0, 0));
    }
  });
}

module.exports = {createNativeDriver};

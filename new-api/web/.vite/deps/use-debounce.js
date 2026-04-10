import { require_react } from './chunk-HAKT4WWI.js';
import { __toESM } from './chunk-UE53HML6.js';

// node_modules/use-debounce/dist/index.module.js
var import_react = __toESM(require_react());
function c(e2, u2, c2, i2) {
  var l2 = this,
    a2 = (0, import_react.useRef)(null),
    o = (0, import_react.useRef)(0),
    f = (0, import_react.useRef)(0),
    v = (0, import_react.useRef)(null),
    d = (0, import_react.useRef)([]),
    m = (0, import_react.useRef)(),
    s = (0, import_react.useRef)(),
    g = (0, import_react.useRef)(e2),
    h = (0, import_react.useRef)(true),
    x = (0, import_react.useRef)(),
    E = (0, import_react.useRef)();
  g.current = e2;
  var b = 'undefined' != typeof window,
    p = !u2 && 0 !== u2 && b;
  if ('function' != typeof e2) throw new TypeError('Expected a function');
  u2 = +u2 || 0;
  var y = !!(c2 = c2 || {}).leading,
    w = !('trailing' in c2) || !!c2.trailing,
    O = !!c2.flushOnExit && w,
    F = 'maxWait' in c2,
    L = 'debounceOnServer' in c2 && !!c2.debounceOnServer,
    A = F ? Math.max(+c2.maxWait || 0, u2) : null,
    D = (0, import_react.useMemo)(
      function () {
        var r2 = function (r3) {
            var n3 = d.current,
              t3 = m.current;
            return (
              (d.current = m.current = null),
              (o.current = r3),
              (f.current = f.current || r3),
              (s.current = g.current.apply(t3, n3))
            );
          },
          n2 = function (r3, n3) {
            p && cancelAnimationFrame(v.current),
              (v.current = p ? requestAnimationFrame(r3) : setTimeout(r3, n3));
          },
          t2 = function (r3) {
            if (!h.current) return false;
            var n3 = r3 - a2.current;
            return (
              !a2.current || n3 >= u2 || n3 < 0 || (F && r3 - o.current >= A)
            );
          },
          e3 = function (n3) {
            return (
              (v.current = null),
              w && d.current
                ? r2(n3)
                : ((d.current = m.current = null), s.current)
            );
          },
          c3 = function r3() {
            var c4 = Date.now();
            if ((y && f.current === o.current && D2(), t2(c4))) return e3(c4);
            if (h.current) {
              var i3 = u2 - (c4 - a2.current),
                l3 = F ? Math.min(i3, A - (c4 - o.current)) : i3;
              n2(r3, l3);
            }
          },
          D2 = function () {
            i2 && i2({});
          },
          S = function () {
            if (b || L) {
              var e4,
                i3 = Date.now(),
                f2 = t2(i3);
              if (
                ((d.current = [].slice.call(arguments)),
                (m.current = l2),
                (a2.current = i3),
                O &&
                  !x.current &&
                  ((x.current = function () {
                    var r3;
                    'hidden' ===
                      (null == (r3 = global.document)
                        ? void 0
                        : r3.visibilityState) && E.current.flush();
                  }),
                  null == (e4 = global.document) ||
                    null == e4.addEventListener ||
                    e4.addEventListener('visibilitychange', x.current)),
                f2)
              ) {
                if (!v.current && h.current)
                  return (
                    (o.current = a2.current),
                    n2(c3, u2),
                    y ? r2(a2.current) : s.current
                  );
                if (F) return n2(c3, u2), r2(a2.current);
              }
              return v.current || n2(c3, u2), s.current;
            }
          };
        return (
          (S.cancel = function () {
            var r3 = v.current;
            r3 &&
              (p ? cancelAnimationFrame(v.current) : clearTimeout(v.current)),
              (o.current = 0),
              (d.current = a2.current = m.current = v.current = null),
              r3 && i2 && i2({});
          }),
          (S.isPending = function () {
            return !!v.current;
          }),
          (S.flush = function () {
            return v.current ? e3(Date.now()) : s.current;
          }),
          S
        );
      },
      [y, F, u2, A, w, O, p, b, L, i2],
    );
  return (
    (E.current = D),
    (0, import_react.useEffect)(
      function () {
        return (
          (h.current = true),
          function () {
            var r2;
            O && E.current.flush(),
              x.current &&
                (null == (r2 = global.document) ||
                  null == r2.removeEventListener ||
                  r2.removeEventListener('visibilitychange', x.current),
                (x.current = null)),
              (h.current = false);
          }
        );
      },
      [O],
    ),
    D
  );
}
function i(r2, n2) {
  return r2 === n2;
}
function l(n2, t2, l2) {
  var a2 = (l2 && l2.equalityFn) || i,
    o = (0, import_react.useRef)(n2),
    f = (0, import_react.useState)({})[1],
    v = c(
      (0, import_react.useCallback)(
        function (r2) {
          (o.current = r2), f({});
        },
        [f],
      ),
      t2,
      l2,
      f,
    ),
    d = (0, import_react.useRef)(n2);
  return a2(d.current, n2) || (v(n2), (d.current = n2)), [o.current, v];
}
function a(r2, n2, t2) {
  var e2 = void 0 === t2 ? {} : t2,
    u2 = e2.leading,
    i2 = e2.trailing,
    l2 = e2.flushOnExit;
  return c(r2, n2, {
    maxWait: n2,
    leading: void 0 === u2 || u2,
    trailing: void 0 === i2 || i2,
    flushOnExit: void 0 !== l2 && l2,
  });
}
export {
  l as useDebounce,
  c as useDebouncedCallback,
  a as useThrottledCallback,
};
//# sourceMappingURL=use-debounce.js.map

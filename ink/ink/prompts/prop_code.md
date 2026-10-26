Write the three.js code of ONE animated 3D prop (a visual metaphor) for a vertical 9:16 video engine.

THE PROP TO BUILD (invented by the creative director):
{spec}

CONTRACT (must follow exactly)
- Your ```js block is the BODY of a function `function (THREE, K) {{ ... }}` running in strict mode. It must `return` a factory:
  `return (P, o, W) => {{ ...; return {{ g, focus: [x, y, z], size, update(t) {{ ... }} }}; }};`
- `P` palette (hex strings): P.accent, P.accent2, P.cool, P.side, P.rock, P.floor, P.char, P.ink. Use only these colours.
- `o` scene options chosen by the director (all optional: always default them, e.g. `const t0 = K.A(o.fill, o.at ?? .5)`). Timed options may be numbers or `{{at: seconds}}`; read them with `K.A(v, default)`.
- `W.sc` is the THREE.Scene: build everything in one `THREE.Group` g, then `K.shadowy(g); W.sc.add(g);`. The world (floating island floor at y = 0, lights, sky) already exists. Do not add lights, fog, renderer, camera or DOM.
- Size: the prop stands on y = 0 around the origin, about 2–5 units tall, within x,z ∈ [-3, 3]. `focus` = the point the camera looks at (usually mid-height of the prop), `size` = 0.6–1.4 (camera distance factor; 1 ≈ a 5-unit-tall object).
- `update(t)`: t = seconds since the scene started (0 → about 8). It must be a PURE function of t (the engine seeks to random times and renders frames in parallel): set every position/rotation/scale/colour from t each call, never accumulate state between calls. No Math.random, Date, timers or requestAnimationFrame: for pseudo-random use `K.rnd(i)` (0..1, deterministic).
- Motion must be readable and real: 3–5 beats over ~0–7 s following the spec's beats (ease with K.io / K.out3 / K.back over `(t - start) / duration`, they clamp to 0..1). Something should visibly move from the first second (a gentle idle motion), and the main change should be clear.
- Primitives only (BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, ConeGeometry, CapsuleGeometry, TubeGeometry with CatmullRomCurve3, LatheGeometry, ExtrudeGeometry from a THREE.Shape, InstancedMesh for many copies). At most ~300 meshes (use InstancedMesh + K.setI for more). Create geometries and materials once (outside update).
- Style: 3D minimalist, soft pastel, smooth rounded shapes (more segments on curved geometry), matte materials via `K.mat(colour, {{roughness, metalness, transparent, opacity, emissive, emissiveIntensity}})`, `K.gold(P)` for one precious/highlight material.

KIT K (already the channel's look; prefer these to raw THREE where they fit)
- K.mat(colour, opts) → MeshStandardMaterial · K.gold(P) → shared shiny accent material · K.shadowy(obj) → cast/receive shadows
- K.label(text, {{bg, color, h}}) → a THREE.Sprite with short text (h = height in units, default .42). Use at most 2 labels, 1–3 words each, only if the spec needs words (texts come from `o`, e.g. `o.labels`).
- K.person(P, colour?) → {{g, j}}: a faceless figure ~1.9 units tall standing on y = 0; K.pose(p, kind, t, k) animates it (kind: 'idle'|'walk'|'run'|'think'|'point'|'cheer'|'slump'|'carry'). Position it with p.g.position/rotation and add p.g to your group. Call K.pose every update.
- K.coins(P, n) → InstancedMesh of n coins; K.setI(instancedMesh, i, x, y, z, rx, ry, rz, scale) then set `.instanceMatrix.needsUpdate = true`.
- K.cl(x, a = 0, b = 1) clamp · K.io(t) ease in-out · K.out3(t) ease out · K.back(t) overshoot · K.lerp(a, b, t) · K.rnd(i) · K.TAU

EXAMPLE (an existing prop, for the shape of the code only; do not copy its idea):
```js
const {{ mat, gold, label, person, pose, shadowy, A, lerp, out3 }} = K;
return (P, o, W) => {{
  const g = new THREE.Group(), t0 = A(o.fill, o.at ?? .5), du = o.dur ?? 2.5;
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 40, 1, true), mat('#ffffff', {{ transparent: true, opacity: .22, roughness: .05, side: THREE.DoubleSide }}));
  jar.position.y = 1.6; g.add(jar);
  const lvl = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 1, 40), gold(P)); g.add(lvl);
  const p = person(P); p.g.position.set(-1.9, 0, .7); p.g.rotation.y = .7; g.add(p.g);
  shadowy(g); W.sc.add(g);
  return {{
    g, focus: [0, 2.0, 0], size: 1.0,
    update(t) {{
      const v = lerp(o.from ?? .1, o.to ?? .6, out3((t - t0) / du)) * 3.1;
      lvl.scale.y = Math.max(.01, v); lvl.position.y = v / 2 + .05;
      pose(p, t > t0 + du ? 'cheer' : 'point', t, .6);
    }}
  }};
}};
```

FEEDBACK FROM THE LAST TEST RENDER: {feedback}

ANSWER FORMAT: one ```js block (the function body), then one ```json block:
{{"params": {{"option name": "meaning, type, default (in Vietnamese, for the director)"}}, "example": {{ a good `o` for a 6-second scene }}}}

# STREAK — POCOBERI design direction

A strawberry-chocolate confectionery design language, derived from a Japanese
candy carton and rebuilt as interface. Nothing is lifted from the reference —
the *rules* behind it are extracted and re-applied to buttons, cards,
backgrounds and motion.

---

## 1. Brand settings

| | |
|---|---|
| **Maker** | POCOBERI (ポコベリ) — a small "study sweets" house |
| **Product** | STREAK — a focus timer, streak card and task box, sold as one kit |
| **Mascot** | BERI-CHAN — a cone sprite with a leaf sprout, dot eyes, berry blush |
| **Tagline** | *little things, every day · こつこつ* |
| **Voice** | cheerful, small-batch, never corporate. Lowercase UI labels ("start", "add group"), tiny uppercase captions on tabs ("FOCUS", "DAILY", "TASKS") |
| **Promise** | studying is packaged as a treat: one square tin of time, one of streaks, one open box of tasks |

The name POCOBERI is invented for this project — it exists so the site has a
maker's mark to sign, the way the reference carton carries one.

## 2. Design analysis — what was extracted

**Colour.** The reference runs on five inks: a hot printing red, a pale pink
chocolate, cream paper, dark chocolate brown, and one loud accent (yellow) with
a leaf green for the fruit. Crucially the *outline colour is brown, not black* —
that single choice is what makes the whole thing read as sweet rather than
graphic. The site uses the same:

```
cream   #fff7ee   paper ground        (≈60% of the surface)
cream-2 #ffeede   panel ground
blush   #f8b9c6   pink chocolate      (≈20% — fills, group headers)
berry   #e1323c   packaging red       (≈8% — headings, scallops, alerts)
cocoa   #4a2b22   every outline, all body text  (≈10%)
butter  #ffd24a   the yellow panel    (≈2% — active state only)
leaf    #57b15a   the calyx           (success only)
```

Butter and leaf are rationed deliberately: yellow means "this is the one
selected", green means "finished". Spending them anywhere else would kill the
signal.

**Shape.** Three motifs carry the whole system:

- **Cone** — the candy silhouette: flared sides, a fluted skirt, a pink cap over
  a chocolate body. Used as the checkbox stamp, the marker riding the progress
  bar, confetti, and the mascot's body.
- **Berry** — seeded body plus calyx. Used as the streak-day stamp and confetti.
- **Scallop** — the wavy red band along the carton's edge. Becomes the top band
  of every panel, so each card reads as a box lid.

**Field.** The reference's all-over strawberry print would fight with a working
UI, so it is reduced to its seeds: a faint, irregular seed tile at 13% opacity.
The pattern survives; the noise doesn't.

**Construction.** Thick outlines and hard offset shadows come from print, where
ink traps and drop shadows are flat. Every object gets a 3px cocoa border and a
hard, un-blurred cocoa shadow — no soft shadows anywhere in the site.

**Rhythm.** 4px base unit. Panels 22px radius, cards 16px, pills fully round.
Scallop band 18px desktop / 12px mobile. Shadow 5px desktop, 3px mobile, 2px
inside the mobile tins — the offset shrinks with the object so small controls
don't look like they're floating.

**Type.** Packaging typography is heavy, rounded, and tight. Baloo 2 (800) for
display — the wordmark, clock, percentage, streak counts. M PLUS Rounded 1c for
everything else, which keeps the Japanese-confectionery roundness at UI sizes.
The wordmark is cream with a cocoa stroke and a two-step blush/berry offset —
the same trick as a printed logo with two spot colours behind it.

### Second reference — the multipack bag

The bag adds five things the carton didn't have, all now in the site:

- **A green flash callout.** Its speech bubble becomes Beri-chan's, and it
  talks: how many things are left, "focus mode — go!" while the timer runs,
  "yatta! おつかれ" when it finishes, "all done — yatta!" at 100%.
- **A blue quantity badge** (12袋入り). The task count is now that badge — sky
  blue, cocoa-outlined, tilted a degree and a half.
- **A lucky-star flash.** Earned rather than printed: tick today off and a
  butter star with spinning berry rays appears on the streak tin.
- **Music notes.** The mascot's ♪ marks now pop off a task and drift upward as
  you tick it.
- **The strawberry print itself,** which the carton only implied — a staggered
  berry tile now sits under the seed field at 5.5% opacity.

## 3. UI mapping

Every interactive object is a **candy tablet**: cocoa outline, hard shadow,
squishes into its own shadow when pressed.

| Element | Treatment |
|---|---|
| Panel | box lid — scalloped berry band, flavour tab, cocoa edge |
| Primary button | blush fill (start, add group) |
| Secondary | cream fill (reset, clear finished) |
| Danger | berry outline, inverting to berry fill when armed (clear all) |
| Nudge − / + | butter squares — the accent marks "adjust me" |
| Preset chips | mini tablets; the active one turns butter |
| Checkbox | an empty wrapper; ticking stamps a cone into it |
| Streak day | a wrapper that fills with a berry |
| Progress | a candy tube of diagonal blush stripes, a cone riding the tip; turns leaf-green and seamless at 100% |
| Due date | a dashed ticket that goes solid once set; butter → blush → berry as it gets closer, then late |
| Group header | blush band with its own berry stripe underneath |
| Task count | the bag's blue quantity badge |
| Mascot bubble | the bag's green flash, with contextual lines |
| Lucky star | the bag's yellow flash, earned by ticking today |
| Steps | hung off a dotted blush string |

**Nothing scrolls, on any screen.** Desktop and mobile both lock to the viewport
height; only the task list scrolls, inside its own box. On short desktop windows
the kit compacts in two tiers (smaller wordmark, clock and day wrappers, tighter
padding, then the sub-captions drop away) rather than spilling off the bottom.
Mobile keeps the two square tins and the task box worked out earlier.

## 3b. Skins

The kit ships in two inks. A skin swaps **only** CSS custom properties on
`<html>` — every shape, outline, shadow, motif and animation carries over
untouched, which is the test of whether a design language is really a system.

| | **candy** (default) | **mono** |
|---|---|---|
| Paper | `#fff7ee` cream | `#ffffff` white |
| Ink | `#4a2b22` cocoa | `#111111` black |
| Fill | `#f8b9c6` blush | `#e4e4e1` grey |
| Accent | berry red / butter / leaf | greys, one value apart |
| Print | red seeds + berries | none |
| Lid | scalloped berry band | a flat 7px rule |
| Radius | 22 / 16 / pill | 10 / 8 / 8 |
| Display type | Baloo 2 | Inter |

Mono is **not** the candy skin desaturated — greyscale sweets still read as
sweets. It removes the charm rather than draining it: no strawberry print, no
scalloped lids, no floating cones, no mascot or speech bubble, no lucky star,
no cone riding the progress bar, no ♪ off a tick, and no Japanese sub-marks.
Checkboxes take a plain tick, streak days fill as solid squares, the progress
bar is one flat block, corners tighten and the display face swaps to Inter.
What survives is the structure: thick outlines, hard offset shadows, the same
grid and the same motion.

Four things had colour or shape baked into data-URIs and were lifted into
variables to allow this: the background field (`--field`), the scalloped band
(`--scallop`), the wordmark's drop shadows (`--sh1`/`--sh2`), and the display
font (`--display`). The confetti reads the live palette at fire time — and in
mono throws plain chips instead of cones and berries — and the browser
theme-colour follows the skin.

The switcher sits beside the maker's mark as two sample chips. Switching runs a
**curtain**: a panel wipes down from the top, the palette swaps behind it while
a loading bar runs, then it wipes away — about 1.3s, so the change lands as a
deliberate re-print rather than a flicker. Under `prefers-reduced-motion` the
swap is instant with no curtain. The choice is saved with everything else.

## 4. Animation — things that move when touched

Nothing loops for decoration alone; each motion reports something.

**Ambient**
- Floating cones and berries bob on their own timing (7–11s) and **lean toward
  the pointer** with per-motif depth (12–36%), giving parallax on the desktop.
  On a phone, scroll position drives the same lean.
- Beri-chan bobs at rest, wiggles on hover, and **tumbles 360° when tapped**.
- Panels spring in on load, staggered 50/90/130ms.

**Feedback**
- Buttons lift and tilt 1.5° on hover, squish into their shadow on press.
- Chips hop when they become active.
- Ticking stamps the cone in with a scale-and-rotate overshoot; a half-done task
  shows the cone at 45% opacity.
- Streak days pop and lift 3px on hover; the berry stamps in on tick.
- The progress bar springs to its new width, its stripes roll continuously while
  work is outstanding, and the cone marker slides along the tip.
- Newly added groups scroll into view and flash butter-yellow.
- Group cards pop in as they enter the scrolling list (IntersectionObserver).
- The clock breathes while running and pulses green when time is up.

**Celebration (100%)**
- 74 pieces of cone, berry and sparkle confetti fall with per-piece sway and
  spin, drawn on canvas.
- The bar turns leaf-green, the marker cone tumbles, and a card springs up with
  Beri-chan hopping.

**Sound**
- The finish chime is a synthesised four-note major arpeggio (C6·E6·G6·C7), each
  note a sine body with two struck partials and a long decay, plus a ring-out
  and a low sweetener underneath. No audio file to load.
- One shared AudioContext, unlocked on the first interaction and resumed before
  every play — browsers (Safari especially) silence a context created cold,
  which is the usual reason a timer chime never arrives.
- **Every 30 minutes of focus** a marker sounds: two quick triangle blips a
  fourth apart, clipped at 0.13s with no ring — about a quarter-second in total
  against the bell's second and a half, so the two can never be confused. Two
  oscillators against the finish chime's eighteen.
- The marker counts *focused* time, not wall clock: pausing banks the elapsed
  time and resuming carries on, and it is skipped if the finish bell is within
  three seconds. The timer note and Beri-chan both call the milestone
  ("1½ hours of focus — keep going").
- A butter-yellow ♪ toggle under the timer turns both off; the choice is saved.

**Restraint** — everything above is disabled under
`prefers-reduced-motion: reduce`, including the confetti.

---

*Fonts load from Google Fonts (Baloo 2, M PLUS Rounded 1c); if they're blocked
the stack falls back to the system rounded face and the layout holds.*

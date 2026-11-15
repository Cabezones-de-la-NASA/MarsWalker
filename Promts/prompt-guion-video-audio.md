# Prompt History — Storytelling, Script, Video, and Voiceover (MarsWalk)

This document records the prompts, tools, and models used to design the storytelling, write the 8-slide script, produce the prologue audiovisual clips, and generate the voiceover for the demonstration video in the **Interplanetary Survival Guide: Martian Map** category (NASA Space Apps Challenge 2026).

---

## Tools and Models Declaration

| Role | Tool / Platform | Model / Voice / Details |
| :--- | :--- | :--- |
| **Narrative ideation, scriptwriting, video/audio prompts, and technical integration** | **Antigravity** | **Argon (Orchestrator)** |
| **Voice generation (main narration / voiceover)** | **ElevenLabs** | Voice: **`The Pharaoh - Wisdom Bearer`** (model `Eleven Multilingual v2`) |
| **Video and ambient audio generation** | **Google Flow** | **Omni 1.2 Flash** / Veo |
| **Auxiliary prompt and soundscape/SFX generation** | **Gemini** | Web version (browser) |

---

## 1. Storytelling Ideation and Earth → Mars Connection (Antigravity · Argon)

### 1.1 Narrative diagnosis and challenge alignment
> I'd like your opinion on how we can improve what already exists, what we're missing, and how closely we're sticking to the challenge while making the most of the dataset we were given. Also, your visual and storytelling recommendations strongly inspired by the best video games and websites.

> Wait, before that, I'd like to keep discussing how we can stand out—we need to deliver something that hooks the user, that connects their life on Earth with Mars. What do you think?

> Explain everything clearly, remember I have to present it in a 30-second video—what would we show as a demo?

> Also tell me the exact texts we should put in the narrative, rewrite the flow again.

### 1.2 Protagonist background (Hydrologist) and initial prologue structure
> I like the idea of showing the whole journey from liftoff to arriving on Mars. But I feel there should be something more, a backstory—like humanity coming to an end (nuclear wars, pollution), the astronaut's previous life, and their reasons to evacuate. What do you say?

> Look, I'd like it to go like this: after pressing the start journey button, a black screen appears with this text: *"Before you put on this helmet, you were a hydrologist in a city where children could no longer go outside without a mask. Droughts, industrial pollution, and wars over water emptied the streets you once knew."* Then a first-person POV video of the astronaut looking at a polluted city in front of them, then the astronaut looks down at their helmet, and again a black screen with the text... Next, a video of the astronaut walking toward the rocket (third-person side view), immediately followed by a black screen with the text *"You didn't board this rocket to escape. You boarded it because humanity needs a plan for survival beyond its cradle… and answers before Earth crosses the point of no return."* What do you think?

### 1.3 Prologue clip iteration
> My idea is to make the videos—could you give me prompts to generate the videos with the right ambient audio?
> There's a small issue with video 1: they're looking at their helmet, yet in the reflection the astronaut is already wearing the helmet (the reflection shows it). How do I fix that?
> How would you advise me to use Google Flow for this?
> I think we're missing a video showing the astronaut in the cabin looking up at the sky with a countdown going from 3 to 1; from there I'll put a black screen and I want another video showing the rocket lifting off from Earth. What do you think?
> Actually, video 4 is in first person.
> I'd like that after liftoff there's another video of the spacecraft leaving Earth and suddenly stranded in space, but it has to show it exiting Earth's atmosphere.

---

## 2. Video and Soundscape Prompts (Google Flow · Omni 1.2 Flash and Gemini Browser)

### 2.1 Google Flow (`Omni 1.2 Flash`) — Planet Mars and MRO Satellite

#### Mars rotating in deep space
```text
A realistic high-definition video of planet Mars slowly rotating in the pitch-black void of deep space. Beautiful reddish-orange surface details, canyons, and polar ice caps visible under distant sunlight, stark contrast against the dark background.
```

#### Mars Reconnaissance Orbiter (MRO)
```text
Mars Reconnaissance Orbiter (MRO) satellite floating gracefully in empty dark space, detailed solar panels, high-gain antenna, slow motion cinematic pan.
```

---

### 2.2 Google Flow (`Omni 1.2 Flash`) — Cinematic Prologue Sequence

#### Video 1 (10 s) — Distant liftoff from cracked dry earth (ground-level POV)
```text
Single continuous 10-second photorealistic first-person ground-level POV cinematic shot, 16:9 widescreen, 35mm lens, mature sci-fi drama aesthetic like Interstellar. The observer camera is positioned several kilometers away from a distant launch complex, standing on parched, deeply cracked dry earth beside a dried-up riverbed. The dystopian Earth environment is choked by dense amber-gray industrial smog, drifting fine gray ash, and dust blowing across the barren ground under a dim, sunless overcast sky, with faint silhouettes of industrial cooling towers in the hazy distance. Far on the horizon, a massive NASA heavy-lift orbital rocket (white upper stages, burnt-orange core tank, twin white solid boosters) ignites with a blinding burst of fire that illuminates the thick smog from within. From 0 to 4 seconds, the rocket lifts off vertically from the pad, billowing a colossal plume of glowing exhaust and dense smoke. From 4 to 10 seconds, the handheld observer camera smoothly tilts upward to follow the rocket climbing straight up into the sky, piercing through the dark layer of polluted clouds as a towering column of fire and smoke connects the ground to the heavens. Subtle natural human breathing motion and a slight vibration as the distant shockwave hits. Realistic atmospheric haze and scale, no HUD, no on-screen text, no cuts. Audio: Desolate dry wind blowing dust across cracked earth, brief eerie quiet right after the distant visual ignition due to speed-of-sound delay, followed by a deep, earth-shaking sub-bass rocket roar and crackling atmospheric thunder rolling across the landscape. No music, no dialogue.
```

#### Video 2 (5 s) — First-person view of polluted city → tilting down to helmet (no helmet reflection)
```text
Single continuous 5-second photorealistic first-person POV cinematic shot, 16:9 widescreen, 35mm lens, shallow depth of field. The viewer is a bareheaded human scientist NOT wearing a helmet yet. At 0–2.5 seconds, the camera looks out from an elevated concrete balcony over a vast dystopian Earth megacity choked by dense amber-gray industrial smog, dry cracked riverbeds, distant cooling towers, and drifting ash under a dim overcast sky. At 2.5–5 seconds, the camera tilts downward to look at the person's own gloved hands holding a detached oval off-white and graphite space helmet at a slight angle. The dark matte smoked-bronze visor is angled slightly upward so its glass reflects ONLY the smoky amber sky, drifting ash, and polluted city skyline above — NO person, NO face, and NO helmet reflected in the visor glass. Sleeves are desaturated mustard-yellow technical fabric with graphite wrist joints. Natural breathing camera motion, realistic hands with five fingers, mature sci-fi drama aesthetic like Interstellar. Negative prompt: reflection of a helmet, helmeted reflection, double helmet, mirror selfie, text, HUD, cuts. Audio: Muffled desolate wind howling across an empty city, distant low industrial hum and faint faraway emergency siren echoing through smog, close intimate sound of slow human breathing, and subtle heavy fabric rustle as the hands hold the helmet. No music, no dialogue.
```

#### Video 3 (5 s) — Third-person lateral walk toward the rocket launchpad
```text
Single continuous 5-second photorealistic cinematic lateral tracking shot (side profile view, left to right), 16:9 widescreen, 50mm anamorphic lens. A lone adult human astronaut in a realistic worn off-white woven EVA suit with desaturated mustard-yellow sleeves, graphite elbow and knee joints, compact rectangular white life-support backpack, and a close-fitting oval helmet with a dark smoked-bronze visor walks with slow, heavy, determined steps from left to right across a weathered concrete launchpad toward the base and boarding ramp of a towering orbital rocket in the background. Fine gray ash and industrial dust drift through the air against a moody amber-gray polluted twilight sky. Warm orange gantry lights illuminate the metallic hull of the rocket and cast a rim light along the astronaut's helmet visor and mustard sleeve. Camera tracks smoothly sideways at waist-to-shoulder height alongside the astronaut. Authentic human gait with clear heel-to-toe foot contact, realistic knee flexion, subtle backpack inertia. No sliding feet, no cuts, no text, no logos, no weapons. Audio: Heavy measured spacesuit boot footsteps on concrete, pressurized helmet breathing inside the suit, low metallic creak of launch gantry in the wind, and a deep sub-bass rumble of rocket engines building up in the distance.
```

#### Video 4 (5 s) — Cockpit interior and `03 → 02 → 01` countdown
```text
Single continuous 5-second photorealistic cinematic shot inside a cramped spacecraft cockpit during launch countdown, 16:9 widescreen, 35mm close-up angle. The astronaut in the off-white EVA suit with desaturated mustard-yellow shoulder panels and oval helmet with a dark smoked-bronze visor is strapped into the command seat, tilted back, looking up through the overhead reinforced glass window at the gloomy amber-gray sky above. On the side instrument bezel, a crisp glowing amber digital display counts down cleanly: "03", then "02", then "01". As the countdown reaches 1, intense warm orange rocket ignition light floods up from below, reflecting across the bronze helmet visor and cockpit glass while the entire cabin begins to shake and vibrate powerfully. Authentic physical camera shake, dramatic rim lighting, Interstellar / First Man movie aesthetic. No morphing helmet, no cuts. Audio: Tense pressurized cabin ambience, three synchronized electronic NASA telemetry countdown beeps with a calm radio control voice counting "Three... Two... One...", muffled breathing inside the helmet, and a massive rising low-frequency rocket engine ignition roar that shakes the cockpit metal at the end.
```

---

### 2.3 Gemini (Browser) — Adrift Spacecraft and Soundscapes / Audio SFX

#### Spacecraft exiting the atmosphere and stranded in deep space (10 s)
```text
Single continuous 10-second photorealistic cinematic space shot, 16:9 widescreen, IMAX 65mm aesthetic like Interstellar and Gravity.
At 0–2 seconds, a sleek white and graphite interplanetary spacecraft with subtle orange markings rockets away from the curved horizon of a hazy, smog-covered Earth in the background, its main thruster glowing with a bright blue-white plasma flame.
At 2–5 seconds, the main engine suddenly sputters with a brief blue electrical flash and shuts off completely, venting a small puff of frozen gas.
At 5–10 seconds, all propulsion dies and the spacecraft is left drifting powerless, silent, and stranded in the vast, pitch-black emptiness of deep space. The camera slowly pulls back, making the silent drifting ship look tiny and isolated against the immense starfield as Earth shrinks in the distance.
Hard realistic orbital sunlight, deep stark shadows, zero-gravity inertia, no sci-fi lasers, no text, no cuts.
Audio: Deep resonant thruster hum for the first 2 seconds, followed by a sudden mechanical power-down thud and electrical fizzle, dropping instantly into eerie, dead-silent vacuum with only a very faint, lonely metallic hull creak and distant muffled radio static.
```
*Follow-up adjustment in Gemini (browser):*
> `remove the planet` (`quita el planeta`)

#### Soundscapes and sound effects (SFX)
- **Walk to the rocket (5 s):**
  ```text
  Cinematic sci-fi launchpad soundscape, 5 seconds: four slow heavy spacesuit boot footsteps on concrete, muffled breathing inside a pressurized helmet, cold wind with blowing dust, and a deep low-frequency rocket engine pre-ignition rumble growing in the background.
  ```
- **Desolate transition and radiation crackle (4 s):**
  ```text
  Deep minimalist cinematic sub-bass boom fading into eerie quiet wind and a faint Geiger-like atmospheric crackle, somber and intimate, 4 seconds.
  ```
- **Hermetic helmet seal (4 s):**
  ```text
  Mechanical metallic space helmet latch locking shut with a crisp pneumatic air seal hiss, followed by a deep resonant low-frequency cinematic pulse and claustrophobic suit breathing, 4 seconds.
  ```

---

## 3. Evolution of the 8-Slide Script (Antigravity · Argon)

### 3.1 Initial draft and review against NASA Space Apps criteria
> I wrote an 8-slide script draft (for the intro video). What do you think—does it reflect what we built well, and will it sell our idea to the judges? Remember we are competing in this category (*Interplanetary Survival Guide: Martian Map*).

1. *Before you put on this helmet, you were a hydrologist in a city where children could no longer go outside without a mask...*
2. *Droughts, industrial pollution, and wars over water emptied the streets you once knew...*
3. *You didn't board this rocket to escape. You boarded it because humanity needs a plan for survival beyond its cradle… and answers before Earth crosses the point of no return.*
4. *Starting today, every message you send to those you left behind will take up to 22 minutes to arrive.*
5. *Fortunately, NASA has been photographing Mars from space for decades, but seeing the entire planet doesn't tell you whether the rock right in front of your boots will make you slip or whether the ground is a quicksand trap.*
6. *Wait, you're not going in blind. The MRO, Mars Odyssey, and Mars Global Surveyor orbiters, along with the Perseverance rover, mapped Jezero Crater so that your visor now knows where to land.*
7. *To help you with your journey, you are equipped with a Marswalk: an EVA planner fusing real NASA HiRISE and CTX topography with spectral, thermal, and weather layers. Its algorithms plot routes that avoid deadly slopes, adapting to the xEMU suit's life support system and your crew's pace. On a full-scale surface, you collect samples guided by images from Perseverance, and when a MEDA dust storm strikes, you are immediately evacuated to the shelter.*
8. *And remember, on Earth, a map tells you how to get there. 225 million kilometers from home, a map decides whether you'll breathe again...*

### 3.2 Compact version and Slide 7 iteration
> I like it, could you give me an alternative with a bit less text?
> I feel Slide 7 is missing a bit of text.

**Optimized 8-slide text:**
1. *"Before this helmet, you were a hydrologist in a city where children could no longer go outside without a mask..."*
2. *"Droughts, pollution, and wars over water emptied the streets you once knew..."*
3. *"You didn't board this rocket to escape. You came to study a planet that lost its oceans—before Earth reaches the point of no return."*
4. *"From today on, every message home takes up to 22 minutes to arrive. Out here, no one can guide your steps in real time."*
5. *"NASA has mapped Mars from orbit for decades—but a global view won't tell you if the rock ahead will make you slip."*
6. *"You're not going in blind. MRO, Mars Odyssey, and Perseverance fuse HiRISE terrain, thermal, spectral, and weather data into one map."*
7. *"To guide every step, MarsWalk plots safe EVA routes that avoid deadly slopes, adapting to your crew’s pace and xEMU life support. On the surface, your helmet HUD, rover companion, and real Perseverance imagery help you collect samples—and evacuate to the shelter when a MEDA dust storm strikes."*
8. *"Remember: on Earth, a map tells you how to get there. 225 million kilometers from home, a map decides whether you'll breathe again..."*

---

## 4. Voice Design and 30-Second Demo Script Compression

### 4.1 Prompts for voice direction and generation (ElevenLabs and Google Flow)
> I'd like to generate audio of a raspy, masculine voice narrating the text—how can I request that in prompts?
> I'm using Google Flow, but it won't let me generate pure audio, only video. I think I could ask for a video with a black background and just the voice narrating the text.
> I think it should be a slightly older voice, around 60 years old.
> I'm testing narrating the text alongside the videos; I'll use ElevenLabs to combine the audio and videos I generated. What prompt do you recommend?

- **Selected ElevenLabs Voice:** **`The Pharaoh - Wisdom Bearer`** (using `Eleven Multilingual v2`).
- **Backup Voice Design prompt (ElevenLabs):**
  ```text
  A 60-year-old American male with a deep, raspy, gravelly baritone voice. Weathered, gruff, and world-weary vocal texture, like an aging veteran astronaut recording a solemn mission log. Slow, deliberate cinematic pacing with gravitas, subtle breathiness, and crisp close-mic studio clarity.
  ```
- **Template used for isolated voice tests in Google Flow:**
  ```text
  Pitch black screen, minimal faint dust motes in total darkness, static frame. Audio: A 60-year-old male narrator with an aged, deep, raspy, gravelly baritone voice, gruff and weathered vocal cords, speaking with slow, deliberate, solemn cinematic pacing, close-mic studio voiceover. No background music, no sound effects, no ambient hum. The old male narrator says in English: "[SCRIPT LINE]"
  ```

### 4.2 Demo script duration iterations (`1:16` → `36 s` → `27 s`)

#### Iteration 1: Extended web demo script (1 min 16 s)
> I want you to give me the narrative texts I will put in the demo.
> With all that text, the audio lasts 1:16.

*(Covered 7 detailed scenes: orbit above Jezero, fusion of 5 NASA layers, routing engine + xEMU telemetry, capsule descent + visor HUD, exploration with the 6×6 rover + Perseverance + real photos, MEDA storm + evacuation to Base NS-02, and closing).*

#### Iteration 2: Summarized story + demo version (36 s in ElevenLabs)
```text
Before this helmet, you were a hydrologist watching Earth run out of water. Now, you're at Jezero Crater searching for answers—twenty-two light-minutes from home. <break time="0.5s" />
To survive, you use MarsWalk: an E-V-A planner fusing five NASA layers—Hi-RISE terrain, CRISM minerals, thermal inertia, and MEDA weather. <break time="0.5s" />
Plot routes tuned to your ex-E-M-U suit, drop in through your helmet HUD, explore alongside Perseverance and a six-by-six rover, and evacuate when dust storms hit. <break time="0.6s" />
Out here, a map decides whether you'll breathe again.
```

#### Iteration 3 (Final chosen script): Optimized for 30 seconds (~27–28 s · 45 words)
> Almost—I used that option, but it was 36 seconds.
> I chose this one; tell me which videos to use and their duration.

```text
You were a hydrologist watching Earth run out of water. Now you're at Jezero Crater, twenty-two light-minutes from home.

Your lifeline is MarsWalk: fusing five NASA layers—terrain, minerals, thermal, and weather—to plot safe routes.

Drop in via your helmet HUD, explore with Perseverance, and outrun dust storms.

Out here, a map decides if you'll breathe again.
```

---

## 5. Synchronized Editing Timeline (0:00 – 0:28)

| Time | Duration | Narration (`The Pharaoh - Wisdom Bearer`) | Video / Web Demo Visual |
| :--- | :---: | :--- | :--- |
| **0:00 – 0:04** | 4 s | *"You were a hydrologist watching Earth run out of water."* | Dystopian Earth / smog-choked city / putting on the helmet |
| **0:04 – 0:08.5** | 4.5 s | *"Now you're at Jezero Crater, twenty-two light-minutes from home."* | Web: spacecraft cabin and vertical orbital zoom into Jezero |
| **0:08.5 – 0:11** | 2.5 s | *"Your lifeline is MarsWalk:"* | Web: 3D orbital view tilting across the crater with the full UI |
| **0:11 – 0:15.5** | 4.5 s | *"fusing five NASA layers—terrain, minerals, thermal, and weather—"* | Web: toggling layers (HiRISE, slope, hazard, CRISM, THEMIS) and weather |
| **0:15.5 – 0:18** | 2.5 s | *"to plot safe routes."* | Web: illuminated arrow route and O₂ / crew health telemetry |
| **0:18 – 0:20.5** | 2.5 s | *"Drop in via your helmet HUD,"* | Web: parachute capsule descent and first-person visor HUD activation |
| **0:20.5 – 0:23** | 2.5 s | *"explore with Perseverance,"* | Web: walking alongside Perseverance / 6×6 rover and NASA sample card |
| **0:23 – 0:25** | 2 s | *"and outrun dust storms."* | Web: MEDA dust storm alert and evacuation toward Base NS-02 |
| **0:25 – 0:28** | 3 s | *"Out here, a map decides if you'll breathe again."* | Closing shot in the Martian storm → **MarsWalk** title card |

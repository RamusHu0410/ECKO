https://devpost.com/software/ecko

# 🎵 ECKO

> *Hum a melody. Get a masterpiece.*

---

## ✨ Inspiration

Have you ever had a melody stuck in your head but had no idea how to turn it into music?
Most people lose their chance of creating their own music, but now we provide a solution!

---

## 🎯 What it does

Introduce **ECKO**, where you can simply **hum a melody, autocomplete the accompaniment, and modify the music** with no composing experience required.

After completing your masterpiece, post it into the community discussion hub and explore your passion while discussing each other's piece!

---

## 🛠️ How we built it

**Python + TypeScript**

We have utilized sponsor materials, such as Tiger Data, Gemini, ElevenLabs, Auth0, and GoDaddy Domain.

We have explored a completely new way of music generation; we transpose the complete composing rules and workflows in musician society into codes, which bring higher accuracy and more interesting harmonies while preserving the melody user hum.

Gemini is used, along with ElevenLabs, to assist the user in editing the music. It modifies the complex parameters of music generations and allows the user to do **ANY edits** to implement their ideas *(including but not limited to changing the mood, adding new instrument lines, and switching to Star Wars themes)*.

The community discussion hub is built with Auth0 and Tiger Data, and our overall deployment uses free websites from the GoDaddy domain.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python |
| Frontend | TypeScript |
| AI / Generation | Gemini, ElevenLabs |
| Auth | Auth0 |
| Database | Tiger Data |
| Hosting | GoDaddy |

---

## 🧩 Challenges we ran into

When we are converting audio to data, besides the melody, a lot of noise has been recorded and thus our generator treats it as a part of the melody.

**Solution:** We solved this by adjusting parameters of the audio converter and wrapping the melody with a restriction function to eliminate short noise notes.

---

## 🏆 Accomplishments that we're proud of

- Explored a completely new way of music generation, based on music theory rules.
- This new method can create more harmonically pleasant sounds and takes less time to process.
- Allowing users to edit their music with no edit caps.

---

## 📚 What we learned

- Current market demands on composition-style apps
- Structure of sound waves and how sounds become data
- Long-term maintainable programming
- Stress management and resolving conflict between teams

---

## 🚀 What's next for ECKO

- Expand the input choices such that the instrument besides the voice
- Add an education section where users can study how our composition works and how to modify the complex parameters   

